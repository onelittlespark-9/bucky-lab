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

function localCoords(
  projection: Projection,
  patient: Patient,
  pose: SimPose,
  px: number,
  py: number,
  w: number,
  h: number,
  tube: TubeState,
  geometry: ReturnType<typeof projectionGeometry>,
) {
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

function ellipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number) {
  const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
  return q < 1 ? 1 - q : 0;
}

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

function assertFrameQuality(signal: Float32Array, width: number, height: number, satFraction: number, mean: number, minVariance = .8) {
  const n = width * height;
  if (n < 100) throw new Error("Render failed — detector matrix is too small.");
  if (satFraction > .55) throw new Error(`Render failed — image is severely over-exposed (${Math.round(satFraction * 100)}% of pixels saturated).`);
  if (!Number.isFinite(mean) || mean < .05) throw new Error("Render failed — almost no signal reached the detector.");
  let variance = 0;
  for (let i = 0; i < n; i++) { const d = signal[i]! - mean; variance += d * d; }
  if (variance / n < minVariance) throw new Error("Render failed — image has almost no anatomical structure.");
}

function percentile(values: number[], q: number) {
  if (!values.length) return 0;
  values.sort((a, b) => a - b);
  const i = Math.max(0, Math.min(values.length - 1, Math.round((values.length - 1) * q)));
  return values[i]!;
}

function blurScalar(src: Float32Array, w: number, h: number, radius = 2) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let d = -radius; d <= radius; d++) { const xx = Math.max(0, Math.min(w - 1, x + d)); const wt = radius + 1 - Math.abs(d); s += src[y * w + xx]! * wt; n += wt; }
    tmp[y * w + x] = s / n;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let d = -radius; d <= radius; d++) { const yy = Math.max(0, Math.min(h - 1, y + d)); const wt = radius + 1 - Math.abs(d); s += tmp[yy * w + x]! * wt; n += wt; }
    out[y * w + x] = s / n;
  }
  return out;
}

function canonicalTone(
  od: number,
  localMean: number,
  bone: number,
  bodyWeight: number,
  anchors: { low: number; mid: number; high: number },
) {
  const detail = od - localMean;
  const lowSpan = Math.max(.06, anchors.mid - anchors.low);
  const highSpan = Math.max(.08, anchors.high - anchors.mid);
  let mapped: number;
  if (od <= anchors.mid) {
    const t = clamp((od - anchors.low) / lowSpan, 0, 1);
    mapped = .16 + .45 * Math.pow(t, .78);
  } else {
    const t = clamp((od - anchors.mid) / highSpan, 0, 1);
    mapped = .61 + .31 * Math.pow(t, .72);
  }
  const boneDetail = clamp(bone / .12, 0, 1);
  mapped += detail * (.36 + .24 * boneDetail) + boneDetail * .055;
  mapped = clamp(mapped, .08, .97);
  const airTone = .16;
  const edge = bodyWeight * bodyWeight * (3 - 2 * bodyWeight);
  return airTone * (1 - edge) + mapped * edge;
}

export async function renderRadiograph(args: {
  patient: Patient;
  projection: Projection;
  pose: SimPose;
  tube: TubeState;
  exposure: ExposureState;
  pathologyId?: PathologyId;
  caseId?: string | null;
  width?: number;
  height?: number;
}): Promise<RadiographResult> {
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
    const seed = hashPatient(patient.id);
    const ctx: SampleCtx = { patient, projection, pose, seed };
    const isPaChest = projection.id === "pa-chest";
    const isWholeBody = projection.id === "ap-full-body";
    const canonicalView = usesCanonicalAtlasProjection(projection);

    let atlasOD: Float32Array | null = null, atlasTissueOD: Float32Array | null = null, atlasError: string | null = null;
    try {
      if (canonicalView) {
        const canonical = await canonicalAtlasProjection({ patient, projection, tube, exposureKvp: kvp, width, height, geometry });
        atlasOD = canonical.bone; atlasTissueOD = canonical.tissue;
      } else atlasOD = await atlasBoneOpticalDensity({ patient, projection, pose, tube, exposureKvp: kvp, width, height, geometry });
    } catch (err) {
      atlasError = err instanceof Error ? err.message : String(err);
      console.warn("[Bucky Lab] Atlas projection failed:", atlasError);
    }

    const hasAtlas = atlasOD !== null, n = width * height;
    const signal = new Float32Array(n), bodyMask = new Uint8Array(n), canonicalOD = new Float32Array(n), canonicalBone = new Float32Array(n), bodyWeightMap = new Float32Array(n);
    let sum = 0;

    for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
      const i = py * width + px;
      const { x, y } = localCoords(projection, patient, pose, px, py, width, height, tube, geometry);
      const paths = isPaChest ? samplePaChest(x, y, patient, pose, seed) : isWholeBody ? sampleFullBody(x, y, patient, seed) : sampleAnatomy(x, y, ctx);
      if (hasAtlas) { paths.bone = 0; paths.cortical = 0; }
      if (!isPaChest && !isWholeBody && (projection.anatomy === "torso-ap" || projection.anatomy === "torso-lat")) {
        addSharedTissueLayers(paths, x, y, patient, pose, projection); addSharedOrganPaths(paths, x, y, patient, pose);
      }
      addPacemaker(paths, x, y, projection, simCase?.device === "pacemaker");

      const attenuationScale = canonicalView ? (hasAtlas ? 1.06 : 1.04) : (hasAtlas ? .65 + thickness / 45 : .55 + thickness / 40);
      const fallbackSoft = pathsToOD(paths, kvp) * attenuationScale;
      const tissueAtlas = atlasTissueOD?.[i] ?? 0;
      const physicalAtlasTissue = canonicalView && tissueAtlas > .00025 ? clamp(tissueAtlas, .00025, 6.5) : 0;
      const softOd = canonicalView ? Math.max(.00005, physicalAtlasTissue > 0 ? physicalAtlasTissue : fallbackSoft) : fallbackSoft;
      const rawBone = atlasOD?.[i] ?? 0;
      const boneDelta = canonicalView && rawBone > 0 ? Math.min(.19, rawBone * (1.30 - .38 * clamp(rawBone / .15, 0, 1))) : rawBone;
      const od = Math.max(canonicalView ? .00005 : .01, softOd + boneDelta + pathologyDelta(pathologyId, x, y, projection));
      const T = Math.exp(-od);

      const tissueWeight = canonicalView ? clamp((tissueAtlas - .00015) / .018, 0, 1) : 1;
      const boneWeight = canonicalView ? clamp(rawBone / .018, 0, 1) * .68 : 0;
      const bodyWeight = canonicalView ? Math.max(tissueWeight, boneWeight) : 1;
      bodyWeightMap[i] = bodyWeight;
      if (bodyWeight > .02) bodyMask[i] = 1;
      canonicalOD[i] = od;
      canonicalBone[i] = boneDelta;

      const boneMask = boneDelta > .004 || paths.bone > .15 || paths.cortical > .05 ? 1 : 0;
      const trabFine = (fbm(x * 3.5, y * 3.5, seed + 31) - .5) * (canonicalView ? .010 : .018);
      const trabCoarse = (fbm(x * 1.05, y * 1.05, seed + 37) - .5) * (canonicalView ? .006 : .012);
      const softVar = (fbm(x * .48, y * .48, seed + 11) - .5) * (canonicalView ? .010 : .018) * (tissueAtlas > .00005 || paths.soft > .08 ? 1 : 0);
      const texture = 1 + boneMask * (trabFine + trabCoarse) + softVar;
      const localScatterScale = canonicalView ? (bodyWeight > .02 ? .0025 + .012 * (1 - Math.exp(-Math.max(0, softOd) * .65)) : .00012) : .5 + .5 * (paths.soft + paths.lung > 0 ? 1 : .15);
      const scat = I0 * scatterFrac * localScatterScale;
      const bodySignal = I0 * T * texture + scat;
      const airSignal = I0 * 1.02 + I0 * scatterFrac * .00003;
      const sig = canonicalView ? airSignal * (1 - bodyWeight) + bodySignal * bodyWeight : (bodyWeight > .02 ? bodySignal : airSignal);
      signal[i] = sig; sum += sig;
    }

    const mean = sum / n, well = 280;
    let satEstimate = 0;
    for (let i = 0; i < n; i++) if (signal[i]! > well) satEstimate++;
    assertFrameQuality(signal, width, height, satEstimate / n, mean, canonicalView ? .02 : .8);

    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const g = canvas.getContext("2d"); if (!g) throw new Error("Render failed — could not obtain 2D canvas context.");
    const img = g.createImageData(width, height);
    let sat = 0, noiseAcc = 0, contrastAcc = 0, contrastN = 0;
    const baseNoise = .08 + .38 / Math.sqrt(Math.max(.5, mean / 40));
    const noiseGain = canonicalView ? baseNoise * .24 : baseNoise;
    const blurRadius = clamp(Math.round(geometry.geometricUnsharpnessMm * 1.25), 0, 3);
    const blurWeight = blurRadius > 0 ? Math.min(.20, geometry.geometricUnsharpnessMm * .075) : 0;

    let anchors = { low: .08, mid: .55, high: 1.7 };
    let localOD = canonicalOD;
    if (canonicalView) {
      const tissueValues: number[] = [];
      for (let i = 0; i < n; i++) if (bodyWeightMap[i]! > .72 && canonicalBone[i]! < .028 && canonicalOD[i]! > .015) tissueValues.push(canonicalOD[i]!);
      if (tissueValues.length > 128) {
        anchors = {
          low: percentile([...tissueValues], .10),
          mid: percentile([...tissueValues], .56),
          high: percentile([...tissueValues], .96),
        };
        if (anchors.mid - anchors.low < .07) anchors.low = Math.max(.01, anchors.mid - .07);
        if (anchors.high - anchors.mid < .10) anchors.high = anchors.mid + .10;
      }
      localOD = blurScalar(canonicalOD, width, height, isPaChest ? 4 : 2);
    }

    const logMean = Math.log(mean + 1e-5), contrastScale = clamp((kvp - 45) / 80, 0, 1);
    const fallbackWindowW = 1.7 + contrastScale * 2.2;
    const fallbackWindowL = logMean + (mean > 100 ? .15 : mean < 10 ? -.25 : 0);

    for (let i = 0; i < n; i++) {
      const nx = i % width, ny = i / width | 0;
      let sig = signal[i]!;
      if (blurRadius > 0 && nx > blurRadius && nx < width - blurRadius - 1 && ny > blurRadius && ny < height - blurRadius - 1) {
        let neighbour = 0, count = 0;
        for (let dy = -blurRadius; dy <= blurRadius; dy++) for (let dx = -blurRadius; dx <= blurRadius; dx++) {
          if (dx === 0 && dy === 0) continue;
          const dist = Math.sqrt(dx * dx + dy * dy); if (dist > blurRadius + .25) continue;
          const falloff = 1 / (1 + dist * dist); neighbour += signal[(ny + dy) * width + nx + dx]! * falloff; count += falloff;
        }
        if (count > 0) sig = sig * (1 - blurWeight) + neighbour / count * blurWeight;
      }
      const sigma = noiseGain / Math.sqrt(Math.max(.5, sig));
      const nse = (fbm(nx * .42, ny * .42, seed + 4) - .5) * 2 * sigma * (canonicalView ? 1 : 3);
      sig = Math.max(0, sig + nse); noiseAcc += Math.abs(nse);
      if (sig > well) { sig = well; sat++; }

      let tone: number;
      if (canonicalView) {
        tone = canonicalTone(canonicalOD[i]!, localOD[i]!, canonicalBone[i]!, bodyWeightMap[i]!, anchors);
        tone = clamp(tone + nse * .0006, 0, 1);
      } else {
        const L = Math.log(sig + 1e-5);
        let d = 1 - clamp((L - fallbackWindowL) / fallbackWindowW + .5, 0, 1);
        if (kvp >= 100) d = .08 + d * .84;
        else if (kvp <= 55) d = clamp(d < .5 ? d * .9 : .5 + (d - .5) * 1.1, 0, 1);
        tone = clamp(d, 0, 1); tone = tone * tone * (3 - 2 * tone);
      }
      const v = Math.round(tone * 255), o = i * 4;
      img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v; img.data[o + 3] = 255;
      if (nx > 0) { contrastAcc += Math.abs(v - img.data[(i - 1) * 4]!); contrastN++; }
    }

    assertFrameQuality(signal, width, height, sat / n, mean, canonicalView ? .02 : .8);
    const marker = exposure.marker === "L" || exposure.marker === "R" ? exposure.marker : "R";
    stampMarker(img, width, height, marker, Math.round(width * .08), Math.round(height * .06));
    g.putImageData(img, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    const metrics = buildMetrics(mean, noiseAcc / n, contrastN ? contrastAcc / contrastN / 255 : 0, sat / n, patient, projection, exposure, tube);
    const scores = scoreExposure({ patient, projection, pose, tube, exposure, metrics });
    const overall = scores.reduce((a, c) => a + c.weight * gradeNum(c.grade), 0) / scores.reduce((a, c) => a + c.weight, 0);
    const overallGrade = overall >= .85 ? "excellent" : overall >= .62 ? "acceptable" : "repeat";
    if (atlasError && !hasAtlas) console.warn("[Bucky Lab] procedural fallback:", atlasError);
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
  const put = (px: number, py: number, v: number) => {
    if (px < 0 || py < 0 || px >= w || py >= h) return;
    const i = (py * w + px) * 4; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  };
  for (let gy = 0; gy < glyph.length; gy++) for (let gx = 0; gx < glyph[gy]!.length; gx++) if (glyph[gy]![gx]) for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) put(x + gx * scale + sx, y + gy * scale + sy, 245);
}
const L_GLYPH = [[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,1]], R_GLYPH = [[1,1,1,1,0],[1,0,0,0,1],[1,1,1,1,0],[1,0,1,0,0],[1,0,0,1,0]];
