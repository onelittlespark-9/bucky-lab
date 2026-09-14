import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runPhysicsValidation } from "../src/lib/sim/physics-validation.ts";
import { validateQuantitativeRois } from "../src/lib/sim/quantitative-roi-validation.ts";
import { runBeamHardeningValidation } from "../src/lib/sim/beam-hardening-validation.ts";
import { runKvpSweepValidation } from "../src/lib/sim/physics-validation.ts";
import { tracePrimaryRay, diagnosticSpectrum, linearAttenuationAtEnergy } from "../src/lib/sim/nist-attenuation.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function status(ok) { return ok ? "PASS" : "FAIL"; }
function pct(v) { return `${(v * 100).toFixed(2)}%`; }
function relErr(a, b) { return Math.abs(a - b) / Math.max(1e-12, Math.abs(b)); }

function runMaterialAssignmentAudit() {
  try {
    const output = execFileSync(process.execPath, ["--experimental-strip-types", "scripts/audit-atlas-materials.mjs"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const match = output.match(/Atlas material audit PASS: (\d+) meshes\/volumes audited; (\d+) skeletal structures/);
    return {
      passed: true,
      measured: match ? `${match[1]} meshes/volumes; ${match[2]} skeletal` : "atlas audit completed",
      expected: "all runtime atlas parts assigned; layered cortical/trabecular/marrow bone; required materials present",
      details: output.trim(),
    };
  } catch (error) {
    return {
      passed: false,
      measured: "material audit failed",
      expected: "all runtime atlas parts assigned to energy-dependent materials",
      details: String(error?.stderr || error?.stdout || error?.message || error),
    };
  }
}

function runSlabSuite(kvp = 80) {
  const report = runPhysicsValidation(kvp, 0.05);
  const rows = report.slabs.map(r => ({
    case: r.id,
    measured: r.measuredTransmission,
    expected: r.expectedTransmission,
    errorPercent: r.percentError,
    passed: r.passed,
  }));
  return { passed: rows.every(r => r.passed), rows };
}

function runRoiSuite(kvp = 80) {
  const report = validateQuantitativeRois({ kvp, toleranceFraction: 0.15 });
  return {
    passed: report.passed,
    report,
    rows: report.measurements.map(r => ({
      roi: r.label,
      measured: r.measuredTransmission,
      expected: r.expectedTransmission,
      errorPercent: r.percentError,
      passed: r.passed,
    })),
  };
}

function runBeamHardeningSuite(kvp = 80) {
  const report = runBeamHardeningValidation({ kvp, thinThicknessCm: 5, thickThicknessCm: 20 });
  return { passed: report.passed, report };
}

function runKvpSuite() {
  const report = runKvpSweepValidation({ kvps: [60, 80, 100, 120] });
  return { passed: report.passed, report };
}

function independentTransmission(paths, kvp) {
  let total = 0;
  for (const bin of diagnosticSpectrum(kvp)) {
    let tau = 0;
    for (const [material, pathCm] of Object.entries(paths)) {
      if (pathCm > 0) tau += linearAttenuationAtEnergy(material, bin.energyKev) * pathCm;
    }
    total += bin.weight * Math.exp(-tau);
  }
  return Math.max(1e-12, Math.min(1, total));
}

function runPathIntegritySuite(kvp = 80) {
  const rays = [
    ["air", {}],
    ["10cm-soft", { soft: 10 }],
    ["lung-ray", { soft: 2.5, inflatedLung: 17 }],
    ["abdomen-ray", { adipose: 2, soft: 18 }],
    ["femur-cortex", { soft: 10.8, corticalBone: 0.8, trabecularBone: 0.4 }],
    ["femur-medulla", { soft: 10.2, adipose: 1.3, trabecularBone: 0.5 }],
    ["pelvis-ray", { adipose: 2, soft: 17, trabecularBone: 1.2, corticalBone: 0.7 }],
    ["mixed-thorax", { adipose: 1.5, muscle: 2, inflatedLung: 14, blood: 1.2, soft: 2, corticalBone: 0.25 }],
  ];
  const rows = rays.map(([name, paths]) => {
    const trace = tracePrimaryRay(paths, kvp);
    const expectedTransmission = independentTransmission(paths, kvp);
    const measuredOpticalDepth = trace.effectiveOpticalDepth;
    const expectedOpticalDepth = -Math.log(Math.max(1e-12, expectedTransmission));
    const transmissionError = relErr(trace.transmission, expectedTransmission);
    const opticalDepthError = expectedOpticalDepth === 0 ? Math.abs(measuredOpticalDepth) : relErr(measuredOpticalDepth, expectedOpticalDepth);
    const perBinConsistent = trace.bins.every(bin => {
      const sum = bin.contributions.reduce((s, c) => s + c.muTimesPath, 0);
      return Math.abs(sum - bin.opticalDepth) <= 1e-10;
    });
    const passed = transmissionError <= 0.02 && opticalDepthError <= 0.02 && perBinConsistent;
    return {
      ray: name,
      materials: trace.materials.map(m => `${m.material}:${m.pathCm.toFixed(3)}cm`).join(" + ") || "air/open beam",
      measuredTransmission: trace.transmission,
      expectedTransmission,
      measuredOpticalDepth,
      expectedOpticalDepth,
      transmissionErrorPercent: transmissionError * 100,
      opticalDepthErrorPercent: opticalDepthError * 100,
      perBinConsistent,
      passed,
    };
  });
  return { passed: rows.every(r => r.passed), rows };
}

export async function RunFullPhysicsValidation() {
  const sections = [];

  const materialAudit = runMaterialAssignmentAudit();
  sections.push({ name: "1. Material assignment audit", passed: materialAudit.passed });
  console.log(`\n[1] ${status(materialAudit.passed)} Material assignment audit`);
  console.log(`Measured: ${materialAudit.measured}`);
  console.log(`Expected: ${materialAudit.expected}`);
  if (!materialAudit.passed) console.error(materialAudit.details);

  const slabs = runSlabSuite(80);
  sections.push({ name: "2. Slab absolute transmission", passed: slabs.passed });
  console.log(`\n[2] ${status(slabs.passed)} Slab absolute transmission tests`);
  console.table(slabs.rows);

  const roi = runRoiSuite(80);
  sections.push({ name: "3. Quantitative ROI contrast", passed: roi.passed });
  console.log(`\n[3] ${status(roi.passed)} Quantitative ROI contrast measurements`);
  console.table(roi.rows);
  console.log(`Bone-soft measured=${roi.report.boneSoftContrast.toFixed(6)} expected=${roi.report.expectedBoneSoftContrast.toFixed(6)} error=${roi.report.boneSoftContrastError.toFixed(2)}%`);
  console.log(`Bone-air measured=${roi.report.boneAirContrast.toFixed(6)} expected=${roi.report.expectedBoneAirContrast.toFixed(6)} error=${roi.report.boneAirContrastError.toFixed(2)}%`);
  console.log(`Cortical/medullary measured=${roi.report.corticalMedullaryRatio.toFixed(6)} expected=${roi.report.expectedCorticalMedullaryRatio.toFixed(6)} error=${roi.report.corticalMedullaryRatioError.toFixed(2)}%`);

  const hardening = runBeamHardeningSuite(80);
  sections.push({ name: "4. Beam hardening / cupping", passed: hardening.passed });
  console.log(`\n[4] ${status(hardening.passed)} Beam-hardening / cupping test`);
  console.table([
    { metric: "5 cm transmission", measured: hardening.report.thinTransmission, expected: "reference thin path" },
    { metric: "20 cm transmission", measured: hardening.report.thickTransmission, expected: `>${hardening.report.monoExtrapolatedThickTransmission.toExponential(6)} mono extrapolation` },
    { metric: "hardening gain", measured: pct(hardening.report.hardeningGainFraction), expected: ">=2.00%" },
    { metric: "centre OD", measured: hardening.report.centreOpticalDepth, expected: `>${hardening.report.edgeOpticalDepth.toFixed(6)} edge OD` },
    { metric: "centre apparent mu", measured: hardening.report.centreApparentMuCmInv, expected: `<${hardening.report.edgeApparentMuCmInv.toFixed(6)} edge mu` },
  ]);

  const sweep = runKvpSuite();
  sections.push({ name: "5. kVp contrast sweep", passed: sweep.passed });
  console.log(`\n[5] ${status(sweep.passed)} kVp contrast sweep`);
  console.table(sweep.report.points.map(p => ({
    kVp: p.kvp,
    effectiveEnergyKeV: p.effectiveEnergyKev,
    softTransmission: p.softTissueTransmission,
    boneTransmission: p.boneTransmission,
    normalisedBoneSoftContrast: p.normalisedBoneSoftContrast,
  })));

  const pathIntegrity = runPathIntegritySuite(80);
  sections.push({ name: "6. Path-length integrity", passed: pathIntegrity.passed });
  console.log(`\n[6] ${status(pathIntegrity.passed)} Path-length integrity (8 sample rays)`);
  console.table(pathIntegrity.rows);

  const passed = sections.every(s => s.passed);
  console.log("\n================ FULL PHYSICS VALIDATION ================");
  console.table(sections.map(s => ({ test: s.name, result: status(s.passed) })));
  console.log(passed
    ? "PASS: all attenuation physics gates passed. The attenuation model meets the current diagnostic-grade physics gate."
    : "FAIL: attenuation model is NOT diagnostic-grade. All six physics gates must pass before that label is permitted.");
  console.log("=========================================================\n");

  return { passed, sections, materialAudit, slabs, roi, hardening, sweep, pathIntegrity };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await RunFullPhysicsValidation();
  if (!result.passed) process.exitCode = 1;
}
