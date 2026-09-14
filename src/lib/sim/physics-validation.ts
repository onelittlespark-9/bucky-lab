import {
  DEFAULT_FILTRATION_MM_AL,
  aluminiumLinearAttenuationAtEnergy,
  diagnosticSpectrum,
  effectivePhotonEnergyKev,
  linearAttenuationAtEnergy,
  relativeTubeOutput,
  type MaterialPath,
  type RadiographicMaterial,
} from "./nist-attenuation.ts";

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

export interface KvpSweepPoint {
  kvp: number;
  mAs: number;
  filtrationMmAl: number;
  effectiveEnergyKev: number;
  openBeamSignal: number;
  softTissueMean: number;
  boneMean: number;
  softTissueTransmission: number;
  boneTransmission: number;
  normalisedBoneSoftContrast: number;
}

export interface KvpSweepReport {
  kvps: readonly number[];
  mAs: number;
  filtrationMmAl: number;
  softTissueThicknessCm: number;
  boneInsertThicknessCm: number;
  minimumRelativeDropPerStep: number;
  points: KvpSweepPoint[];
  passed: boolean;
  failures: string[];
}

export interface PhysicsValidationReport {
  kvp: number;
  effectiveEnergyKev: number;
  toleranceFraction: number;
  slabs: SlabValidationResult[];
  doubling: ThicknessDoublingResult[];
  kvpSweep: KvpSweepReport;
  passed: boolean;
}

const ENERGY_KEV = [30, 40, 50, 60, 80, 100, 120, 150] as const;
type Curve = readonly [number, number, number, number, number, number, number, number];
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

export const DEFAULT_KVP_SWEEP = [60, 80, 100, 120] as const;
export const DEFAULT_KVP_SWEEP_MAS = 5;
export const DEFAULT_KVP_SWEEP_SOFT_CM = 20;
export const DEFAULT_KVP_SWEEP_BONE_CM = 1;

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

export function centralRawMean(pixels: Float32Array, width: number, height: number): number {
  const x0 = Math.floor(width * 0.35), x1 = Math.ceil(width * 0.65);
  const y0 = Math.floor(height * 0.35), y1 = Math.ceil(height * 0.65);
  let sum = 0, count = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { sum += pixels[y * width + x]!; count++; }
  return count ? sum / count : NaN;
}

function polychromaticTransmission(paths: MaterialPath, kvp: number, filtrationMmAl: number): number {
  let transmission = 0;
  for (const bin of diagnosticSpectrum(kvp, filtrationMmAl)) {
    let tau = 0;
    for (const material of Object.keys(paths) as RadiographicMaterial[]) {
      const pathCm = Math.max(0, paths[material] ?? 0);
      if (pathCm > 0) tau += linearAttenuationAtEnergy(material, bin.energyKev) * pathCm;
    }
    transmission += bin.weight * Math.exp(-tau);
  }
  return Math.max(1e-12, Math.min(1, transmission));
}

export function renderKvpContrastPhantomRaw(args: {
  kvp: number;
  mAs?: number;
  filtrationMmAl?: number;
  softTissueThicknessCm?: number;
  boneInsertThicknessCm?: number;
  width?: number;
  height?: number;
}): {
  pixels: Float32Array;
  width: number;
  height: number;
  openBeamSignal: number;
  effectiveEnergyKev: number;
  softRoi: readonly [number, number, number, number];
  boneRoi: readonly [number, number, number, number];
} {
  const width = args.width ?? 128;
  const height = args.height ?? 96;
  const mAs = args.mAs ?? DEFAULT_KVP_SWEEP_MAS;
  const filtrationMmAl = args.filtrationMmAl ?? DEFAULT_FILTRATION_MM_AL;
  const softTissueThicknessCm = args.softTissueThicknessCm ?? DEFAULT_KVP_SWEEP_SOFT_CM;
  const boneInsertThicknessCm = Math.min(
    Math.max(0, args.boneInsertThicknessCm ?? DEFAULT_KVP_SWEEP_BONE_CM),
    softTissueThicknessCm,
  );

  // Fixed mAs; I0 is allowed to rise with kVp because tube output does in a real system.
  // Contrast is measured from I/I0-equivalent ROI ratios, so exposure quantity cannot fake
  // the kVp-dependent subject-contrast result.
  const openBeamSignal = mAs * relativeTubeOutput(args.kvp);
  const softTransmission = polychromaticTransmission(
    { soft: softTissueThicknessCm },
    args.kvp,
    filtrationMmAl,
  );
  const boneTransmission = polychromaticTransmission(
    {
      soft: softTissueThicknessCm - boneInsertThicknessCm,
      corticalBone: boneInsertThicknessCm,
    },
    args.kvp,
    filtrationMmAl,
  );

  const pixels = new Float32Array(width * height);
  pixels.fill(openBeamSignal);
  const y0 = Math.floor(height * 0.20);
  const y1 = Math.ceil(height * 0.80);
  const softX0 = Math.floor(width * 0.12);
  const softX1 = Math.floor(width * 0.46);
  const boneX0 = Math.ceil(width * 0.54);
  const boneX1 = Math.ceil(width * 0.88);
  for (let y = y0; y < y1; y++) {
    for (let x = softX0; x < softX1; x++) pixels[y * width + x] = openBeamSignal * softTransmission;
    for (let x = boneX0; x < boneX1; x++) pixels[y * width + x] = openBeamSignal * boneTransmission;
  }

  const roiInsetX = Math.max(2, Math.floor(width * 0.03));
  const roiInsetY = Math.max(2, Math.floor(height * 0.05));
  return {
    pixels,
    width,
    height,
    openBeamSignal,
    effectiveEnergyKev: effectivePhotonEnergyKev(args.kvp, filtrationMmAl),
    softRoi: [softX0 + roiInsetX, y0 + roiInsetY, softX1 - roiInsetX, y1 - roiInsetY],
    boneRoi: [boneX0 + roiInsetX, y0 + roiInsetY, boneX1 - roiInsetX, y1 - roiInsetY],
  };
}

function rawMeanInRoi(
  pixels: Float32Array,
  width: number,
  roi: readonly [number, number, number, number],
): number {
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

export function measureKvpSweepPoint(args: {
  kvp: number;
  mAs?: number;
  filtrationMmAl?: number;
  softTissueThicknessCm?: number;
  boneInsertThicknessCm?: number;
}): KvpSweepPoint {
  const mAs = args.mAs ?? DEFAULT_KVP_SWEEP_MAS;
  const filtrationMmAl = args.filtrationMmAl ?? DEFAULT_FILTRATION_MM_AL;
  const rendered = renderKvpContrastPhantomRaw({ ...args, mAs, filtrationMmAl });
  const softTissueMean = rawMeanInRoi(rendered.pixels, rendered.width, rendered.softRoi);
  const boneMean = rawMeanInRoi(rendered.pixels, rendered.width, rendered.boneRoi);
  const softTissueTransmission = softTissueMean / rendered.openBeamSignal;
  const boneTransmission = boneMean / rendered.openBeamSignal;
  const normalisedBoneSoftContrast = Math.abs(softTissueTransmission - boneTransmission) /
    Math.max(1e-12, softTissueTransmission);

  return {
    kvp: args.kvp,
    mAs,
    filtrationMmAl,
    effectiveEnergyKev: rendered.effectiveEnergyKev,
    openBeamSignal: rendered.openBeamSignal,
    softTissueMean,
    boneMean,
    softTissueTransmission,
    boneTransmission,
    normalisedBoneSoftContrast,
  };
}

export function runKvpSweepValidation(args: {
  kvps?: readonly number[];
  mAs?: number;
  filtrationMmAl?: number;
  softTissueThicknessCm?: number;
  boneInsertThicknessCm?: number;
  minimumRelativeDropPerStep?: number;
} = {}): KvpSweepReport {
  const kvps = args.kvps ?? DEFAULT_KVP_SWEEP;
  const mAs = args.mAs ?? DEFAULT_KVP_SWEEP_MAS;
  const filtrationMmAl = args.filtrationMmAl ?? DEFAULT_FILTRATION_MM_AL;
  const softTissueThicknessCm = args.softTissueThicknessCm ?? DEFAULT_KVP_SWEEP_SOFT_CM;
  const boneInsertThicknessCm = args.boneInsertThicknessCm ?? DEFAULT_KVP_SWEEP_BONE_CM;
  const minimumRelativeDropPerStep = args.minimumRelativeDropPerStep ?? 0.01;
  const points = kvps.map(kvp => measureKvpSweepPoint({
    kvp,
    mAs,
    filtrationMmAl,
    softTissueThicknessCm,
    boneInsertThicknessCm,
  }));
  const failures: string[] = [];

  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1]!;
    const current = points[i]!;
    const maximumAllowed = previous.normalisedBoneSoftContrast * (1 - minimumRelativeDropPerStep);
    if (!(current.normalisedBoneSoftContrast < maximumAllowed)) {
      failures.push(
        `${previous.kvp}→${current.kvp} kVp contrast did not decrease sufficiently: ` +
        `${previous.normalisedBoneSoftContrast.toFixed(6)}→${current.normalisedBoneSoftContrast.toFixed(6)}`,
      );
    }
    if (!(current.effectiveEnergyKev > previous.effectiveEnergyKev)) {
      failures.push(
        `${previous.kvp}→${current.kvp} kVp effective energy did not increase: ` +
        `${previous.effectiveEnergyKev.toFixed(3)}→${current.effectiveEnergyKev.toFixed(3)} keV`,
      );
    }
  }

  return {
    kvps,
    mAs,
    filtrationMmAl,
    softTissueThicknessCm,
    boneInsertThicknessCm,
    minimumRelativeDropPerStep,
    points,
    passed: failures.length === 0,
    failures,
  };
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
  const kvpSweep = runKvpSweepValidation();
  return {
    kvp,
    effectiveEnergyKev,
    toleranceFraction,
    slabs,
    doubling,
    kvpSweep,
    passed: slabs.every(x => x.passed) && doubling.every(x => x.passed) && kvpSweep.passed,
  };
}

export function formatPhysicsValidationReport(report: PhysicsValidationReport): string {
  const lines = [
    `Bucky Lab slab validation @ ${report.kvp} kVp (effective energy ${report.effectiveEnergyKev.toFixed(2)} keV)`,
    `Tolerance: ${(report.toleranceFraction * 100).toFixed(1)}%`,
  ];
  for (const r of report.slabs) lines.push(`${r.passed ? "PASS" : "FAIL"} ${r.id}: expected=${r.expectedTransmission.toFixed(6)} measured=${r.measuredTransmission.toFixed(6)} error=${r.percentError.toFixed(3)}%`);
  for (const r of report.doubling) lines.push(`${r.passed ? "PASS" : "FAIL"} doubling ${r.material} ${r.thicknessCm}→${r.thicknessCm * 2} cm: T2=${r.doubleTransmission.toFixed(6)} T1²=${r.squaredSingleTransmission.toFixed(6)} error=${r.percentError.toFixed(3)}%`);
  lines.push(
    `kVp sweep: fixed ${report.kvpSweep.mAs.toFixed(1)} mAs, ${report.kvpSweep.filtrationMmAl.toFixed(1)} mm Al, ` +
    `${report.kvpSweep.softTissueThicknessCm.toFixed(1)} cm soft tissue with ${report.kvpSweep.boneInsertThicknessCm.toFixed(1)} cm cortical-bone replacement`,
  );
  for (const point of report.kvpSweep.points) {
    lines.push(
      `  ${point.kvp} kVp: Eeff=${point.effectiveEnergyKev.toFixed(2)} keV ` +
      `Tsoft=${point.softTissueTransmission.toFixed(6)} Tbone=${point.boneTransmission.toFixed(6)} ` +
      `normalised contrast=${point.normalisedBoneSoftContrast.toFixed(6)}`,
    );
  }
  for (const failure of report.kvpSweep.failures) lines.push(`FAIL kVp sweep: ${failure}`);
  if (report.kvpSweep.passed) lines.push("PASS kVp sweep: bone-soft-tissue contrast decreases monotonically with rising kVp");
  lines.push(report.passed ? "PHYSICS VALIDATION PASSED" : "PHYSICS VALIDATION FAILED");
  return lines.join("\n");
}
