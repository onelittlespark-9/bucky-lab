import type { Patient, Projection, SimPose, TubeState, ExposureState, RadiographResult } from "./types";
import { sampleAnatomy, hashPatient, type Paths, type SampleCtx } from "./anatomy";
import { buildMetrics, fieldScatter, incidentFluence, muEffective, partThickness } from "./exposure";
import { clamp, fbm } from "./geometry";
import { scoreExposure } from "./scoring";
import type { PathologyId } from "./requests";

const PHOTO_CACHE = new Map<string, ImageData>();
const PHOTO_WAIT = new Map<string, Promise<ImageData | null>>();

function loadPhoto(src: string): Promise<ImageData | null> {
  if (PHOTO_CACHE.has(src)) return Promise.resolve(PHOTO_CACHE.get(src)!);
  const pending = PHOTO_WAIT.get(src);
  if (pending) return pending;
  const p = new Promise<ImageData | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext("2d");
      if (!g) {
        resolve(null);
        return;
      }
      g.drawImage(img, 0, 0);
      const data = g.getImageData(0, 0, c.width, c.height);
      PHOTO_CACHE.set(src, data);
      resolve(data);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
  PHOTO_WAIT.set(src, p);
  return p;
}

export function preloadRadiographAssets(projections: Projection[]) {
  for (const pr of projections) {
    if (pr.referenceImage) void loadPhoto(pr.referenceImage);
  }
}

function pathsToOD(p: Paths, kvp: number): number {
  return (
    muEffective("air", kvp) * p.air +
    muEffective("lung", kvp) * p.lung +
    muEffective("fat", kvp) * p.fat +
    muEffective("soft", kvp) * p.soft * 1.05 +
    muEffective("bone", kvp) * p.bone * 1.15 +
    muEffective("cortical", kvp) * p.cortical * 1.35 +
    muEffective("air", kvp) * p.gas * 40 +
    muEffective("metal", kvp) * p.metal
  );
}

function samplePhoto(photo: ImageData, u: number, v: number): number | null {
  if (u < 0 || v < 0 || u > 1 || v > 1) return null;
  const x = u * (photo.width - 1);
  const y = v * (photo.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(photo.width - 1, x0 + 1);
  const y1 = Math.min(photo.height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const idx = (xx: number, yy: number) => (yy * photo.width + xx) * 4;
  const g00 = photo.data[idx(x0, y0)]! / 255;
  const g10 = photo.data[idx(x1, y0)]! / 255;
  const g01 = photo.data[idx(x0, y1)]! / 255;
  const g11 = photo.data[idx(x1, y1)]! / 255;
  return g00 * (1 - fx) * (1 - fy) + g10 * fx * (1 - fy) + g01 * (1 - fx) * fy + g11 * fx * fy;
}

function invDisplay(g: number): number {
  const x = clamp(g, 0, 1);
  return Math.pow(1.001 - x, 2.1) * 0.15 + Math.pow(x, 2.4) * 0.02 + 0.004;
}

function localCoords(
  projection: Projection,
  patient: Patient,
  px: number,
  py: number,
  w: number,
  h: number,
  tube: TubeState,
): { x: number; y: number } {
  const mag = tube.sid / Math.max(80, tube.sid - 12);
  const cmX = ((px + 0.5) / w - 0.5) * tube.collimationW / mag;
  const cmY = ((py + 0.5) / h - 0.5) * tube.collimationH / mag;
  const angle = (tube.angle * Math.PI) / 180;
  const rx = cmX;
  const ry = cmY * Math.cos(angle) - Math.sin(angle) * 4;
  if (
    projection.anatomy === "torso-ap" ||
    projection.anatomy === "torso-lat" ||
    projection.anatomy === "cspine-lat" ||
    projection.anatomy === "shoulder-ap"
  ) {
    return { x: tube.crX + rx, y: tube.crY + ry };
  }
  if (projection.anatomy === "skull-lat") {
    return { x: rx, y: ry + (tube.crY - 10) * 0.4 };
  }
  return { x: rx + tube.crX * 0.15, y: ry + (tube.crY - projection.cr.y) * 0.25 };
}

function photoUV(
  projection: Projection,
  x: number,
  y: number,
  patient: Patient,
): { u: number; v: number } | null {
  if (!projection.referenceImage) return null;
  if (projection.id === "pa-chest") {
    const y0 = 12 * (patient.heightCm / 170);
    const y1 = 62 * (patient.heightCm / 170);
    const hw = 20 * patient.morph.torsoWidth;
    return { u: (x + hw) / (hw * 2), v: (y - y0) / (y1 - y0) };
  }
  if (projection.id === "pa-hand") {
    return { u: (x + 6) / 12, v: (8 - y) / 18 };
  }
  return null;
}

export async function renderRadiograph(args: {
  patient: Patient;
  projection: Projection;
  pose: SimPose;
  tube: TubeState;
  exposure: ExposureState;
  pathologyId?: PathologyId;
  width?: number;
  height?: number;
}): Promise<RadiographResult> {
  const { patient, projection, pose, tube, exposure } = args;
  const aspect = tube.collimationW / tube.collimationH;
  const height = args.height ?? 768;
  const width = args.width ?? Math.round(height * aspect);
  const photo = projection.referenceImage ? await loadPhoto(projection.referenceImage) : null;

  const kvp = exposure.kvp;
  const grid = exposure.grid;
  const I0 = incidentFluence(kvp, exposure.mas, tube.sid, grid);
  const thickness = partThickness(patient, projection);
  const scatterFrac = fieldScatter(tube.collimationW, tube.collimationH, thickness, grid);
  const seed = hashPatient(patient.id);
  const ctx: SampleCtx = { patient, projection, pose, seed };

  const signal = new Float32Array(width * height);
  let sum = 0;

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const { x, y } = localCoords(projection, patient, px, py, width, height, tube);
      const paths = sampleAnatomy(x, y, ctx);
      let od = pathsToOD(paths, kvp);
      od *= 0.55 + thickness / 40;

      let T = Math.exp(-od);
      if (photo) {
        const uv = photoUV(projection, x, y, patient);
        if (uv) {
          const g = samplePhoto(photo, uv.u, uv.v);
          if (g !== null) {
            const edge = Math.min(uv.u, uv.v, 1 - uv.u, 1 - uv.v) * 8;
            const fade = clamp(edge, 0, 1);
            const Tphoto = clamp(invDisplay(g) / 0.12, 0.002, 1);
            const habitus = Math.exp(-muEffective("soft", kvp) * (thickness - 22) * 0.35);
            T = T * (1 - fade) + Tphoto * habitus * fade;
          }
        }
      }

      const boneMask = paths.bone > 0.3 || paths.cortical > 0.15 ? 1 : 0;
      const trabFine = (fbm(x * 3.2, y * 3.2, seed) - 0.5) * 0.12;
      const trabCoarse = (fbm(x * 1.1, y * 1.1, seed + 3) - 0.5) * 0.07;
      const cortEdge = paths.cortical > 0.4 ? (fbm(x * 6, y * 6, seed + 7) - 0.5) * 0.05 : 0;
      const softVar = (fbm(x * 0.6, y * 0.6, seed + 11) - 0.5) * 0.04 * (paths.soft > 1 ? 1 : 0);
      const trabecula = 1 + boneMask * (trabFine + trabCoarse + cortEdge) + softVar;
      const scat = I0 * scatterFrac * (0.5 + 0.5 * (paths.soft + paths.lung > 0 ? 1 : 0.15));
      let s = I0 * T * trabecula + scat;
      if (paths.air > 20 && paths.soft < 0.2 && paths.bone < 0.2) {
        s = I0 * 1.05 + scat * 0.2;
      }
      signal[py * width + px] = s;
      sum += s;
    }
  }

  const n = width * height;
  const mean = sum / n;
  const well = 280;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d")!;
  const img = g.createImageData(width, height);

  let sat = 0;
  let noiseAcc = 0;
  let contrastAcc = 0;
  let contrastN = 0;

  const logMean = Math.log(mean + 1e-5);
  const contrastScale = clamp((kvp - 45) / 80, 0, 1);
  const windowW = 1.55 + contrastScale * 2.4;
  const windowL = logMean + (mean > 100 ? 0.2 : mean < 10 ? -0.35 : 0);
  const noiseGain = 0.35 + 1.8 / Math.sqrt(Math.max(0.25, mean / 40));
  const sidBlur = clamp((120 - tube.sid) / 80, 0, 1);

  for (let i = 0; i < n; i++) {
    let s = signal[i]!;
    const nx = i % width;
    const ny = (i / width) | 0;
    if (sidBlur > 0.05 && nx > 0 && nx < width - 1) {
      const left = signal[i - 1]!;
      const right = signal[i + 1]!;
      s = s * (1 - 0.22 * sidBlur) + (left + right) * 0.11 * sidBlur;
    }
    const sigma = noiseGain / Math.sqrt(Math.max(0.35, s));
    const nse = (fbm(nx * 0.85, ny * 0.85, seed + 4) - 0.5) * 2 * sigma * 10;
    s = Math.max(0, s + nse);
    noiseAcc += Math.abs(nse);
    if (s > well) {
      s = well;
      sat += 1;
    }
    const L = Math.log(s + 1e-5);
    let d = (L - windowL) / windowW + 0.5;
    d = 1 - clamp(d, 0, 1);
    if (kvp >= 100) {
      d = 0.08 + d * 0.84;
    } else if (kvp <= 55) {
      d = d < 0.5 ? d * 0.85 : 0.5 + (d - 0.5) * 1.15;
      d = clamp(d, 0, 1);
    }
    let tone = clamp(d, 0, 1);
    tone = tone * tone * (3 - 2 * tone);
    const v = Math.round(clamp(tone, 0, 1) * 255);
    const o = i * 4;
    img.data[o] = v;
    img.data[o + 1] = v;
    img.data[o + 2] = v;
    img.data[o + 3] = 255;
    if (nx > 0) {
      contrastAcc += Math.abs(v - img.data[(i - 1) * 4]!);
      contrastN++;
    }
  }

  const markerLetter = exposure.marker === "L" || exposure.marker === "R" ? exposure.marker : "R";
  stampMarker(img, width, height, markerLetter, Math.round(width * 0.08), Math.round(height * 0.12));
  drawCrosshair(img, width, height, width / 2, height / 2);

  g.putImageData(img, 0, 0);
  const dataUrl = canvas.toDataURL("image/png");

  const metrics = buildMetrics(
    mean,
    noiseAcc / n,
    contrastN ? contrastAcc / contrastN / 255 : 0,
    sat / n,
    patient,
    projection,
    exposure,
    tube,
  );
  const scores = scoreExposure({ patient, projection, pose, tube, exposure, metrics });
  const overall =
    scores.reduce((a, c) => a + c.weight * gradeNum(c.grade), 0) /
    scores.reduce((a, c) => a + c.weight, 0);
  const overallGrade = overall >= 0.85 ? "excellent" : overall >= 0.62 ? "acceptable" : "repeat";

  return { metrics, scores, overall, overallGrade, width, height, dataUrl };
}

function gradeNum(g: "excellent" | "acceptable" | "repeat"): number {
  return g === "excellent" ? 1 : g === "acceptable" ? 0.7 : 0.25;
}

function stampMarker(img: ImageData, w: number, h: number, letter: "L" | "R", x: number, y: number) {
  const glyph = letter === "L" ? L_GLYPH : R_GLYPH;
  const scale = 5;
  const put = (px: number, py: number, r: number, g: number, b: number) => {
    if (px < 0 || py < 0 || px >= w || py >= h) return;
    const o = (py * w + px) * 4;
    img.data[o] = r;
    img.data[o + 1] = g;
    img.data[o + 2] = b;
    img.data[o + 3] = 255;
  };
  for (let gy = 0; gy < glyph.length; gy++) {
    const row = glyph[gy]!;
    for (let gx = 0; gx < row.length; gx++) {
      if (row[gx] !== "#") continue;
      for (let oy = -1; oy <= scale; oy++) {
        for (let ox = -1; ox <= scale; ox++) {
          put(x + gx * scale + ox, y + gy * scale + oy, 10, 10, 12);
        }
      }
      for (let oy = 0; oy < scale; oy++) {
        for (let ox = 0; ox < scale; ox++) {
          put(x + gx * scale + ox, y + gy * scale + oy, 250, 250, 255);
        }
      }
    }
  }
}

const L_GLYPH = ["#    ", "#    ", "#    ", "#    ", "#####"];
const R_GLYPH = ["#### ", "#   #", "#### ", "#  # ", "#   #"];

function drawCrosshair(img: ImageData, w: number, h: number, cx: number, cy: number) {
  const set = (x: number, y: number, a: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const o = (y * w + x) * 4;
    img.data[o] = Math.round(img.data[o]! * (1 - a) + 220 * a);
    img.data[o + 1] = Math.round(img.data[o + 1]! * (1 - a) + 220 * a);
    img.data[o + 2] = Math.round(img.data[o + 2]! * (1 - a) + 200 * a);
  };
  for (let i = 8; i < 18; i++) {
    set((cx + i) | 0, cy | 0, 0.35);
    set((cx - i) | 0, cy | 0, 0.35);
    set(cx | 0, (cy + i) | 0, 0.35);
    set(cx | 0, (cy - i) | 0, 0.35);
  }
}
