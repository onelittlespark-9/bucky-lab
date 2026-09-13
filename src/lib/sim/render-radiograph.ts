import type { Patient, Projection, SimPose, TubeState, ExposureState, RadiographResult } from "./types";
import { sampleAnatomy, hashPatient, type Paths, type SampleCtx } from "./anatomy";
import { addSharedOrganPaths } from "./shared-anatomy-sampling";
import { addSharedTissueLayers } from "./shared-tissue-sampling";
import { samplePaChest } from "./pa-chest-model";
import { sampleFullBody } from "./full-body-model";
import { buildMetrics, fieldScatter, incidentFluence, partThickness } from "./exposure";
import { clamp, fbm } from "./geometry";
import { projectionGeometry } from "./projection-physics";
import { atlasBoneOpticalDensity, muFromHU } from "./atlas-radiograph";
import { projectAtlasTissueOD } from "./atlas-tissue-projector";
import { canonicalAtlasProjection, usesCanonicalAtlasProjection } from "./canonical-atlas-projection";
import { scoreExposure } from "./scoring";
import { caseById } from "./case-bank";
import type { PathologyId } from "./requests";

function pathsToOD(p: Paths, kvp: number) {
  return muFromHU(-1000, kvp) * p.air + muFromHU(-700, kvp) * p.lung + muFromHU(-90, kvp) * p.fat +
    muFromHU(45, kvp) * p.soft * 1.05 + muFromHU(700, kvp) * p.bone + muFromHU(1200, kvp) * p.cortical +
    muFromHU(-1000, kvp) * p.gas * 40 + muFromHU(3000, kvp) * p.metal;
}
export function preloadRadiographAssets(_p: Projection[]) {}

function localCoords(projection: Projection, patient: Patient, pose: SimPose, px: number, py: number, w: number, h: number, tube: TubeState, geometry: ReturnType<typeof projectionGeometry>) {
  const cmX = ((px + .5) / w - .5) * tube.collimationW / geometry.magnification;
  const cmY = ((py + .5) / h - .5) * tube.collimationH / geometry.magnification;
  const angle = tube.angle * Math.PI / 180;
  const ry = cmY * Math.cos(pose.oblique * Math.PI / 180) - cmX * Math.sin(pose.oblique * Math.PI / 180) * .18 - Math.tan(angle) * geometry.oidCm;
  const lateral = projection.anatomy === "torso-lat" || projection.anatomy === "cspine-lat" || projection.anatomy === "skull-lat";
  if (lateral) return { x: tube.crX + cmX, y: tube.crY + ry };
  const rx = cmX * Math.cos(pose.rotationY * Math.PI / 180);
  if (projection.anatomy === "torso-ap" || projection.anatomy === "shoulder-ap" || projection.anatomy === "full-body-ap") return { x: tube.crX + rx, y: tube.crY + ry };
  return { x: rx + tube.crX * .15, y: ry + (tube.crY - projection.cr.y) * .25 };
}
function ellipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number) { const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; return q < 1 ? 1 - q : 0; }
function pathologyDelta(id: PathologyId, x: number, y: number, p: Projection) {
  if (p.anatomy !== "torso-ap" && p.anatomy !== "torso-lat") return 0;
  if (id === "consolidation") return .7 * ellipse(x, y, -5.5, 43, 5.5, 6);
  if (id === "pneumothorax") return -.75 * ellipse(x, y, -8.5, 32, 5.5, 8);
  if (id === "rib-fracture") return .22 * ellipse(x, y, 10, 34, 1.2, 1.1);
  return 0;
}
function addPacemaker(p: Paths, x: number, y: number, projection: Projection, on: boolean) {
  if (!on || (projection.anatomy !== "torso-ap" && projection.anatomy !== "torso-lat")) return;
  p.metal += (ellipse(x, y, -8, 29, 2.7, 3.4) + Math.exp(-(((x + 3.5) ** 2) / 1.4 + ((y - 35) ** 2) / 34)) + Math.exp(-(((x + 4.5) ** 2) / 1.2 + ((y - 40) ** 2) / 38))) * 14;
}

function assertFrameQuality(signal: Float32Array, width: number, height: number, satFraction: number, mean: number, minVariance = .025) {
  const n = width * height;
  if (n < 100) throw new Error("Render failed — detector matrix is too small.");
  if (satFraction > .82) throw new Error(`Render failed — image is severely over-exposed (${Math.round(satFraction * 100)}% of pixels saturated).`);
  if (!Number.isFinite(mean) || mean < .02) throw new Error("Render failed — almost no signal reached the detector.");
  let variance = 0;
  for (let i = 0; i < n; i++) { const d = signal[i]! - mean; variance += d * d; }
  if (variance / n < minVariance) throw new Error("Render failed — image has almost no anatomical structure.");
}
function percentile(values: number[], q: number) {
  if (!values.length) return 0;
  values.sort((a, b) => a - b);
  return values[Math.max(0, Math.min(values.length - 1, Math.round((values.length - 1) * q)))]!;
}
function blurScalar(src: Float32Array, w: number, h: number, radius: number) {
  if (radius <= 0) return new Float32Array(src);
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let d = -radius; d <= radius; d++) { const xx = Math.max(0, Math.min(w - 1, x + d)), wt = radius + 1 - Math.abs(d); s += src[y * w + xx]! * wt; n += wt; }
    tmp[y * w + x] = s / n;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let d = -radius; d <= radius; d++) { const yy = Math.max(0, Math.min(h - 1, y + d)), wt = radius + 1 - Math.abs(d); s += tmp[yy * w + x]! * wt; n += wt; }
    out[y * w + x] = s / n;
  }
  return out;
}
function smooth01(v: number) { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); }

function detectorTone(detectorOD: number, localOD: number, bodyWeight: number, anchors: { low: number; mid: number; high: number }, chest: boolean) {
  if (bodyWeight <= .002 && detectorOD < .004) return .025;
  const lowSpan = Math.max(.035, anchors.mid - anchors.low);
  const highSpan = Math.max(.060, anchors.high - anchors.mid);
  let base: number;
  if (detectorOD <= anchors.mid) {
    const t = clamp((detectorOD - anchors.low) / lowSpan, 0, 1);
    base = (chest ? .070 : .065) + (chest ? .405 : .410) * Math.pow(t, chest ? .92 : .88);
  } else {
    const t = clamp((detectorOD - anchors.mid) / highSpan, 0, 1);
    base = (chest ? .475 : .475) + (chest ? .385 : .365) * Math.pow(t, .78);
  }
  const span = Math.max(.12, anchors.high - anchors.low);
  const detail = clamp((detectorOD - localOD) / span, -.24, .24);
  let tone = base + detail * (chest ? .018 : .014);
  tone = clamp(tone, .035, .940);
  const pathWeight = smooth01(clamp((bodyWeight - .045) / .955, 0, 1));
  return .025 * (1 - pathWeight) + tone * pathWeight;
}

export async function renderRadiograph(args: { patient: Patient; projection: Projection; pose: SimPose; tube: TubeState; exposure: ExposureState; pathologyId?: PathologyId; caseId?: string | null; width?: number; height?: number; }): Promise<RadiographResult> {
  const { patient, projection, pose, tube, exposure, pathologyId = "none", caseId } = args;
  try {
    const simCase = caseById(caseId);
    const aspect = tube.collimationW / tube.collimationH;
    const height = args.height ?? 768;
    const width = args.width ?? Math.max(128, Math.round(height * aspect));
    if (width < 64 || height < 64 || width > 2048 || height > 2048) throw new Error(`Render failed — invalid detector size ${width}×${height}.`);

    const kvp = exposure.kvp, grid = exposure.grid;
    const geometry = projectionGeometry(projection, tube, pose, exposure.focalSpot);
    const I0 = incidentFluence(kvp, exposure.mas, tube.sid, grid);
    const thickness = partThickness(patient, projection);
    const scatterFrac = fieldScatter(tube.collimationW, tube.collimationH, thickness, grid);
    const seed = hashPatient(patient.id), ctx: SampleCtx = { patient, projection, pose, seed };
    const isPaChest = projection.id === "pa-chest", isWholeBody = projection.id === "ap-full-body", canonicalView = usesCanonicalAtlasProjection(projection), n = width * height;

    let atlasBone: Float32Array | null = null, atlasTissue: Float32Array | null = null, atlasError: string | null = null;
    try {
      if (canonicalView) {
        const maps = await canonicalAtlasProjection({ patient, projection, tube, exposureKvp: kvp, width, height, geometry });
        atlasBone = maps.bone; atlasTissue = maps.tissue;
      } else {
        [atlasBone, atlasTissue] = await Promise.all([
          atlasBoneOpticalDensity({ patient, projection, pose, tube, exposureKvp: kvp, width, height, geometry }),
          projectAtlasTissueOD({ patient, projection, tube, exposureKvp: kvp, width, height, geometry, wholeBody: false }),
        ]);
      }
    } catch (err) { atlasError = err instanceof Error ? err.message : String(err); console.warn("[Bucky Lab] Atlas projection failed:", atlasError); }

    const boneCoverage = atlasBone ? atlasBone.reduce((a, v) => a + (v > .0005 ? 1 : 0), 0) / n : 0;
    const tissueCoverage = atlasTissue ? atlasTissue.reduce((a, v) => a + (v > .0005 ? 1 : 0), 0) / n : 0;
    const useBoneAtlas = !!atlasBone && boneCoverage > .001, useTissueAtlas = !!atlasTissue && tissueCoverage > .004;
    const signal = new Float32Array(n), totalOD = new Float32Array(n), softODMap = new Float32Array(n), boneOD = new Float32Array(n), bodyWeightMap = new Float32Array(n);
    let sum = 0;

    for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
      const i = py * width + px;
      const { x, y } = localCoords(projection, patient, pose, px, py, width, height, tube, geometry);
      const paths = isPaChest ? samplePaChest(x, y, patient, pose, seed) : isWholeBody ? sampleFullBody(x, y, patient, seed) : sampleAnatomy(x, y, ctx);
      if (useBoneAtlas) { paths.bone = 0; paths.cortical = 0; }
      if (!isPaChest && !isWholeBody && (projection.anatomy === "torso-ap" || projection.anatomy === "torso-lat")) { addSharedTissueLayers(paths, x, y, patient, pose, projection); addSharedOrganPaths(paths, x, y, patient, pose); }
      addPacemaker(paths, x, y, projection, simCase?.device === "pacemaker");

      const fallback = pathsToOD(paths, kvp) * (useBoneAtlas ? .88 + thickness / 70 : .82 + thickness / 60);
      const atlasSoft = useTissueAtlas ? (atlasTissue?.[i] ?? 0) : 0;
      const softOD = atlasSoft > .00025 ? atlasSoft : fallback;
      const rawBone = useBoneAtlas ? (atlasBone?.[i] ?? 0) : 0;
      const bone = rawBone > 0 ? (rawBone <= .28 ? rawBone : .28 + (rawBone - .28) * .28) : 0;
      const metalOD = paths.metal > 0 ? muFromHU(3000, kvp) * paths.metal : 0;
      const pathOD = pathologyDelta(pathologyId, x, y, projection);
      const od = Math.max(.00001, softOD + bone + metalOD + pathOD);
      softODMap[i] = softOD; totalOD[i] = od; boneOD[i] = bone;

      const tissueWeight = smooth01(clamp((softOD - .0030) / .060, 0, 1));
      const boneWeight = smooth01(clamp((bone - .0015) / .030, 0, 1)) * .74;
      const proceduralWeight = clamp((paths.soft + paths.lung + paths.fat) / .10, 0, 1);
      const bodyWeight = Math.max(tissueWeight, boneWeight, useTissueAtlas ? 0 : proceduralWeight);
      bodyWeightMap[i] = bodyWeight;

      const scatterScale = bodyWeight > .04 ? .0016 + .0085 * (1 - Math.exp(-Math.max(0, softOD) * .50)) : .00003;
      const scat = I0 * scatterFrac * scatterScale;
      const bodySignal = I0 * Math.exp(-od) + scat;
      const airSignal = I0 * 1.02 + I0 * scatterFrac * .00002;
      const sig = airSignal * (1 - bodyWeight) + bodySignal * bodyWeight;
      signal[i] = sig; sum += sig;
    }

    const mean = sum / n, well = 280;
    let satEstimate = 0; for (let i = 0; i < n; i++) if (signal[i]! > well) satEstimate++;
    assertFrameQuality(signal, width, height, satEstimate / n, mean, .018);

    const airReference = Math.max(1e-6, I0 * 1.02 + I0 * scatterFrac * .00002);
    const detectorOD = new Float32Array(n), detectorSamples: number[] = [];
    for (let i = 0; i < n; i++) {
      detectorOD[i] = Math.max(0, -Math.log(clamp(signal[i]! / airReference, 1e-6, 1.02)));
      if (bodyWeightMap[i] > .50 && detectorOD[i]! > .002 && boneOD[i] < .16) detectorSamples.push(detectorOD[i]!);
    }
    const anchors = {
      low: percentile([...detectorSamples], isPaChest ? .10 : .055),
      mid: percentile([...detectorSamples], isPaChest ? .58 : .56),
      high: percentile([...detectorSamples], isPaChest ? .995 : .992),
    };
    if (anchors.mid <= anchors.low + .035) anchors.mid = anchors.low + .035;
    if (anchors.high <= anchors.mid + .060) anchors.high = anchors.mid + .060;
    const localDetectorOD = blurScalar(detectorOD, width, height, isPaChest ? 2 : Math.max(1, Math.min(3, Math.round(Math.min(width, height) / 300))));

    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const g = canvas.getContext("2d"); if (!g) throw new Error("Render failed — could not obtain 2D canvas context.");
    const img = g.createImageData(width, height);
    let sat = 0, noiseAcc = 0, contrastAcc = 0, contrastN = 0;
    const quantumNoise = .0012 + .0042 / Math.sqrt(Math.max(.6, exposure.mas));
    const blurRadius = geometry.geometricUnsharpnessMm > .24 ? 1 : 0;
    const blurWeight = blurRadius ? Math.min(.055, geometry.geometricUnsharpnessMm * .028) : 0;

    for (let i = 0; i < n; i++) {
      const nx = i % width, ny = i / width | 0;
      let tone = detectorTone(detectorOD[i]!, localDetectorOD[i]!, bodyWeightMap[i]!, anchors, isPaChest);
      if (blurRadius > 0 && nx > 1 && nx < width - 2 && ny > 1 && ny < height - 2) {
        let neighbour = 0, count = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const j = (ny + dy) * width + nx + dx, wt = (dx === 0 || dy === 0) ? 1 : .7;
          neighbour += detectorTone(detectorOD[j]!, localDetectorOD[j]!, bodyWeightMap[j]!, anchors, isPaChest) * wt; count += wt;
        }
        if (count > 0) tone = tone * (1 - blurWeight) + neighbour / count * blurWeight;
      }
      const bodyNoise = quantumNoise * (.16 + .84 * bodyWeightMap[i]!);
      const fine = (fbm(nx * .61, ny * .61, seed + 4) - .5) * 2 * bodyNoise;
      const detector = (fbm(nx * .13, ny * .13, seed + 17) - .5) * .0012;
      const nse = fine + detector;
      tone = clamp(tone + nse, 0, 1); noiseAcc += Math.abs(nse);
      if (signal[i]! > well) sat++;
      const v = Math.round(tone * 255), o = i * 4;
      img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; img.data[o + 3] = 255;
      if (nx > 0) { contrastAcc += Math.abs(v - img.data[(i - 1) * 4]!); contrastN++; }
    }

    const marker = exposure.marker === "L" || exposure.marker === "R" ? exposure.marker : "R";
    stampMarker(img, width, height, marker, Math.round(width * .08), Math.round(height * .06));
    g.putImageData(img, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    const metrics = buildMetrics(mean, noiseAcc / n, contrastN ? contrastAcc / contrastN / 255 : 0, sat / n, patient, projection, exposure, tube);
    const scores = scoreExposure({ patient, projection, pose, tube, exposure, metrics });
    const overall = scores.reduce((a, c) => a + c.weight * gradeNum(c.grade), 0) / scores.reduce((a, c) => a + c.weight, 0);
    const overallGrade = overall >= .85 ? "excellent" : overall >= .62 ? "acceptable" : "repeat";
    if (atlasError || !useBoneAtlas || !useTissueAtlas) console.info("[Bucky Lab] atlas coverage", { projection: projection.id, boneCoverage, tissueCoverage, atlasError });
    return { metrics, scores, overall, overallGrade, width, height, dataUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("Render failed")) throw err;
    throw new Error(`Render failed — ${message}`);
  }
}
function gradeNum(g: "excellent" | "acceptable" | "repeat") { return g === "excellent" ? 1 : g === "acceptable" ? .7 : .25; }
function stampMarker(img: ImageData, w: number, h: number, letter: "L" | "R", x: number, y: number) {
  const glyph = letter === "L" ? L_GLYPH : R_GLYPH, scale = 5;
  const put = (px: number, py: number, v: number) => { if (px < 0 || py < 0 || px >= w || py >= h) return; const i = (py * w + px) * 4; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255; };
  for (let gy = 0; gy < glyph.length; gy++) for (let gx = 0; gx < glyph[gy]!.length; gx++) if (glyph[gy]![gx]) for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) put(x + gx * scale + sx, y + gy * scale + sy, 245);
}
const L_GLYPH = [[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,1]], R_GLYPH = [[1,1,1,1,0],[1,0,0,0,1],[1,1,1,1,0],[1,0,1,0,0],[1,0,0,1,0]];
