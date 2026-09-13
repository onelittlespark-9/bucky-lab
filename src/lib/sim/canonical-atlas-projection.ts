import type { Patient, Projection, TubeState } from "./types";
import type { ProjectionGeometry } from "./projection-physics";
import { wholeBodyAtlasOpticalDensity } from "./whole-body-atlas";
import { wholeBodyAtlasTissueOpticalDensity } from "./whole-body-tissue-atlas";

const CANONICAL_W_CM = 60;
const CANONICAL_H_CM = 180;
const CANONICAL_CR_Y_CM = 85;
const CACHE = new Map<string, Promise<{ bone: Float32Array | null; tissue: Float32Array | null; width: number; height: number }>>();

export function usesCanonicalAtlasProjection(projection: Projection) {
  return projection.id === "ap-full-body" || projection.anatomy === "torso-ap" || projection.anatomy === "shoulder-ap";
}

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }
function smoothstep01(v: number) { const t = clamp01(v); return t * t * (3 - 2 * t); }

function sampleBilinear(src: Float32Array, sw: number, sh: number, u: number, v: number) {
  if (u < 0 || v < 0 || u > sw - 1 || v > sh - 1) return 0;
  const x0 = Math.floor(u), y0 = Math.floor(v);
  const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
  const fx = u - x0, fy = v - y0;
  const a = src[y0 * sw + x0]!, b = src[y0 * sw + x1]!;
  const c = src[y1 * sw + x0]!, d = src[y1 * sw + x1]!;
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

async function canonicalMaps(args: {
  patient: Patient;
  projection: Projection;
  tube: TubeState;
  exposureKvp: number;
  geometry: ProjectionGeometry;
}) {
  const { patient, projection, tube, exposureKvp, geometry } = args;
  const baseWidth = 640;
  const baseHeight = 1920;
  const canonicalTube: TubeState = {
    ...tube,
    crX: 0,
    crY: CANONICAL_CR_Y_CM,
    collimationW: CANONICAL_W_CM,
    collimationH: CANONICAL_H_CM,
  };
  const key = [patient.id, patient.heightCm, patient.weightKg, exposureKvp, geometry.magnification.toFixed(5)].join("|");
  let pending = CACHE.get(key);
  if (!pending) {
    pending = Promise.all([
      wholeBodyAtlasOpticalDensity({
        patient,
        projection,
        tube: canonicalTube,
        exposureKvp,
        width: baseWidth,
        height: baseHeight,
        geometry,
      }),
      wholeBodyAtlasTissueOpticalDensity({
        patient,
        tube: canonicalTube,
        exposureKvp,
        width: baseWidth,
        height: baseHeight,
        geometry,
      }),
    ]).then(([bone, tissue]) => ({ bone, tissue, width: baseWidth, height: baseHeight }));
    CACHE.set(key, pending);
  }
  return pending;
}

function cropCanonical(
  src: Float32Array | null,
  sw: number,
  sh: number,
  tube: TubeState,
  geometry: ProjectionGeometry,
  width: number,
  height: number,
) {
  if (!src) return null;
  const out = new Float32Array(width * height);
  for (let py = 0; py < height; py++) {
    const cmY = ((py + 0.5) / height - 0.5) * tube.collimationH / geometry.magnification;
    const globalY = tube.crY + cmY;
    const v = (globalY / CANONICAL_H_CM) * (sh - 1);
    for (let px = 0; px < width; px++) {
      const cmX = ((px + 0.5) / width - 0.5) * tube.collimationW / geometry.magnification;
      const globalX = tube.crX + cmX;
      const u = (0.5 + globalX / CANONICAL_W_CM) * (sw - 1);
      out[py * width + px] = sampleBilinear(src, sw, sh, u, v);
    }
  }
  return out;
}

function calibrateCanonicalTissue(
  tissue: Float32Array | null,
  width: number,
  height: number,
  tube: TubeState,
  geometry: ProjectionGeometry,
) {
  if (!tissue) return null;
  const out = new Float32Array(tissue);

  // Distance from the body boundary, measured in detector pixels. Tangential rays should
  // traverse less tissue, so soften only the first few pixels rather than creating a bright rim.
  const dist = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) dist[i] = out[i]! > 0.0012 ? 7 : 0;
  for (let pass = 0; pass < 6; pass++) {
    const next = new Uint8Array(dist);
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (!dist[i]) continue;
      const d = Math.min(dist[i - 1]!, dist[i + 1]!, dist[i - width]!, dist[i + width]!) + 1;
      next[i] = Math.min(next[i]!, d);
    }
    dist.set(next);
  }

  for (let py = 0; py < height; py++) {
    const cmY = ((py + 0.5) / height - 0.5) * tube.collimationH / geometry.magnification;
    const globalY = tube.crY + cmY;
    for (let px = 0; px < width; px++) {
      const i = py * width + px;
      const od = out[i]!;
      if (od <= 0) continue;
      const cmX = ((px + 0.5) / width - 0.5) * tube.collimationW / geometry.magnification;
      const globalX = tube.crX + cmX;

      const edgeDepth = smoothstep01((dist[i]! - 0.5) / 4.5);
      const edgeScale = 0.58 + 0.42 * edgeDepth;

      // The atlas already supplies the lung geometry. This bounded calibration only increases
      // the material contrast within the expected thoracic footprint; it does not replace or
      // move atlas anatomy. Preserve the mediastinum, heart and diaphragmatic bases.
      const rightLung = Math.exp(-Math.pow((globalX + 7.0) / 8.8, 2) - Math.pow((globalY - 37.0) / 15.5, 2));
      const leftLung = Math.exp(-Math.pow((globalX - 7.0) / 8.2, 2) - Math.pow((globalY - 37.5) / 15.0, 2));
      const lungEnvelope = Math.max(rightLung, leftLung);
      const mediastinum = Math.exp(-Math.pow(globalX / 3.4, 2) - Math.pow((globalY - 37.0) / 17.0, 2));
      const heart = Math.exp(-Math.pow((globalX - 3.0) / 5.3, 2) - Math.pow((globalY - 45.0) / 7.4, 2));
      const basalPreserve = smoothstep01((globalY - 49.0) / 6.0);
      const lungReduction = 0.24 * lungEnvelope * (1 - 0.88 * mediastinum) * (1 - 0.82 * heart) * (1 - 0.72 * basalPreserve);

      out[i] = Math.max(0, od * edgeScale * (1 - Math.max(0, lungReduction)));
    }
  }
  return out;
}

export async function canonicalAtlasProjection(args: {
  patient: Patient;
  projection: Projection;
  tube: TubeState;
  exposureKvp: number;
  width: number;
  height: number;
  geometry: ProjectionGeometry;
}) {
  const { patient, projection, tube, exposureKvp, width, height, geometry } = args;
  const maps = await canonicalMaps({ patient, projection, tube, exposureKvp, geometry });
  const bone = cropCanonical(maps.bone, maps.width, maps.height, tube, geometry, width, height);
  const tissueRaw = cropCanonical(maps.tissue, maps.width, maps.height, tube, geometry, width, height);
  return {
    bone,
    tissue: calibrateCanonicalTissue(tissueRaw, width, height, tube, geometry),
  };
}
