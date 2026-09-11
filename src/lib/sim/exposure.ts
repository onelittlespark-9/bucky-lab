import type { Patient, Projection, ExposureState, TubeState, ExposureMetrics } from "./types";

/** Linear attenuation at ~60 kV effective, cm^-1, relative. */
export const MU = {
  air: 0.0003,
  lung: 0.045,
  fat: 0.16,
  soft: 0.205,
  muscle: 0.22,
  bone: 0.42,
  cortical: 0.72,
  metal: 8,
} as const;

export type Tissue = keyof typeof MU;

/** Photoelectric falls steeply with kV; Compton slowly. Bone is more photoelectric. */
export function muEffective(tissue: Tissue, kvp: number): number {
  const mu0 = MU[tissue];
  const ref = 75;
  const photo = Math.pow(ref / Math.max(40, kvp), 2.6);
  const compton = Math.pow(ref / Math.max(40, kvp), 0.25);
  const boneLike = tissue === "bone" || tissue === "cortical" || tissue === "metal" ? 0.72 : 0.35;
  return mu0 * (boneLike * photo + (1 - boneLike) * compton);
}

export function incidentFluence(kvp: number, mas: number, sidCm: number, grid: boolean): number {
  const k = Math.pow(kvp / 80, 2.2);
  const dist = Math.pow(100 / Math.max(60, sidCm), 2);
  const gridFactor = grid ? 0.28 : 1;
  return mas * k * dist * gridFactor * 42;
}

export function partThickness(patient: Patient, projection: Projection): number {
  switch (projection.anatomy) {
    case "torso-ap":
    case "torso-lat":
      if (projection.region === "Thorax") return patient.thickness.chest;
      if (projection.region === "Abdomen") return patient.thickness.abdomen;
      if (projection.region === "Pelvis & hips") return patient.thickness.pelvis;
      if (projection.id.includes("lumbar")) return patient.thickness.lumbar;
      if (projection.id.includes("cspine") || projection.id.includes("c-spine"))
        return patient.thickness.cspine;
      return patient.thickness.abdomen;
    case "cspine-lat":
      return patient.thickness.cspine;
    case "skull-lat":
      return patient.thickness.skull;
    case "shoulder-ap":
      return patient.thickness.shoulder;
    case "knee-ap":
    case "knee-lat":
      return patient.thickness.knee;
    default:
      return patient.thickness.extremity;
  }
}

export function suggestedTechnique(patient: Patient, projection: Projection): { kvp: number; mas: number } {
  const refT =
    projection.region === "Thorax"
      ? 22
      : projection.region === "Abdomen" || projection.region === "Pelvis & hips"
        ? 22
        : projection.anatomy.includes("hand") ||
            projection.anatomy.includes("wrist") ||
            projection.anatomy.includes("foot")
          ? 4
          : 12;
  const t = partThickness(patient, projection);
  const cm = t - refT;
  let { kvp, mas } = projection;
  if (Math.abs(cm) >= 8) {
    kvp = Math.round(kvp * (cm > 0 ? 1.15 : 0.87));
    mas = mas * Math.pow(2, (cm > 0 ? cm - 4 : cm + 4) / 4);
  } else {
    mas = mas * Math.pow(2, cm / 4);
  }
  if (projection.anatomy === "torso-lat" || projection.anatomy === "cspine-lat") {
    mas *= 1.05;
  }
  kvp = Math.min(125, Math.max(40, Math.round(kvp)));
  mas = Math.min(200, Math.max(0.5, Math.round(mas * 10) / 10));
  return { kvp, mas };
}

export function fieldScatter(collimW: number, collimH: number, thickness: number, grid: boolean): number {
  const area = collimW * collimH;
  const scatter = (area / 900) * (thickness / 22) * 0.22;
  return grid ? scatter * 0.18 : scatter;
}

/** IEC-style exposure index from mean detector signal. Target ~250. */
export function exposureIndex(meanSignal: number): number {
  return 100 * Math.log10(Math.max(1e-6, meanSignal) * 12);
}

export function classifyEI(ei: number): ExposureMetrics["eiStatus"] {
  if (ei < 170) return "under";
  if (ei > 340) return "over";
  return "optimal";
}

export function predictEI(
  patient: Patient,
  projection: Projection,
  exposure: ExposureState,
  tube: TubeState,
): number {
  const t = partThickness(patient, projection);
  const kvp = exposure.kvp;
  const mu = muEffective("soft", kvp) * 0.55 + muEffective("bone", kvp) * 0.08;
  const T = Math.exp(-mu * t);
  const I0 = incidentFluence(kvp, exposure.mas, tube.sid, exposure.grid && projection.setup !== "tabletop");
  const scatter = fieldScatter(tube.collimationW, tube.collimationH, t, exposure.grid);
  const signal = I0 * T + I0 * scatter * 0.15;
  return exposureIndex(signal);
}

export function buildMetrics(
  meanSignal: number,
  noise: number,
  contrast: number,
  saturation: number,
  patient: Patient,
  projection: Projection,
  exposure: ExposureState,
  tube: TubeState,
): ExposureMetrics {
  const ei = exposureIndex(meanSignal);
  const t = partThickness(patient, projection);
  const I0 = incidentFluence(exposure.kvp, exposure.mas, tube.sid, exposure.grid);
  const entranceDose = I0 * 0.012 * Math.pow(tube.sid / 100, 2);
  const dap = entranceDose * (tube.collimationW / 10) * (tube.collimationH / 10);
  return {
    ei,
    eiStatus: classifyEI(ei),
    noise,
    contrast,
    saturation,
    dap,
    entranceDose,
    predictedEI: predictEI(patient, projection, exposure, tube),
  };
}
