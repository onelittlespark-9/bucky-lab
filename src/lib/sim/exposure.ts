import type { Patient, Projection, ExposureState, TubeState, ExposureMetrics } from "./types";
import { primaryTransmission, relativeTubeOutput } from "./nist-attenuation";

export function incidentFluence(kvp: number, mas: number, sidCm: number, grid: boolean): number {
  const output = relativeTubeOutput(kvp);
  const dist = Math.pow(100 / Math.max(60, sidCm), 2);
  const gridFactor = grid ? 0.34 : 1;
  return mas * output * dist * gridFactor * 42;
}

export function partThickness(patient: Patient, projection: Projection): number {
  switch (projection.anatomy) {
    case "torso-ap":
    case "torso-lat":
      if (projection.region === "Thorax") return patient.thickness.chest;
      if (projection.region === "Abdomen") return patient.thickness.abdomen;
      if (projection.region === "Pelvis & hips") return patient.thickness.pelvis;
      if (projection.id.includes("lumbar")) return patient.thickness.lumbar;
      if (projection.id.includes("cspine") || projection.id.includes("c-spine")) return patient.thickness.cspine;
      return patient.thickness.abdomen;
    case "cspine-lat": return patient.thickness.cspine;
    case "skull-lat": return patient.thickness.skull;
    case "shoulder-ap": return patient.thickness.shoulder;
    case "knee-ap":
    case "knee-lat": return patient.thickness.knee;
    default: return patient.thickness.extremity;
  }
}

export function suggestedTechnique(patient: Patient, projection: Projection): { kvp: number; mas: number } {
  const refT = projection.region === "Thorax" ? 22 : projection.region === "Abdomen" || projection.region === "Pelvis & hips" ? 22 : projection.anatomy.includes("hand") || projection.anatomy.includes("wrist") || projection.anatomy.includes("foot") ? 4 : 12;
  const t = partThickness(patient, projection);
  const cm = t - refT;
  let { kvp, mas } = projection;
  if (Math.abs(cm) >= 8) {
    kvp = Math.round(kvp * (cm > 0 ? 1.15 : 0.87));
    mas = mas * Math.pow(2, (cm > 0 ? cm - 4 : cm + 4) / 4);
  } else mas = mas * Math.pow(2, cm / 4);
  if (projection.anatomy === "torso-lat" || projection.anatomy === "cspine-lat") mas *= 1.05;
  kvp = Math.min(125, Math.max(40, Math.round(kvp)));
  mas = Math.min(200, Math.max(0.5, Math.round(mas * 10) / 10));
  return { kvp, mas };
}

export function fieldScatter(collimW: number, collimH: number, thickness: number, grid: boolean): number {
  const area = collimW * collimH;
  const scatter = (area / 900) * (thickness / 22) * 0.22;
  return grid ? scatter * 0.18 : scatter;
}

export function exposureIndex(meanSignal: number): number { return 100 * Math.log10(Math.max(1e-6, meanSignal) * 12); }
export function classifyEI(ei: number): ExposureMetrics["eiStatus"] {
  if (ei < 170) return "under";
  if (ei > 340) return "over";
  return "optimal";
}

/**
 * Representative subject transmission for EI/dose metrics. This is deliberately
 * evaluated through the same multi-bin spectrum as the renderer, rather than
 * combining fixed or spectrum-averaged mu values into one effective exponent.
 */
export function representativeTransmission(patient: Patient, projection: Projection, kvp: number): number {
  const t = partThickness(patient, projection);
  const isChest = projection.region === "Thorax";
  return isChest
    ? primaryTransmission({
        soft: t * 0.34,
        inflatedLung: t * 0.46,
        trabecularBone: t * 0.055,
        adipose: t * 0.145,
      }, kvp)
    : primaryTransmission({
        soft: t * 0.76,
        trabecularBone: t * 0.11,
        adipose: t * 0.13,
      }, kvp);
}

export function superimpositionIndex(patient: Patient, projection: Projection): number {
  const t = partThickness(patient, projection);
  const thicknessBurden = Math.min(1, t / 35);
  const projectionBurden = projection.anatomy === "torso-lat"
    ? 0.78
    : projection.anatomy === "torso-ap"
      ? 0.58
      : projection.anatomy === "skull-lat" || projection.anatomy === "cspine-lat"
        ? 0.72
        : 0.30;
  return Math.min(1, projectionBurden * 0.68 + thicknessBurden * 0.32);
}

export function predictEI(patient: Patient, projection: Projection, exposure: ExposureState, tube: TubeState): number {
  const T = representativeTransmission(patient, projection, exposure.kvp);
  const I0 = incidentFluence(exposure.kvp, exposure.mas, tube.sid, exposure.grid && projection.setup !== "tabletop");
  const t = partThickness(patient, projection);
  const scatter = fieldScatter(tube.collimationW, tube.collimationH, t, exposure.grid);
  return exposureIndex(I0 * T + I0 * scatter * 0.15);
}

export function buildMetrics(meanSignal: number, noise: number, contrast: number, saturation: number, patient: Patient, projection: Projection, exposure: ExposureState, tube: TubeState): ExposureMetrics {
  const ei = exposureIndex(meanSignal);
  const t = partThickness(patient, projection);
  const I0 = incidentFluence(exposure.kvp, exposure.mas, tube.sid, exposure.grid);
  const fieldAreaCm2 = (tube.collimationW / 10) * (tube.collimationH / 10);
  const patientSizeFactor = Math.max(0.72, Math.min(1.55, 1 + (t - 20) / 60));
  const receptorAttenuation = exposure.grid ? 1.28 : 1.0;
  const kVFactor = Math.pow(exposure.kvp / 75, 0.35);
  const distanceFactor = Math.pow(100 / Math.max(60, tube.sid), 2);
  const entranceDose = I0 * 0.012 * distanceFactor * patientSizeFactor * receptorAttenuation / Math.max(0.7, kVFactor);
  const dap = entranceDose * fieldAreaCm2;
  const transmission = representativeTransmission(patient, projection, exposure.kvp);
  const scatter = fieldScatter(tube.collimationW, tube.collimationH, t, exposure.grid);
  const scatterFraction = Math.min(1, scatter / Math.max(1e-6, transmission + scatter));
  const attenuationIndex = Math.min(1, -Math.log(Math.max(1e-6, transmission)) / 5);
  const superimposition = superimpositionIndex(patient, projection);
  return {
    ei,
    eiStatus: classifyEI(ei),
    noise,
    contrast,
    saturation,
    dap,
    entranceDose,
    predictedEI: predictEI(patient, projection, exposure, tube),
    transmission,
    scatterFraction,
    attenuationIndex,
    superimpositionIndex: superimposition,
  };
}
