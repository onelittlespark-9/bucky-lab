import {
  aluminiumLinearAttenuationAtEnergy,
  effectivePhotonEnergyKev,
  linearAttenuationAtEnergy,
} from "./nist-attenuation";

export type ValidationSlabMaterial = "soft" | "pmma" | "aluminium" | "corticalBone";

export interface SlabValidationCase {
  id: string;
  material: ValidationSlabMaterial;
  thicknessCm: number;
}

export interface SlabValidationResult extends SlabValidationCase {
  kvp: number;
  effectiveEnergyKev: number;
  muCmInv: number;
  expectedTransmission: number;
  measuredTransmission: number;
  percentError: number;
  passed: boolean;
}

export interface ThicknessDoublingResult {
  material: ValidationSlabMaterial;
  thicknessCm: number;
  singleTransmission: number;
  doubleTransmission: number;
  squaredSingleTransmission: number;
  percentError: number;
  passed: boolean;
}

export interface PhysicsValidationReport {
  kvp: number;
  effectiveEnergyKev: number;
  toleranceFraction: number;
  slabs: SlabValidationResult[];
  doubling: ThicknessDoublingResult[];
  passed: boolean;
}

const ENERGY_KEV = [30, 40, 50, 60, 80, 100, 120, 150] as const;
type Curve = readonly [number, number, number, number, number, number, number, number];

// PMMA (C5H8O2, density 1.19 g/cm^3) XCOM-equivalent mass attenuation
// coefficients in cm^2/g at the ENERGY_KEV anchors above. This is kept in the
// validation module deliberately: PMMA is a phantom material, not patient tissue.
const PMMA_MASS_MU: Curve = [0.3296, 0.2445, 0.2108, 0.1926, 0.1743, 0.1642, 0.1574, 0.1490];
const PMMA_DENSITY_G_CM3 = 1.19;

export const DEFAULT_SLAB_VALIDATION_CASES: readonly SlabValidationCase[] = [
  { id: "soft-10cm", material: "soft", thicknessCm: 10 },
  { id: "pmma-5cm", material: "pmma", thicknessCm: 5 },
  { id: "pmma-10cm", material: "pmma", thicknessCm: 10 },
  { id: "al-1cm", material: "aluminium", thicknessCm: 1 },
  { id: "al-2cm", material: "aluminium", thicknessCm: 2 },
  { id: "al-5cm", material: "aluminium", thicknessCm: 5 },
  { id: "cortical-bone-1cm", material: "corticalBone", thicknessCm: 1 },
] as const;

function interpolate(curve: Curve, energyKev: number): number {
  const e = Math.max(ENERGY_KEV[0], Math.min(ENERGY_KEV[ENERGY_KEV.length - 1], energyKev));
  for (let i = 0; i < ENERGY_KEV.length - 1; i++) {
    const e0 = ENERGY_KEV[i]!;
    const e1 = ENERGY_KEV[i + 1]!;
    if (e <= e1) {
      const t = Math.log(e / e0) / Math.log(e1 / e0);
      return curve[i]! + (curve[i + 1]! - curve[i]!) * t;
    }
  }
  return curve[curve.length - 1]!;
}

/**
 * Linear attenuation coefficient used by the effective-energy phantom mode.
 * Patient tissues and aluminium share the production attenuation tables;
 * PMMA is validation-only and uses its own XCOM-equivalent curve.
 */
export function validationLinearAttenuation(material: ValidationSlabMaterial, energyKev: number): number {
  switch (material) {
    case "soft": return linearAttenuationAtEnergy("soft", energyKev);
    case "corticalBone": return linearAttenuationAtEnergy("corticalBone", energyKev);
    case "aluminium": return aluminiumLinearAttenuationAtEnergy(energyKev);
    case "pmma": return interpolate(PMMA_MASS_MU, energyKev) * PMMA_DENSITY_G_CM3;
  }
}

export function beerLambertTransmission(muCmInv: number, thicknessCm: number): number {
  return Math.exp(-Math.max(0, muCmInv) * Math.max(0, thicknessCm));
}

/**
 * Render a deliberately simple raw detector phantom before any display LUT,
 * scatter, sharpening, window/level or noise. The slab occupies the central
 * 60% of the field and the stored values are I/I0, so the central ROI can be
 * compared directly with Beer-Lambert transmission.
 *
 * This mode intentionally uses the current spectrum's effective photon energy
 * because the acceptance criterion requested for the phantom is the
 * monoenergetic Beer-Lambert relation I/I0 = exp(-mu*x). The production renderer
 * remains polychromatic and is therefore expected to show beam hardening.
 */
export function renderUniformSlabRaw(args: {
  material: ValidationSlabMaterial;
  thicknessCm: number;
  kvp: number;
  width?: number;
  height?: number;
}): { pixels: Float32Array; width: number; height: number; effectiveEnergyKev: number; muCmInv: number } {
  const width = args.width ?? 96;
  const height = args.height ?? 96;
  const effectiveEnergyKev = effectivePhotonEnergyKev(args.kvp);
  const muCmInv = validationLinearAttenuation(args.material, effectiveEnergyKev);
  const transmission = beerLambertTransmission(muCmInv, args.thicknessCm);
  const pixels = new Float32Array(width * height);
  pixels.fill(1);
  const x0 = Math.floor(width * 0.20), x1 = Math.ceil(width * 0.80);
  const y0 = Math.floor(height * 0.20), y1 = Math.ceil(height * 0.80);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) pixels[y * width + x] = transmission;
  return { pixels, width, height, effectiveEnergyKev, muCmInv };
}

/** Average a central ROI covering 30% of each detector dimension. */
export function centralRawMean(pixels: Float32Array, width: number, height: number): number {
  const x0 = Math.floor(width * 0.35), x1 = Math.ceil(width * 0.65);
  const y0 = Math.floor(height * 0.35), y1 = Math.ceil(height * 0.65);
  let sum = 0, count = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sum += pixels[y * width + x]!; count++; }
  return count ? sum / count : NaN;
}

export function validateUniformSlab(
  testCase: SlabValidationCase,
  kvp: number,
  toleranceFraction = 0.05,
): SlabValidationResult {
  const rendered = renderUniformSlabRaw({ material: testCase.material, thicknessCm: testCase.thicknessCm, kvp });
  const expectedTransmission = beerLambertTransmission(rendered.muCmInv, testCase.thicknessCm);
  const measuredTransmission = centralRawMean(rendered.pixels, rendered.width, rendered.height);
  const percentError = Math.abs(measuredTransmission - expectedTransmission) / Math.max(1e-12, expectedTransmission) * 100;
  return {
    ...testCase,
    kvp,
    effectiveEnergyKev: rendered.effectiveEnergyKev,
    muCmInv: rendered.muCmInv,
    expectedTransmission,
    measuredTransmission,
    percentError,
    passed: percentError <= toleranceFraction * 100,
  };
}

export function validateThicknessDoubling(
  material: ValidationSlabMaterial,
  thicknessCm: number,
  kvp: number,
  toleranceFraction = 0.05,
): ThicknessDoublingResult {
  const single = renderUniformSlabRaw({ material, thicknessCm, kvp });
  const doubled = renderUniformSlabRaw({ material, thicknessCm: thicknessCm * 2, kvp });
  const singleTransmission = centralRawMean(single.pixels, single.width, single.height);
  const doubleTransmission = centralRawMean(doubled.pixels, doubled.width, doubled.height);
  const squaredSingleTransmission = singleTransmission * singleTransmission;
  const percentError = Math.abs(doubleTransmission - squaredSingleTransmission) / Math.max(1e-12, squaredSingleTransmission) * 100;
  return { material, thicknessCm, singleTransmission, doubleTransmission, squaredSingleTransmission, percentError, passed: percentError <= toleranceFraction * 100 };
}

export function runPhysicsValidation(kvp = 80, toleranceFraction = 0.05): PhysicsValidationReport {
  const effectiveEnergyKev = effectivePhotonEnergyKev(kvp);
  const slabs = DEFAULT_SLAB_VALIDATION_CASES.map(testCase => validateUniformSlab(testCase, kvp, toleranceFraction));
  const doubling = [
    validateThicknessDoubling("soft", 5, kvp, toleranceFraction),
    validateThicknessDoubling("pmma", 5, kvp, toleranceFraction),
    validateThicknessDoubling("aluminium", 1, kvp, toleranceFraction),
    validateThicknessDoubling("corticalBone", 0.5, kvp, toleranceFraction),
  ];
  return { kvp, effectiveEnergyKev, toleranceFraction, slabs, doubling, passed: slabs.every(x => x.passed) && doubling.every(x => x.passed) };
}

export function formatPhysicsValidationReport(report: PhysicsValidationReport): string {
  const lines = [
    `Bucky Lab slab validation @ ${report.kvp} kVp (effective energy ${report.effectiveEnergyKev.toFixed(2)} keV)`,
    `Tolerance: ${(report.toleranceFraction * 100).toFixed(1)}%`,
  ];
  for (const r of report.slabs) lines.push(`${r.passed ? "PASS" : "FAIL"} ${r.id}: expected=${r.expectedTransmission.toFixed(6)} measured=${r.measuredTransmission.toFixed(6)} error=${r.percentError.toFixed(3)}%`);
  for (const r of report.doubling) lines.push(`${r.passed ? "PASS" : "FAIL"} doubling ${r.material} ${r.thicknessCm}→${r.thicknessCm * 2} cm: T2=${r.doubleTransmission.toFixed(6)} T1²=${r.squaredSingleTransmission.toFixed(6)} error=${r.percentError.toFixed(3)}%`);
  lines.push(report.passed ? "PHYSICS VALIDATION PASSED" : "PHYSICS VALIDATION FAILED");
  return lines.join("\n");
}
