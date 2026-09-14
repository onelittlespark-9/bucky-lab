import {
  DEFAULT_FILTRATION_MM_AL,
  diagnosticSpectrum,
  effectivePhotonEnergyKev,
  linearAttenuationAtEnergy,
  type MaterialPath,
  type RadiographicMaterial,
} from "./nist-attenuation.ts";

export type QuantitativeRoiId =
  | "cortical"
  | "medullary"
  | "softTissue"
  | "air"
  | "waterSlab";

export interface QuantitativeRoiDefinition {
  id: QuantitativeRoiId;
  label: string;
  roi: readonly [number, number, number, number];
  paths: MaterialPath;
}

export interface QuantitativeRoiMeasurement {
  id: QuantitativeRoiId;
  label: string;
  measuredTransmission: number;
  expectedTransmission: number;
  percentError: number;
  passed: boolean;
}

export interface QuantitativeRoiReport {
  kvp: number;
  filtrationMmAl: number;
  effectiveEnergyKev: number;
  toleranceFraction: number;
  measurements: QuantitativeRoiMeasurement[];
  boneSoftContrast: number;
  expectedBoneSoftContrast: number;
  boneSoftContrastError: number;
  boneAirContrast: number;
  expectedBoneAirContrast: number;
  boneAirContrastError: number;
  corticalMedullaryRatio: number;
  expectedCorticalMedullaryRatio: number;
  corticalMedullaryRatioError: number;
  passed: boolean;
  failures: string[];
}

const DEFAULT_WIDTH = 180;
const DEFAULT_HEIGHT = 120;

/*
 * These ray paths are deliberately simple calibration surrogates for the named
 * anatomical ROIs. They are not display greyscale targets. They are raw
 * transmission paths used to ensure that the production spectrum/material
 * model preserves physically plausible ordering and ratios before windowing.
 *
 * Cortical and medullary paths have the same total nominal long-bone chord
 * (12 cm of patient-equivalent material); cortical bone or marrow replaces
 * soft tissue rather than being added on top of it.
 */
export const DEFAULT_QUANTITATIVE_ROIS: readonly QuantitativeRoiDefinition[] = [
  {
    id: "cortical",
    label: "Mid-femur cortical bone",
    roi: [12, 18, 44, 50],
    paths: { soft: 11.4, corticalBone: 0.6 },
  },
  {
    id: "medullary",
    label: "Mid-femur medullary cavity",
    roi: [52, 18, 84, 50],
    paths: { soft: 10.6, adipose: 1.05, trabecularBone: 0.35 },
  },
  {
    id: "softTissue",
    label: "Lateral abdomen / thigh soft tissue",
    roi: [92, 18, 124, 50],
    paths: { soft: 10.0 },
  },
  {
    id: "air",
    label: "Air outside body",
    roi: [132, 18, 164, 50],
    paths: {},
  },
  {
    id: "waterSlab",
    label: "10 cm water-equivalent slab",
    roi: [72, 68, 108, 104],
    paths: { soft: 10.0 },
  },
] as const;

function clampTransmission(v: number) {
  return Math.max(1e-12, Math.min(1, v));
}

function polychromaticTransmission(paths: MaterialPath, kvp: number, filtrationMmAl: number) {
  let transmission = 0;
  for (const bin of diagnosticSpectrum(kvp, filtrationMmAl)) {
    let tau = 0;
    for (const material of Object.keys(paths) as RadiographicMaterial[]) {
      const lengthCm = Math.max(0, paths[material] ?? 0);
      if (lengthCm > 0) tau += linearAttenuationAtEnergy(material, bin.energyKev) * lengthCm;
    }
    transmission += bin.weight * Math.exp(-tau);
  }
  return clampTransmission(transmission);
}

function effectiveEnergyTransmission(paths: MaterialPath, effectiveEnergyKev: number) {
  let tau = 0;
  for (const material of Object.keys(paths) as RadiographicMaterial[]) {
    const lengthCm = Math.max(0, paths[material] ?? 0);
    if (lengthCm > 0) tau += linearAttenuationAtEnergy(material, effectiveEnergyKev) * lengthCm;
  }
  return clampTransmission(Math.exp(-tau));
}

function meanInRoi(
  pixels: Float32Array,
  width: number,
  roi: readonly [number, number, number, number],
) {
  const [x0, y0, x1, y1] = roi;
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      sum += pixels[y * width + x]!;
      count++;
    }
  }
  return count ? sum / count : NaN;
}

function relativeError(measured: number, expected: number) {
  return Math.abs(measured - expected) / Math.max(1e-12, Math.abs(expected));
}

export function renderQuantitativeRoiPhantomRaw(args: {
  kvp: number;
  filtrationMmAl?: number;
  width?: number;
  height?: number;
  rois?: readonly QuantitativeRoiDefinition[];
}) {
  const width = args.width ?? DEFAULT_WIDTH;
  const height = args.height ?? DEFAULT_HEIGHT;
  const filtrationMmAl = args.filtrationMmAl ?? DEFAULT_FILTRATION_MM_AL;
  const rois = args.rois ?? DEFAULT_QUANTITATIVE_ROIS;
  const pixels = new Float32Array(width * height);
  pixels.fill(1);

  for (const definition of rois) {
    const value = polychromaticTransmission(definition.paths, args.kvp, filtrationMmAl);
    const [x0, y0, x1, y1] = definition.roi;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) pixels[y * width + x] = value;
    }
  }

  return {
    pixels,
    width,
    height,
    rois,
    filtrationMmAl,
    effectiveEnergyKev: effectivePhotonEnergyKev(args.kvp, filtrationMmAl),
  };
}

export function validateQuantitativeRois(args: {
  kvp: number;
  filtrationMmAl?: number;
  toleranceFraction?: number;
  pixels?: Float32Array;
  width?: number;
  height?: number;
  rois?: readonly QuantitativeRoiDefinition[];
}): QuantitativeRoiReport {
  const toleranceFraction = args.toleranceFraction ?? 0.15;
  const filtrationMmAl = args.filtrationMmAl ?? DEFAULT_FILTRATION_MM_AL;
  const generated = args.pixels
    ? {
        pixels: args.pixels,
        width: args.width ?? DEFAULT_WIDTH,
        height: args.height ?? DEFAULT_HEIGHT,
        rois: args.rois ?? DEFAULT_QUANTITATIVE_ROIS,
        filtrationMmAl,
        effectiveEnergyKev: effectivePhotonEnergyKev(args.kvp, filtrationMmAl),
      }
    : renderQuantitativeRoiPhantomRaw({
        kvp: args.kvp,
        filtrationMmAl,
        width: args.width,
        height: args.height,
        rois: args.rois,
      });

  if (generated.pixels.length !== generated.width * generated.height) {
    throw new Error("Quantitative ROI validation buffer size does not match width × height.");
  }

  const failures: string[] = [];
  const measurements = generated.rois.map(definition => {
    const measuredTransmission = meanInRoi(generated.pixels, generated.width, definition.roi);
    const expectedTransmission = effectiveEnergyTransmission(definition.paths, generated.effectiveEnergyKev);
    const percentError = relativeError(measuredTransmission, expectedTransmission) * 100;
    const passed = percentError <= toleranceFraction * 100;
    if (!passed) {
      failures.push(
        `${definition.label}: measured=${measuredTransmission.toFixed(6)} expected=${expectedTransmission.toFixed(6)} error=${percentError.toFixed(2)}%`,
      );
    }
    return {
      id: definition.id,
      label: definition.label,
      measuredTransmission,
      expectedTransmission,
      percentError,
      passed,
    };
  });

  const byId = new Map(measurements.map(item => [item.id, item] as const));
  const cortical = byId.get("cortical")!;
  const medullary = byId.get("medullary")!;
  const soft = byId.get("softTissue")!;
  const air = byId.get("air")!;

  const boneSoftContrast = (cortical.measuredTransmission - soft.measuredTransmission) /
    Math.max(1e-12, soft.measuredTransmission);
  const expectedBoneSoftContrast = (cortical.expectedTransmission - soft.expectedTransmission) /
    Math.max(1e-12, soft.expectedTransmission);
  const boneSoftContrastError = relativeError(boneSoftContrast, expectedBoneSoftContrast) * 100;

  const boneAirContrast = (cortical.measuredTransmission - air.measuredTransmission) /
    Math.max(1e-12, air.measuredTransmission);
  const expectedBoneAirContrast = (cortical.expectedTransmission - air.expectedTransmission) /
    Math.max(1e-12, air.expectedTransmission);
  const boneAirContrastError = relativeError(boneAirContrast, expectedBoneAirContrast) * 100;

  const corticalMedullaryRatio = cortical.measuredTransmission / Math.max(1e-12, medullary.measuredTransmission);
  const expectedCorticalMedullaryRatio = cortical.expectedTransmission / Math.max(1e-12, medullary.expectedTransmission);
  const corticalMedullaryRatioError = relativeError(corticalMedullaryRatio, expectedCorticalMedullaryRatio) * 100;

  const ratioChecks = [
    ["bone-soft-tissue contrast", boneSoftContrastError],
    ["bone-air contrast", boneAirContrastError],
    ["cortical/medullary ratio", corticalMedullaryRatioError],
  ] as const;
  for (const [label, error] of ratioChecks) {
    if (error > toleranceFraction * 100) failures.push(`${label}: ratio error=${error.toFixed(2)}%`);
  }

  if (!(cortical.measuredTransmission < medullary.measuredTransmission)) {
    failures.push("Cortical transmission must be lower than medullary transmission.");
  }
  if (!(soft.measuredTransmission < air.measuredTransmission)) {
    failures.push("Soft-tissue transmission must be lower than air transmission.");
  }

  return {
    kvp: args.kvp,
    filtrationMmAl,
    effectiveEnergyKev: generated.effectiveEnergyKev,
    toleranceFraction,
    measurements,
    boneSoftContrast,
    expectedBoneSoftContrast,
    boneSoftContrastError,
    boneAirContrast,
    expectedBoneAirContrast,
    boneAirContrastError,
    corticalMedullaryRatio,
    expectedCorticalMedullaryRatio,
    corticalMedullaryRatioError,
    passed: failures.length === 0,
    failures,
  };
}

export function formatQuantitativeRoiReport(report: QuantitativeRoiReport) {
  const lines = [
    `Quantitative raw ROI validation @ ${report.kvp} kVp`,
    `Filtration: ${report.filtrationMmAl.toFixed(2)} mm Al; effective energy: ${report.effectiveEnergyKev.toFixed(2)} keV`,
    `Tolerance: ±${(report.toleranceFraction * 100).toFixed(1)}% versus effective-energy NIST attenuation expectation`,
  ];
  for (const roi of report.measurements) {
    lines.push(
      `${roi.passed ? "PASS" : "FAIL"} ${roi.label}: measured=${roi.measuredTransmission.toFixed(6)} expected=${roi.expectedTransmission.toFixed(6)} error=${roi.percentError.toFixed(2)}%`,
    );
  }
  lines.push(
    `bone-soft contrast ${(report.boneSoftContrast).toFixed(6)} (expected ${report.expectedBoneSoftContrast.toFixed(6)}, error ${report.boneSoftContrastError.toFixed(2)}%)`,
    `bone-air contrast ${(report.boneAirContrast).toFixed(6)} (expected ${report.expectedBoneAirContrast.toFixed(6)}, error ${report.boneAirContrastError.toFixed(2)}%)`,
    `cortical/medullary ratio ${report.corticalMedullaryRatio.toFixed(6)} (expected ${report.expectedCorticalMedullaryRatio.toFixed(6)}, error ${report.corticalMedullaryRatioError.toFixed(2)}%)`,
  );
  for (const failure of report.failures) lines.push(`FAIL ${failure}`);
  lines.push(report.passed ? "QUANTITATIVE ROI VALIDATION PASSED" : "QUANTITATIVE ROI VALIDATION FAILED");
  return lines.join("\n");
}
