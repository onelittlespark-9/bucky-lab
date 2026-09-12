import type { Patient, Projection, SimPose, TubeState, ExposureState, RadiographResult } from "./types";
import { sampleAnatomy, hashPatient, type Paths, type SampleCtx } from "./anatomy";
import { addSharedOrganPaths } from "./shared-anatomy-sampling";
import { addSharedTissueLayers } from "./shared-tissue-sampling";
import { buildMetrics, fieldScatter, incidentFluence, partThickness } from "./exposure";
import { clamp, fbm } from "./geometry";
import { projectionGeometry } from "./projection-physics";
import { atlasBoneOpticalDensity, muFromHU } from "./atlas-radiograph";
import { scoreExposure } from "./scoring";
import { caseById } from "./case-bank";
import type { PathologyId } from "./requests";

/**
 * Projection material model. HU is used only as a reproducible material-density
 * proxy; the displayed image is formed from Beer-Lambert attenuation rather
 * than drawing anatomical outlines onto the detector.
 */
function pathsToOD(p: Paths, kvp: number): number {
  return muFromHU(-1000, kvp) * p.air
    + muFromHU(-700, kvp) * p.lung
    + muFromHU(-90, kvp) * p.fat
    + muFromHU(45, kvp) * p.soft * 1.05
    + muFromHU(700, kvp) * p.bone
    + muFromHU(1200, kvp) * p.cortical
    + muFromHU(-1000, kvp) * p.gas * 40
    + muFromHU(3000, kvp) * p.metal;
}

// Reference radiographs are not composited into the generated image. The
// anatomy gallery is used as an anatomical/landmark reference; the simulator
// generates its own projection from the patient model and acquisition physics.
export function preloadRadiographAssets(_projections: Projection[]) { /* no-op */ }

function localCoords(projection: Projection, patient: Patient, pose: SimPose, px: number, py: number, w: number, h: number, tube: TubeState, geometry: ReturnType<typeof projectionGeometry>): { x: number; y: number } {
  const cmX = ((px + 0.5) / w - 0.5) * tube.collimationW / geometry.magnification;
  const cmY = ((py + 0.5) / h - 0.5) * tube.collimationH / geometry.magnification;
  const angle = (tube.angle * Math.PI) / 180;
  const angleShift = Math.tan(angle) * geometry.oidCm;
  const rotation = (pose.rotationY * Math.PI) / 180;
  const oblique = (pose.oblique * Math.PI) / 180;
  const rx = cmX * Math.cos(rotation) + cmY * Math.sin(rotation) * 0.12;
  const ry = cmY * Math.cos(oblique) - cmX * Math.sin(oblique) * 0.18 - angleShift;
  if (projection.anatomy === "torso-ap" || projection.anatomy === "torso-lat" || projection.anatomy === "cspine-lat" || projection.anatomy === "shoulder-ap") return { x: tube.crX + rx, y: tube.crY + ry };
  if (projection.anatomy === "skull-lat") return { x: rx, y: ry + (tube.crY - 10) * 0.4 };
  return { x: rx + tube.crX * 0.15, y: ry + (tube.crY - projection.cr.y) * 0.25 };
}

function ellipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
  return q < 1 ? 1 - q : 0;
}

function pathologyDelta(pathologyId: PathologyId, x: number, y: number, projection: Projection): number {
  if (projection.anatomy !== "torso-ap" && projection.anatomy !== "torso-lat") return 0;
  if (pathologyId === "consolidation") return 0.7 * ellipse(x, y, -5.5, 51, 6.5, 7.5);
  if (pathologyId === "pneumothorax") return -0.75 * ellipse(x, y, -8.5, 19, 6.5, 8.5);
  if (pathologyId === "rib-fracture") return 0.22 * ellipse(x, y, 10, 34, 1.2, 1.1);
  return 0;
}

function addPacemaker(paths: Paths, x: number, y: number, projection: Projection, enabled: boolean) {
  if (!enabled || (projection.anatomy !== "torso-ap" && projection.anatomy !== "torso-lat")) return;
  const generator = ellipse(x, y, -8, 29, 2.7, 3.4);
  const lead1 = Math.exp(-(((x + 3.5) ** 2) / 1.4 + ((y - 35) ** 2) / 34));
  const lead2 = Math.exp(-(((x + 4.5) ** 2) / 1.2 + ((y - 40) ** 2) / 38));
  paths.metal += (generator + lead1 + lead2) * 14;
}

export async function renderRadiograph(args: { patient: Patient; projection: Projection; pose: SimPose; tube: TubeState; exposure: ExposureState; pathologyId?: PathologyId; caseId?: string | null; width?: number; height?: number; }): Promise<RadiographResult> {
  const { patient, projection, pose, tube, exposure, pathologyId = "none", caseId } = args;
  const simCase = caseById(caseId);
  const aspect = tube.collimationW / tube.collimationH;
  const height = args.height ?? 768;
  const width = args.width ?? Math.round(height * aspect);
  const kvp = exposure.kvp;
  const grid = exposure.grid;
  const geometry = projectionGeometry(projection, tube, pose, exposure.focalSpot);
  const I0 = incidentFluence(kvp, exposure.mas, tube.sid, grid);
  const thickness = partThickness(patient, projection);
  const scatterFrac = fieldScatter(tube.collimationW, tube.collimationH, thickness, grid);
  const seed = hashPatient(patient.id);
  const ctx: SampleCtx = { patient, projection, pose, seed };

  // The atlas is the bone source of truth. Procedural bone is disabled when
  // atlas projection succeeds so the image cannot contain duplicated/offset
  // bone shapes from two independent anatomy systems.
  const atlasOD = await atlasBoneOpticalDensity({ patient, projection, pose, tube, exposureKvp: kvp, width, height, geometry });
  const hasAtlas = atlasOD !== null;
  const signal = new Float32Array(width * height);
  let sum = 0;

  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    const { x, y } = localCoords(projection, patient, pose, px, py, width, height, tube, geometry);
    const paths = sampleAnatomy(x, y, ctx);
    if (hasAtlas) {
      paths.bone = 0;
      paths.cortical = 0;
    }
    if (projection.anatomy === "torso-ap" || projection.anatomy === "torso-lat") {
      addSharedTissueLayers(paths, x, y, patient, pose);
      addSharedOrganPaths(paths, x, y, patient, pose);
      addPacemaker(paths, x, y, projection, simCase?.device === "pacemaker");
    }

    const softOd = pathsToOD(paths, kvp) * (hasAtlas ? (0.65 + thickness / 45) : (0.55 + thickness / 40));
    const atlasOd = atlasOD?.[py * width + px] ?? 0;
    let od = Math.max(0.01, softOd + atlasOd + pathologyDelta(pathologyId, x, y, projection));
    const T = Math.exp(-od);

    // Keep anatomical texture extremely low amplitude. Radiographs should show
    // continuous anatomical structures, not procedural speckle or line noise.
    const boneMask = atlasOd > 0.012 || paths.bone > 0.3 || paths.cortical > 0.15 ? 1 : 0;
    const trabFine = (fbm(x * 3.2, y * 3.2, seed + 31) - 0.5) * 0.018;
    const trabCoarse = (fbm(x * 0.9, y * 0.9, seed + 37) - 0.5) * 0.012;
    const softVar = (fbm(x * 0.45, y * 0.45, seed + 11) - 0.5) * 0.018 * (paths.soft > 1 ? 1 : 0);
    const anatomicalTexture = 1 + boneMask * (trabFine + trabCoarse) + softVar;
    const scat = I0 * scatterFrac * (0.5 + 0.5 * (paths.soft + paths.lung > 0 ? 1 : 0.15));
    let sig = I0 * T * anatomicalTexture + scat;
    if (paths.air > 20 && paths.soft < 0.2 && atlasOd < 0.01 && paths.bone < 0.2) sig = I0 * 1.02 + scat * 0.12;
    signal[py * width + px] = sig;
    sum += sig;
  }

  const n = width * height;
  const mean = sum / n;
  const well = 280;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d")!;
  const img = g.createImageData(width, height);
  let sat = 0, noiseAcc = 0, contrastAcc = 0, contrastN = 0;
  const logMean = Math.log(mean + 1e-5);
  const contrastScale = clamp((kvp - 45) / 80, 0, 1);
  const windowW = 1.7 + contrastScale * 2.2;
  const windowL = logMean + (mean > 100 ? 0.15 : mean < 10 ? -0.25 : 0);
  // Detector noise is deliberately subtle. The previous gain could turn low
  // signal areas into conspicuous grain, which made the image look synthetic.
  const noiseGain = 0.08 + 0.38 / Math.sqrt(Math.max(0.5, mean / 40));
  const blurRadius = clamp(Math.round(geometry.geometricUnsharpnessMm * 1.25), 0, 3);
  const blurWeight = blurRadius > 0 ? Math.min(0.28, geometry.geometricUnsharpnessMm * 0.11) : 0;

  for (let i = 0; i < n; i++) {
    let sig = signal[i]!;
    const nx = i % width, ny = (i / width) | 0;
    if (blurRadius > 0 && nx > blurRadius && nx < width - blurRadius - 1) {
      let neighbour = 0, count = 0;
      for (let dx = 1; dx <= blurRadius; dx++) {
        const falloff = 1 / (dx + 1);
        neighbour += (signal[i - dx]! + signal[i + dx]!) * falloff;
        count += 2 * falloff;
      }
      if (count > 0) sig = sig * (1 - blurWeight) + (neighbour / count) * blurWeight;
    }
    const sigma = noiseGain / Math.sqrt(Math.max(0.5, sig));
    const nse = (fbm(nx * 0.42, ny * 0.42, seed + 4) - 0.5) * 2 * sigma * 3;
    sig = Math.max(0, sig + nse);
    noiseAcc += Math.abs(nse);
    if (sig > well) { sig = well; sat += 1; }
    const L = Math.log(sig + 1e-5);
    let d = 1 - clamp((L - windowL) / windowW + 0.5, 0, 1);
    if (kvp >= 100) d = 0.08 + d * 0.84;
    else if (kvp <= 55) d = clamp(d < 0.5 ? d * 0.9 : 0.5 + (d - 0.5) * 1.1, 0, 1);
    let tone = clamp(d, 0, 1);
    tone = tone * tone * (3 - 2 * tone);
    const v = Math.round(clamp(tone, 0, 1) * 255), o = i * 4;
    img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; img.data[o + 3] = 255;
    if (nx > 0) { contrastAcc += Math.abs(v - img.data[(i - 1) * 4]!); contrastN++; }
  }

  // The side marker is part of the radiographic image. A projection-centre
  // crosshair is not, so it is intentionally omitted from the final image.
  const markerLetter = exposure.marker === "L" || exposure.marker === "R" ? exposure.marker : "R";
  stampMarker(img, width, height, markerLetter, Math.round(width * 0.08), Math.round(height * 0.12));
  g.putImageData(img, 0, 0);
  const dataUrl = canvas.toDataURL("image/png");
  const metrics = buildMetrics(mean, noiseAcc / n, contrastN ? contrastAcc / contrastN / 255 : 0, sat / n, patient, projection, exposure, tube);
  const scores = scoreExposure({ patient, projection, pose, tube, exposure, metrics });
  const overall = scores.reduce((a, c) => a + c.weight * gradeNum(c.grade), 0) / scores.reduce((a, c) => a + c.weight, 0);
  const overallGrade = overall >= 0.85 ? "excellent" : overall >= 0.62 ? "acceptable" : "repeat";
  return { metrics, scores, overall, overallGrade, width, height, dataUrl };
}

function gradeNum(g: "excellent" | "acceptable" | "repeat"): number { return g === "excellent" ? 1 : g === "acceptable" ? 0.7 : 0.25; }
function stampMarker(img: ImageData, w: number, h: number, letter: "L" | "R", x: number, y: number) {
  const glyph = letter === "L" ? L_GLYPH : R_GLYPH, scale = 5;
  const put = (px: number, py: number, r: number, gg: number, b: number) => { if (px < 0 || py < 0 || px >= w || py >= h) return; const i = (py * w + px) * 4; img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255; };
  for (let gy = 0; gy < glyph.length; gy++) for (let gx = 0; gx < glyph[gy]!.length; gx++) if (glyph[gy]![gx]) for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) put(x + gx * scale + sx, y + gy * scale + sy, 245, 245, 245);
}
const L_GLYPH = [[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,1]];
const R_GLYPH = [[1,1,1,1,0],[1,0,0,0,1],[1,1,1,1,0],[1,0,1,0,0],[1,0,0,1,0]];
