import type { Patient, Projection, SimPose, TubeState, ExposureState, RadiographResult } from "./types";
import { sampleAnatomy, hashPatient, type Paths, type SampleCtx } from "./anatomy";
import { augmentRadiographicAnatomy } from "./radiographic-anatomy-geometry";
import { refineRadiographicAnatomy } from "./radiographic-anatomy-refinement";
import { addSharedOrganPaths } from "./shared-anatomy-sampling";
import { addSharedTissueLayers } from "./shared-tissue-sampling";
import { buildMetrics, fieldScatter, incidentFluence, muEffective, partThickness } from "./exposure";
import { clamp, fbm } from "./geometry";
import { projectionGeometry } from "./projection-physics";
import { scoreExposure } from "./scoring";
import { caseById } from "./case-bank";
import type { PathologyId } from "./requests";

function pathsToOD(p: Paths, kvp: number): number {
  return muEffective("air", kvp) * p.air + muEffective("lung", kvp) * p.lung + muEffective("fat", kvp) * p.fat + muEffective("soft", kvp) * p.soft * 1.05 + muEffective("bone", kvp) * p.bone * 1.15 + muEffective("cortical", kvp) * p.cortical * 1.35 + muEffective("air", kvp) * p.gas * 40 + muEffective("metal", kvp) * p.metal;
}

function localCoords(projection: Projection, tube: TubeState, pose: SimPose, px: number, py: number, w: number, h: number, geometry: ReturnType<typeof projectionGeometry>): { x: number; y: number } {
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

function applyRadiographicMicrotexture(paths: Paths, x: number, y: number, seed: number, projection: Projection) {
  const bone = paths.bone + paths.cortical * 1.8;
  if (bone > 0.12) {
    const coarse = fbm(x * 1.6, y * 1.6, seed + 101) - 0.5;
    const trab = fbm(x * 7.5, y * 7.5, seed + 103) - 0.5;
    const fine = fbm(x * 16, y * 16, seed + 107) - 0.5;
    paths.bone += bone * coarse * 0.06;
    paths.cortical += Math.max(0, bone) * fine * 0.035;
    paths.soft += Math.max(0, trab) * 0.015;
  }
  if (projection.region === "Thorax") {
    paths.lung += Math.max(0, fbm(x * 3.8, y * 3.8, seed + 109) - 0.5) * 0.09;
    paths.soft += Math.max(0, fbm(x * 1.1, y * 1.1, seed + 113) - 0.5) * 0.025;
  }
}

function stampMarker(img: ImageData, w: number, h: number, letter: "L" | "R", x: number, y: number) {
  const glyph = letter === "L" ? L_GLYPH : R_GLYPH, scale = 5;
  const put = (px: number, py: number, r: number, gg: number, b: number) => { if (px < 0 || py < 0 || px >= w || py >= h) return; const o = (py * w + px) * 4; img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255; };
  for (let gy = 0; gy < glyph.length; gy++) for (let gx = 0; gx < glyph[gy]!.length; gx++) if (glyph[gy]![gx] === "#") {
    for (let oy = -1; oy <= scale; oy++) for (let ox = -1; ox <= scale; ox++) put(x + gx * scale + ox, y + gy * scale + oy, 10, 10, 12);
    for (let oy = 0; oy < scale; oy++) for (let ox = 0; ox < scale; ox++) put(x + gx * scale + ox, y + gy * scale + oy, 250, 250, 255);
  }
}
const L_GLYPH = ["#    ", "#    ", "#    ", "#    ", "#####"], R_GLYPH = ["#### ", "#   #", "#### ", "#  # ", "#   #"];

export async function renderRadiograph(args: { patient: Patient; projection: Projection; pose: SimPose; tube: TubeState; exposure: ExposureState; pathologyId?: PathologyId; caseId?: string | null; width?: number; height?: number; }): Promise<RadiographResult> {
  const { patient, projection, pose, tube, exposure, pathologyId = "none", caseId } = args;
  const simCase = caseById(caseId);
  const aspect = tube.collimationW / tube.collimationH;
  const height = args.height ?? 768;
  const width = args.width ?? Math.round(height * aspect);
  const kvp = exposure.kvp, grid = exposure.grid;
  const geometry = projectionGeometry(projection, tube, pose, exposure.focalSpot);
  const I0 = incidentFluence(kvp, exposure.mas, tube.sid, grid);
  const thickness = partThickness(patient, projection);
  const scatterFrac = fieldScatter(tube.collimationW, tube.collimationH, thickness, grid);
  const seed = hashPatient(patient.id);
  const ctx: SampleCtx = { patient, projection, pose, seed };
  const signal = new Float32Array(width * height);
  let sum = 0;

  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    const { x, y } = localCoords(projection, tube, pose, px, py, width, height, geometry);
    const paths = sampleAnatomy(x, y, ctx);
    augmentRadiographicAnatomy(paths, ctx);
    refineRadiographicAnatomy(paths, x, y, patient, projection, pose, seed);
    if (projection.anatomy === "torso-ap" || projection.anatomy === "torso-lat") {
      addSharedTissueLayers(paths, x, y, patient, pose);
      addSharedOrganPaths(paths, x, y, patient, pose);
      addPacemaker(paths, x, y, projection, simCase?.device === "pacemaker");
    }
    applyRadiographicMicrotexture(paths, x, y, seed, projection);
    let od = pathsToOD(paths, kvp) * (0.72 + thickness / 32);
    od = Math.max(0.01, od + pathologyDelta(pathologyId, x, y, projection));
    const T = Math.exp(-od);
    const boneMask = paths.bone > 0.18 || paths.cortical > 0.08 ? 1 : 0;
    const trabFine = (fbm(x * 12, y * 12, seed + 17) - 0.5) * 0.055;
    const trabCoarse = (fbm(x * 2.2, y * 2.2, seed + 19) - 0.5) * 0.045;
    const softVar = (fbm(x * 0.75, y * 0.75, seed + 23) - 0.5) * 0.025 * (paths.soft > 1 ? 1 : 0);
    const trabecula = 1 + boneMask * (trabFine + trabCoarse) + softVar;
    const localScatter = I0 * scatterFrac * (0.28 + 0.72 * clamp((paths.soft + paths.lung + paths.fat) / 8, 0, 1));
    let sig = I0 * T * trabecula + localScatter;
    if (paths.air > 20 && paths.soft < 0.2 && paths.bone < 0.2) sig = I0 * 1.02 + localScatter * 0.18;
    signal[py * width + px] = sig;
    sum += sig;
  }

  const n = width * height, mean = sum / n, well = 320;
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const g = canvas.getContext("2d")!; const img = g.createImageData(width, height);
  let sat = 0, noiseAcc = 0, contrastAcc = 0, contrastN = 0;
  const logMean = Math.log(mean + 1e-5);
  const contrastScale = clamp((kvp - 45) / 80, 0, 1);
  const windowW = projection.region === "Thorax" ? 2.85 + contrastScale * 1.35 : 1.8 + contrastScale * 2.0;
  const windowL = logMean + (mean > 100 ? 0.15 : mean < 10 ? -0.25 : 0);
  const noiseGain = 0.24 + 1.35 / Math.sqrt(Math.max(0.25, mean / 40));
  const blurRadius = clamp(Math.round(geometry.geometricUnsharpnessMm * 1.7), 0, 4);
  const blurWeight = blurRadius > 0 ? Math.min(0.35, geometry.geometricUnsharpnessMm * 0.14) : 0;

  for (let i = 0; i < n; i++) {
    let sig = signal[i]!; const nx = i % width, ny = (i / width) | 0;
    if (blurRadius > 0 && nx > blurRadius && nx < width - blurRadius - 1) {
      let neighbour = 0, count = 0;
      for (let dx = 1; dx <= blurRadius; dx++) { const falloff = 1 / (dx + 1); neighbour += (signal[i - dx]! + signal[i + dx]!) * falloff; count += 2 * falloff; }
      if (count > 0) sig = sig * (1 - blurWeight) + (neighbour / count) * blurWeight;
    }
    const sigma = noiseGain / Math.sqrt(Math.max(0.35, sig));
    const nse = (fbm(nx * 1.15, ny * 1.15, seed + 31) - 0.5) * 2 * sigma * 7.5;
    sig = Math.max(0, sig + nse); noiseAcc += Math.abs(nse);
    if (sig > well) { sig = well; sat += 1; }
    const L = Math.log(sig + 1e-5);
    let d = 1 - clamp((L - windowL) / windowW + 0.5, 0, 1);
    if (kvp >= 100) d = 0.08 + d * 0.84;
    else if (kvp <= 55) d = d < 0.5 ? d * 0.85 : 0.5 + (d - 0.5) * 1.15;
    let tone = clamp(d, 0, 1);
    tone = tone * tone * (3 - 2 * tone);
    const v = Math.round(clamp(tone, 0, 1) * 255), o = i * 4;
    img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; img.data[o + 3] = 255;
    if (nx > 0) { contrastAcc += Math.abs(v - img.data[(i - 1) * 4]!); contrastN++; }
  }

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
