import {
  DEFAULT_FILTRATION_MM_AL,
  diagnosticSpectrum,
  effectivePhotonEnergyKev,
  linearAttenuationAtEnergy,
} from "./nist-attenuation.ts";

export interface BeamHardeningProfilePoint {
  radialFraction: number;
  pathCm: number;
  transmission: number;
  opticalDepth: number;
  apparentMuCmInv: number;
}

export interface BeamHardeningValidationReport {
  kvp: number;
  filtrationMmAl: number;
  effectiveEnergyKev: number;
  thinThicknessCm: number;
  thickThicknessCm: number;
  thinTransmission: number;
  thickTransmission: number;
  monoExtrapolatedThickTransmission: number;
  hardeningGainFraction: number;
  thinApparentMuCmInv: number;
  thickApparentMuCmInv: number;
  profile: BeamHardeningProfilePoint[];
  centreTransmission: number;
  edgeTransmission: number;
  centreOpticalDepth: number;
  edgeOpticalDepth: number;
  centreApparentMuCmInv: number;
  edgeApparentMuCmInv: number;
  passed: boolean;
  failures: string[];
}

function softTransmission(pathCm: number, kvp: number, filtrationMmAl: number): number {
  let t = 0;
  for (const bin of diagnosticSpectrum(kvp, filtrationMmAl)) {
    t += bin.weight * Math.exp(-linearAttenuationAtEnergy("soft", bin.energyKev) * Math.max(0, pathCm));
  }
  return Math.max(1e-12, Math.min(1, t));
}

function apparentMu(transmission: number, pathCm: number): number {
  return pathCm > 0 ? -Math.log(Math.max(1e-12, transmission)) / pathCm : 0;
}

/**
 * Validate that the production spectrum is genuinely polychromatic.
 *
 * For a monoenergetic beam, T(nx) = T(x)^n exactly. For a polychromatic beam,
 * preferential removal of low-energy photons hardens the transmitted spectrum,
 * therefore T(nx) > T(x)^n and the apparent attenuation coefficient falls with
 * increasing thickness.
 *
 * The cylinder profile also verifies lower primary transmission / greater optical
 * depth through the centre, while apparent mu is reduced centrally because the
 * centre ray has undergone more beam hardening.
 */
export function runBeamHardeningValidation(args: {
  kvp?: number;
  filtrationMmAl?: number;
  thinThicknessCm?: number;
  thickThicknessCm?: number;
  minimumHardeningGainFraction?: number;
  minimumApparentMuDropFraction?: number;
} = {}): BeamHardeningValidationReport {
  const kvp = args.kvp ?? 80;
  const filtrationMmAl = args.filtrationMmAl ?? DEFAULT_FILTRATION_MM_AL;
  const thinThicknessCm = args.thinThicknessCm ?? 5;
  const thickThicknessCm = args.thickThicknessCm ?? 20;
  const minimumHardeningGainFraction = args.minimumHardeningGainFraction ?? 0.02;
  const minimumApparentMuDropFraction = args.minimumApparentMuDropFraction ?? 0.01;
  const failures: string[] = [];

  if (!(thinThicknessCm > 0 && thickThicknessCm > thinThicknessCm)) {
    throw new Error("Beam-hardening validation requires thickThicknessCm > thinThicknessCm > 0.");
  }

  const spectrum = diagnosticSpectrum(kvp, filtrationMmAl);
  if (spectrum.length < 3) failures.push(`Spectrum has only ${spectrum.length} bins; expected a multi-bin polychromatic spectrum.`);

  const thinTransmission = softTransmission(thinThicknessCm, kvp, filtrationMmAl);
  const thickTransmission = softTransmission(thickThicknessCm, kvp, filtrationMmAl);
  const scale = thickThicknessCm / thinThicknessCm;
  const monoExtrapolatedThickTransmission = Math.pow(thinTransmission, scale);
  const hardeningGainFraction = (thickTransmission - monoExtrapolatedThickTransmission) /
    Math.max(1e-12, monoExtrapolatedThickTransmission);
  const thinApparentMuCmInv = apparentMu(thinTransmission, thinThicknessCm);
  const thickApparentMuCmInv = apparentMu(thickTransmission, thickThicknessCm);

  if (!(thickTransmission > monoExtrapolatedThickTransmission * (1 + minimumHardeningGainFraction))) {
    failures.push(
      `No measurable beam hardening: T(${thickThicknessCm} cm)=${thickTransmission.toExponential(6)} ` +
      `must exceed monoenergetic extrapolation ${monoExtrapolatedThickTransmission.toExponential(6)} ` +
      `by at least ${(minimumHardeningGainFraction * 100).toFixed(1)}%.`,
    );
  }
  if (!(thickApparentMuCmInv < thinApparentMuCmInv * (1 - minimumApparentMuDropFraction))) {
    failures.push(
      `Apparent mu did not decrease with thickness: ${thinApparentMuCmInv.toFixed(6)} -> ` +
      `${thickApparentMuCmInv.toFixed(6)} cm^-1.`,
    );
  }

  // Thick water-equivalent cylinder: central chord = diameter. The profile is
  // sampled from the centre to 90% of radius to avoid the zero-path boundary.
  const diameterCm = thickThicknessCm;
  const radiusCm = diameterCm / 2;
  const radialFractions = [0, 0.25, 0.5, 0.7, 0.85, 0.9] as const;
  const profile = radialFractions.map(radialFraction => {
    const r = radialFraction * radiusCm;
    const pathCm = 2 * Math.sqrt(Math.max(0, radiusCm * radiusCm - r * r));
    const transmission = softTransmission(pathCm, kvp, filtrationMmAl);
    const opticalDepth = -Math.log(Math.max(1e-12, transmission));
    return {
      radialFraction,
      pathCm,
      transmission,
      opticalDepth,
      apparentMuCmInv: apparentMu(transmission, pathCm),
    };
  });

  const centre = profile[0]!;
  const edge = profile[profile.length - 1]!;
  if (!(centre.transmission < edge.transmission)) {
    failures.push(`Cylinder profile invalid: centre transmission ${centre.transmission} is not lower than edge ${edge.transmission}.`);
  }
  if (!(centre.opticalDepth > edge.opticalDepth)) {
    failures.push(`Cylinder attenuation profile invalid: centre OD ${centre.opticalDepth} is not greater than edge OD ${edge.opticalDepth}.`);
  }
  if (!(centre.apparentMuCmInv < edge.apparentMuCmInv)) {
    failures.push(
      `Beam hardening absent across cylinder: centre apparent mu ${centre.apparentMuCmInv.toFixed(6)} ` +
      `must be lower than edge ${edge.apparentMuCmInv.toFixed(6)} cm^-1.`,
    );
  }

  return {
    kvp,
    filtrationMmAl,
    effectiveEnergyKev: effectivePhotonEnergyKev(kvp, filtrationMmAl),
    thinThicknessCm,
    thickThicknessCm,
    thinTransmission,
    thickTransmission,
    monoExtrapolatedThickTransmission,
    hardeningGainFraction,
    thinApparentMuCmInv,
    thickApparentMuCmInv,
    profile,
    centreTransmission: centre.transmission,
    edgeTransmission: edge.transmission,
    centreOpticalDepth: centre.opticalDepth,
    edgeOpticalDepth: edge.opticalDepth,
    centreApparentMuCmInv: centre.apparentMuCmInv,
    edgeApparentMuCmInv: edge.apparentMuCmInv,
    passed: failures.length === 0,
    failures,
  };
}

export function printBeamHardeningValidation(report: BeamHardeningValidationReport): void {
  console.log(`Beam hardening validation: ${report.kvp} kVp, ${report.filtrationMmAl} mm Al, Eeff=${report.effectiveEnergyKev.toFixed(2)} keV`);
  console.table([
    {
      object: `${report.thinThicknessCm} cm soft tissue`,
      transmission: report.thinTransmission,
      apparentMuCmInv: report.thinApparentMuCmInv,
    },
    {
      object: `${report.thickThicknessCm} cm soft tissue`,
      transmission: report.thickTransmission,
      apparentMuCmInv: report.thickApparentMuCmInv,
    },
    {
      object: "monoenergetic extrapolation",
      transmission: report.monoExtrapolatedThickTransmission,
      apparentMuCmInv: NaN,
    },
  ]);
  console.table(report.profile.map(p => ({
    radialFraction: p.radialFraction,
    pathCm: p.pathCm,
    transmission: p.transmission,
    opticalDepth: p.opticalDepth,
    apparentMuCmInv: p.apparentMuCmInv,
  })));
  if (!report.passed) for (const failure of report.failures) console.error(`[beam-hardening] ${failure}`);
}
