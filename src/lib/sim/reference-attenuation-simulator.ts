// Independent high-resolution reference attenuation simulator.
//
// This module deliberately does NOT import the production nist-attenuation engine.
// It re-implements the attenuation integration from tabulated NIST/ICRU-style
// anchor data using 1 keV spectral bins. The production engine currently uses
// 2 keV bins, so agreement between the two is a numerical/physics cross-check
// rather than a call through the same implementation.

export type ReferenceMaterial =
  | "air"
  | "inflatedLung"
  | "adipose"
  | "soft"
  | "muscle"
  | "blood"
  | "brain"
  | "trabecularBone"
  | "corticalBone"
  | "metal";

export type ReferenceMaterialPath = Partial<Record<ReferenceMaterial, number>>;

const ENERGY_KEV = [20, 30, 40, 50, 60, 80, 100, 120, 150] as const;
type Curve = readonly [number, number, number, number, number, number, number, number, number];

// NIST XCOM / ICRU-style mass attenuation coefficients (cm^2/g), matching the
// source data used to calibrate the production model but held independently here.
const MASS_MU: Record<ReferenceMaterial, Curve> = {
  air: [0.7779, 0.3538, 0.2485, 0.2080, 0.1875, 0.1662, 0.1541, 0.1460, 0.1356],
  inflatedLung: [0.8316, 0.3815, 0.2699, 0.2270, 0.2053, 0.1826, 0.1695, 0.1608, 0.1493],
  adipose: [0.5677, 0.3063, 0.2396, 0.2123, 0.1974, 0.1800, 0.1688, 0.1607, 0.1500],
  soft: [0.8230, 0.3790, 0.2688, 0.2264, 0.2048, 0.1823, 0.1693, 0.1608, 0.1492],
  muscle: [0.8205, 0.3783, 0.2685, 0.2262, 0.2048, 0.1823, 0.1693, 0.1608, 0.1492],
  blood: [0.8290, 0.3810, 0.2690, 0.2268, 0.2052, 0.1827, 0.1695, 0.1610, 0.1494],
  brain: [0.8120, 0.3770, 0.2680, 0.2260, 0.2045, 0.1820, 0.1690, 0.1605, 0.1489],
  trabecularBone: [2.28, 0.770, 0.460, 0.335, 0.275, 0.215, 0.188, 0.171, 0.151],
  corticalBone: [4.001, 1.331, 0.6655, 0.4242, 0.3148, 0.2229, 0.1855, 0.1644, 0.1480],
  metal: [15.85, 4.972, 2.214, 1.213, 0.7661, 0.4052, 0.2721, 0.2140, 0.1649],
};

const DENSITY_G_CM3: Record<ReferenceMaterial, number> = {
  air: 0.001205,
  inflatedLung: 0.180,
  adipose: 0.95,
  soft: 1.06,
  muscle: 1.05,
  blood: 1.06,
  brain: 1.04,
  trabecularBone: 0.62,
  corticalBone: 1.92,
  metal: 4.54,
};

const AL_MASS_MU: Curve = [3.441, 1.128, 0.5685, 0.3681, 0.2778, 0.2018, 0.1704, 0.1540, 0.1378];
const AL_DENSITY_G_CM3 = 2.699;
export const REFERENCE_BIN_WIDTH_KEV = 1;
export const REFERENCE_DEFAULT_FILTRATION_MM_AL = 2.5;

function interpolate(curve: Curve, energyKev: number): number {
  const e = Math.max(ENERGY_KEV[0], Math.min(ENERGY_KEV[ENERGY_KEV.length - 1], energyKev));
  for (let i = 0; i < ENERGY_KEV.length - 1; i++) {
    const e0 = ENERGY_KEV[i]!;
    const e1 = ENERGY_KEV[i + 1]!;
    if (e <= e1) {
      // Interpolate in log-energy, independently of the production beam-model cache.
      const t = Math.log(e / e0) / Math.log(e1 / e0);
      return curve[i]! + (curve[i + 1]! - curve[i]!) * t;
    }
  }
  return curve[curve.length - 1]!;
}

export function referenceLinearAttenuationAtEnergy(material: ReferenceMaterial, energyKev: number): number {
  return interpolate(MASS_MU[material], energyKev) * DENSITY_G_CM3[material];
}

function aluminiumMu(energyKev: number): number {
  return interpolate(AL_MASS_MU, energyKev) * AL_DENSITY_G_CM3;
}

export interface ReferenceSpectrumBin {
  energyKev: number;
  weight: number;
}

export function referenceSpectrum(
  kvp: number,
  filtrationMmAl = REFERENCE_DEFAULT_FILTRATION_MM_AL,
): readonly ReferenceSpectrumBin[] {
  const k = Math.round(Math.max(40, Math.min(150, kvp)));
  const filtrationCm = Math.max(0, Math.min(10, filtrationMmAl)) / 10;
  const raw: Array<{ energyKev: number; weightedSource: number }> = [];
  for (let energyKev = 20; energyKev < k; energyKev += REFERENCE_BIN_WIDTH_KEV) {
    const continuum = Math.max(0, (k - energyKev) * energyKev);
    const filterTransmission = Math.exp(-aluminiumMu(energyKev) * filtrationCm);
    const tungstenLines = k >= 72
      ? Math.exp(-Math.pow((energyKev - 59.3) / 2.8, 2)) * 0.18 +
        Math.exp(-Math.pow((energyKev - 67.2) / 3.1, 2)) * 0.10
      : 0;
    const detectorResponse = Math.pow(energyKev / 60, 0.28);
    const weightedSource = continuum * filterTransmission * (1 + tungstenLines) * detectorResponse;
    if (weightedSource > 0) raw.push({ energyKev, weightedSource });
  }
  const total = raw.reduce((sum, bin) => sum + bin.weightedSource, 0) || 1;
  return raw.map(bin => ({ energyKev: bin.energyKev, weight: bin.weightedSource / total }));
}

export interface ReferenceRayBin {
  energyKev: number;
  weight: number;
  opticalDepth: number;
  transmission: number;
}

export interface ReferenceRayResult {
  kvp: number;
  filtrationMmAl: number;
  paths: ReferenceMaterialPath;
  bins: ReferenceRayBin[];
  transmission: number;
  opticalDepth: number;
}

export function simulateReferenceRay(
  paths: ReferenceMaterialPath,
  kvp: number,
  filtrationMmAl = REFERENCE_DEFAULT_FILTRATION_MM_AL,
): ReferenceRayResult {
  const bins: ReferenceRayBin[] = [];
  let transmission = 0;
  for (const bin of referenceSpectrum(kvp, filtrationMmAl)) {
    let opticalDepth = 0;
    for (const [material, rawPath] of Object.entries(paths) as Array<[ReferenceMaterial, number | undefined]>) {
      const pathCm = Math.max(0, rawPath ?? 0);
      if (pathCm > 0) opticalDepth += referenceLinearAttenuationAtEnergy(material, bin.energyKev) * pathCm;
    }
    const t = Math.exp(-opticalDepth);
    transmission += bin.weight * t;
    bins.push({ energyKev: bin.energyKev, weight: bin.weight, opticalDepth, transmission: t });
  }
  transmission = Math.max(1e-12, Math.min(1, transmission));
  return { kvp, filtrationMmAl, paths, bins, transmission, opticalDepth: -Math.log(transmission) };
}

export function simulateReferenceCylinderProfile(args: {
  diameterCm?: number;
  kvp?: number;
  filtrationMmAl?: number;
  radialFractions?: readonly number[];
} = {}) {
  const diameterCm = args.diameterCm ?? 20;
  const kvp = args.kvp ?? 80;
  const filtrationMmAl = args.filtrationMmAl ?? REFERENCE_DEFAULT_FILTRATION_MM_AL;
  const radialFractions = args.radialFractions ?? [0, 0.25, 0.5, 0.7, 0.85, 0.9];
  const radius = diameterCm / 2;
  return radialFractions.map(radialFraction => {
    const r = Math.max(0, Math.min(0.999999, radialFraction)) * radius;
    const pathCm = 2 * Math.sqrt(Math.max(0, radius * radius - r * r));
    const ray = simulateReferenceRay({ soft: pathCm }, kvp, filtrationMmAl);
    return {
      radialFraction,
      pathCm,
      transmission: ray.transmission,
      opticalDepth: ray.opticalDepth,
      apparentMuCmInv: pathCm > 0 ? ray.opticalDepth / pathCm : 0,
    };
  });
}
