import type { Patient, Projection, SimPose, TubeState, ExposureState, RadiographResult } from "./types";
import { sampleAnatomy, hashPatient, type Paths, type SampleCtx } from "./anatomy";
import { addSharedOrganPaths } from "./shared-anatomy-sampling";
import { addSharedTissueLayers } from "./shared-tissue-sampling";
import { samplePaChest } from "./pa-chest-model";
import { buildMetrics, fieldScatter, incidentFluence, partThickness } from "./exposure";
import { clamp, fbm } from "./geometry";
import { projectionGeometry } from "./projection-physics";
import { atlasBoneOpticalDensity, muFromHU } from "./atlas-radiograph";
import { scoreExposure } from "./scoring";
import { caseById } from "./case-bank";
import type { PathologyId } from "./requests";

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

export function preloadRadiographAssets(_projections: Projection[]) { /* no-op */ }

function localCoords(projection: Projection, patient: Patient, pose: SimPose, px: number, py: number, w: number, h: number, tube: TubeState, geometry: ReturnType<typeof projectionGeometry>): { x: number; y: number } {
  const cmX = ((px + 0.5) / w - 0.5) * tube.collimationW / geometry.magnification;
  const cmY = ((py + 0.5) / h - 0.5) * tube.collimationH / geometry.magnification;
  const angle = (tube.angle * Math.PI) / 180;
  const angleShift = Math.tan(angle) * geometry.oidCm;
  const oblique = (pose.oblique * Math.PI) / 180;
  const ry = cmY * Math.cos(oblique) - cmX * Math.sin(oblique) * 0.18 - angleShift;
  const lateral = projection.anatomy === "torso-lat" || projection.anatomy === "cspine-lat" || projection.anatomy === "skull-lat";
  if (lateral) return { x: tube.crX + cmX, y: tube.crY + ry };
  const rotation = (pose.rotationY * Math.PI) / 180;
  const rx = cmX * Math.cos(rotation);
  if (projection.anatomy === "torso-ap" || projection.anatomy === "shoulder-ap") return { x: tube.crX + rx, y: tube.crY + ry };
  return { x: rx + tube.crX * 0.15, y: ry + (tube.crY - projection.cr.y) * 0.25 };
}

function ellipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
  return q < 1 ? 1 - q : 0;
}

function pathologyDelta(pathologyId: PathologyId, x: number, y: number, projection: Projection): number {
  if (projection.anatomy !== "torso-ap" && projection.anatomy !== "torso-lat") return 0;
  if (pathologyId === "consolidation") return 0.7 * ellipse(x, y, -5.5, 43, 5.5, 6.0);
  if (pathologyId === "pneumothorax") return -0.75 * ellipse(x, y, -8.5, 32, 5.5, 8.0);
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

function assertFrameQuality(signal: Float32Array, width: number, height: number, satFraction: number, mean: number): void {
  const n = width * height;
  if (n < 100) throw new Error("Render failed — detector matrix is too small.");
  if (satFraction > 0.55) throw new Error(`Render failed — image is severely over-exposed (${Math.round(satFraction * 100)}% of pixels saturated). Reduce kVp / mAs or use ‘Load standard technique’ before exposing again.`);
  if (!Number.isFinite(mean) || mean < 0.05) throw new Error("Render failed — almost no signal reached the detector (mean signal ≈ 0). Check collimation, patient positioning and exposure factors.");
  if (mean > 5000) throw new Error("Render failed — detector signal is unphysically high. Exposure factors or geometry are outside the valid simulation range.");
  let variance = 0;
  for (let i = 0; i < n; i++) { const d = signal[i]! - mean; variance += d * d; }
  variance /= n;
  if (variance < 0.8) throw new Error("Render failed — image has almost no anatomical structure (near-zero variance). This usually means the anatomy sampler or atlas projection returned empty data.");
  const rowMeans = new Float32Array(height);
  for (let y = 0; y < height; y++) { let rowSum = 0; for (let x = 0; x < width; x++) rowSum += signal[y * width + x]!; rowMeans[y] = rowSum / width; }
  let largeRowJumps = 0;
  for (let y = 1; y < height; y++) if (Math.abs(rowMeans[y]! - rowMeans[y - 1]!) > mean * 0.35) largeRowJumps++;
  if (largeRowJumps > height * 0.18) throw new Error("Render failed — strong horizontal banding detected. This indicates a geometry / coordinate-mapping or atlas depth-buffer error.");
}

export async function renderRadiograph(args: { patient: Patient; projection: Projection; pose: SimPose; tube: TubeState; exposure: ExposureState; pathologyId?: PathologyId; caseId?: string | null; width?: number; height?: number; }): Promise<RadiographResult> {
  const { patient, projection, pose, tube, exposure, pathologyId = "none", caseId } = args;
  try {
    const simCase = caseById(caseId);
    const aspect = tube.collimationW / tube.collimationH;
    const height = args.height ?? 768;
    const width = args.width ?? Math.round(height * aspect);
    if (width < 64 || height < 64 || width > 2048 || height > 2048) throw new Error(`Render failed — invalid detector size ${width}×${height}.`);
    const kvp = exposure.kvp;
    const grid = exposure.grid;
    const geometry = projectionGeometry(projection, tube, pose, exposure.focalSpot);
    const I0 = incidentFluence(kvp, exposure.mas, tube.sid, grid);
    const thickness = partThickness(patient, projection);
    const scatterFrac = fieldScatter(tube.collimationW, tube.collimationH, thickness, grid);
    const seed = hashPatient(patient.id);
    const ctx: SampleCtx = { patient, projection, pose, seed };
    const isPaChest = projection.id === "pa-chest";

    let atlasOD: Float32Array | null = null;
    let atlasError: string | null = null;
    try {
      atlasOD = await atlasBoneOpticalDensity({ patient, projection, pose, tube, exposureKvp: kvp, width, height, geometry });
    } catch (err) {
      atlasError = err instanceof Error ? err.message : String(err);
      console.warn("[Bucky Lab] Atlas bone projection failed:", atlasError);
    }
    const hasAtlas = atlasOD !== null;

    const signal = new Float32Array(width * height);
    let sum = 0;
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const { x, y } = localCoords(projection, patient, pose, px, py, width, height, tube, geometry);
        const paths = isPaChest ? samplePaChest(x, y, patient, pose, seed) : sampleAnatomy(x, y, ctx);
        if (hasAtlas) { paths.bone = 0; paths.cortical = 0; }
        if (!isPaChest && (projection.anatomy === "torso-ap" || projection.anatomy === "torso-lat")) {
          addSharedTissueLayers(paths, x, y, patient, pose, projection);
          addSharedOrganPaths(paths, x, y, patient, pose);
        }
        addPacemaker(paths, x, y, projection, simCase?.device === "pacemaker");
        const attenuationScale = isPaChest ? (hasAtlas ? 0.72 : 0.84) : (hasAtlas ? (0.65 + thickness / 45) : (0.55 + thickness / 40));
        const softOd = pathsToOD(paths, kvp) * attenuationScale;
        const atlasOd = atlasOD?.[py * width + px] ?? 0;
        const od = Math.max(0.01, softOd + atlasOd + pathologyDelta(pathologyId, x, y, projection));
        const T = Math.exp(-od);
        const boneMask = atlasOd > 0.012 || paths.bone > 0.22 || paths.cortical > 0.08 ? 1 : 0;
        const trabFine = (fbm(x * 3.2, y * 3.2, seed + 31) - 0.5) * (isPaChest ? 0.008 : 0.018);
        const trabCoarse = (fbm(x * 0.9, y * 0.9, seed + 37) - 0.5) * (isPaChest ? 0.005 : 0.012);
        const softVar = (fbm(x * 0.45, y * 0.45, seed + 11) - 0.5) * (isPaChest ? 0.008 : 0.018) * (paths.soft > 1 ? 1 : 0);
        const anatomicalTexture = 1 + boneMask * (trabFine + trabCoarse) + softVar;
        const scat = I0 * scatterFrac * (0.5 + 0.5 * (paths.soft + paths.lung > 0 ? 1 : 0.15));
        let sig = I0 * T * anatomicalTexture + scat;
        if (paths.air > 20 && paths.soft < 0.2 && atlasOd < 0.01 && paths.bone < 0.2) sig = I0 * 1.02 + scat * 0.12;
        signal[py * width + px] = sig;
        sum += sig;
      }
    }

    const n = width * height;
    const mean = sum / n;
    const well = 280;
    let satEstimate = 0;
    for (let i = 0; i < n; i++) if (signal[i]! > well) satEstimate++;
    assertFrameQuality(signal, width, height, satEstimate / n, mean);

    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const g = canvas.getContext("2d"); if (!g) throw new Error("Render failed — could not obtain 2D canvas context.");
    const img = g.createImageData(width, height);
    let sat = 0, noiseAcc = 0, contrastAcc = 0, contrastN = 0;
    const logMean = Math.log(mean + 1e-5);
    const contrastScale = clamp((kvp - 45) / 80, 0, 1);
    const windowW = isPaChest ? 2.85 : 1.7 + contrastScale * 2.2;
    const windowL = logMean + (isPaChest ? -0.02 : mean > 100 ? 0.15 : mean < 10 ? -0.25 : 0);
    const baseNoiseGain = 0.08 + 0.38 / Math.sqrt(Math.max(0.5, mean / 40));
    const noiseGain = isPaChest ? baseNoiseGain * 0.34 : baseNoiseGain;
    const blurRadius = clamp(Math.round(geometry.geometricUnsharpnessMm * 1.25), 0, 3);
    const blurWeight = blurRadius > 0 ? Math.min(0.28, geometry.geometricUnsharpnessMm * 0.11) : 0;

    for (let i = 0; i < n; i++) {
      let sig = signal[i]!;
      const nx = i % width, ny = (i / width) | 0;
      if (blurRadius > 0 && nx > blurRadius && nx < width - blurRadius - 1) {
        let neighbour = 0, count = 0;
        for (let dx = 1; dx <= blurRadius; dx++) { const falloff = 1 / (dx + 1); neighbour += (signal[i - dx]! + signal[i + dx]!) * falloff; count += 2 * falloff; }
        if (count > 0) sig = sig * (1 - blurWeight) + (neighbour / count) * blurWeight;
      }
      const sigma = noiseGain / Math.sqrt(Math.max(0.5, sig));
      const nse = (fbm(nx * 0.42, ny * 0.42, seed + 4) - 0.5) * 2 * sigma * (isPaChest ? 1.0 : 3);
      sig = Math.max(0, sig + nse); noiseAcc += Math.abs(nse);
      if (sig > well) { sig = well; sat += 1; }
      const L = Math.log(sig + 1e-5);
      let d = 1 - clamp((L - windowL) / windowW + 0.5, 0, 1);
      if (kvp >= 100) d = isPaChest ? 0.045 + d * 0.91 : 0.08 + d * 0.84;
      else if (kvp <= 55) d = clamp(d < 0.5 ? d * 0.9 : 0.5 + (d - 0.5) * 1.1, 0, 1);
      let tone = clamp(d, 0, 1); tone = tone * tone * (3 - 2 * tone);
      const v = Math.round(clamp(tone, 0, 1) * 255), o = i * 4;
      img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; img.data[o + 3] = 255;
      if (nx > 0) { contrastAcc += Math.abs(v - img.data[(i - 1) * 4]!); contrastN++; }
    }

    assertFrameQuality(signal, width, height, sat / n, mean);
    const markerLetter = exposure.marker === "L" || exposure.marker === "R" ? exposure.marker : "R";
    stampMarker(img, width, height, markerLetter, Math.round(width * 0.08), Math.round(height * 0.12));
    g.putImageData(img, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    const metrics = buildMetrics(mean, noiseAcc / n, contrastN ? contrastAcc / contrastN / 255 : 0, sat / n, patient, projection, exposure, tube);
    const scores = scoreExposure({ patient, projection, pose, tube, exposure, metrics });
    const overall = scores.reduce((a, c) => a + c.weight * gradeNum(c.grade), 0) / scores.reduce((a, c) => a + c.weight, 0);
    const overallGrade = overall >= 0.85 ? "excellent" : overall >= 0.62 ? "acceptable" : "repeat";
    if (atlasError && !hasAtlas) console.warn("[Bucky Lab] Radiograph generated with procedural bone only. Atlas error was:\n" + atlasError);
    return { metrics, scores, overall, overallGrade, width, height, dataUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("Render failed")) throw err;
    throw new Error(`Render failed — ${message}`);
  }
}

function gradeNum(g: "excellent" | "acceptable" | "repeat"): number { return g === "excellent" ? 1 : g === "acceptable" ? 0.7 : 0.25; }

function stampMarker(img: ImageData, w: number, h: number, letter: "L" | "R", x: number, y: number) {
  const glyph = letter === "L" ? L_GLYPH : R_GLYPH, scale = 5;
  const put = (px: number, py: number, r: number, gg: number, b: number) => { if (px < 0 || py < 0 || px >= w || py >= h) return; const i = (py * w + px) * 4; img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255; };
  for (let gy = 0; gy < glyph.length; gy++) for (let gx = 0; gx < glyph[gy]!.length; gx++) if (glyph[gy]![gx]) for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) put(x + gx * scale + sx, y + gy * scale + sy, 245, 245, 245);
}
const L_GLYPH = [[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,1]];
const R_GLYPH = [[1,1,1,1,0],[1,0,0,0,1],[1,1,1,1,0],[1,0,1,0,0],[1,0,0,1,0]];
