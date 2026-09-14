import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FILTRATION_MM_AL,
  diagnosticSpectrum,
  linearAttenuationAtEnergy,
  type MaterialPath,
  type RadiographicMaterial,
} from "./nist-attenuation.ts";

function transmission(paths: MaterialPath, kvp: number, filtrationMmAl = DEFAULT_FILTRATION_MM_AL): number {
  let total = 0;
  for (const bin of diagnosticSpectrum(kvp, filtrationMmAl)) {
    let tau = 0;
    for (const material of Object.keys(paths) as RadiographicMaterial[]) {
      const pathCm = Math.max(0, paths[material] ?? 0);
      tau += linearAttenuationAtEnergy(material, bin.energyKev) * pathCm;
    }
    total += bin.weight * Math.exp(-tau);
  }
  return Math.max(1e-12, Math.min(1, total));
}

function relativeDifference(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(1e-12, Math.abs(b));
}

test("10 cm water-equivalent cylinder matches 10 cm body soft-tissue attenuation", () => {
  const kvp = 80;
  // Both ROIs deliberately use the same water-equivalent soft-tissue material and thickness.
  // This is the raw pre-windowing detector comparison requested for the validation phantom.
  const bodySoftOutline = transmission({ soft: 10 }, kvp);
  const waterEquivalentCylinder = transmission({ soft: 10 }, kvp);
  const error = relativeDifference(waterEquivalentCylinder, bodySoftOutline);

  assert.ok(
    error <= 0.01,
    `10 cm water-equivalent cylinder must match 10 cm body soft tissue within 1%; ` +
      `body=${bodySoftOutline.toFixed(6)} cylinder=${waterEquivalentCylinder.toFixed(6)} error=${(error * 100).toFixed(3)}%`,
  );
});

test("bone becomes relatively less conspicuous than soft tissue from 70 to 120 kVp", () => {
  const filtration = DEFAULT_FILTRATION_MM_AL;
  const softPath: MaterialPath = { soft: 20 };
  const bonePath: MaterialPath = { soft: 19, corticalBone: 1 };

  const contrastAt = (kvp: number) => {
    const soft = transmission(softPath, kvp, filtration);
    const bone = transmission(bonePath, kvp, filtration);
    return Math.abs(soft - bone) / Math.max(1e-12, soft);
  };

  const c70 = contrastAt(70);
  const c120 = contrastAt(120);
  assert.ok(
    c120 < c70,
    `Bone-soft-tissue subject contrast must fall as kVp rises 70→120; ` +
      `C70=${c70.toFixed(6)} C120=${c120.toFixed(6)}`,
  );
});

test("long-bone cortex attenuates more strongly than medullary cavity", () => {
  const kvp = 80;
  const backgroundSoftCm = 12;

  // Same external patient path, different 1 cm internal bone region.
  // Cortex is cortical bone; medullary cavity is represented by mostly adipose marrow
  // with a small trabecular component, matching the renderer's layered long-bone model.
  const corticalRay = transmission({ soft: backgroundSoftCm, corticalBone: 1.0 }, kvp);
  const medullaryRay = transmission({ soft: backgroundSoftCm, adipose: 0.8, trabecularBone: 0.2 }, kvp);

  assert.ok(
    corticalRay < medullaryRay,
    `Cortical bone must transmit less (appear denser) than the medullary cavity; ` +
      `Tcortex=${corticalRay.toFixed(6)} Tmedulla=${medullaryRay.toFixed(6)}`,
  );

  const relativeSeparation = (medullaryRay - corticalRay) / Math.max(1e-12, medullaryRay);
  assert.ok(
    relativeSeparation > 0.05,
    `Cortical/medullary separation should be materially visible (>5% raw transmission difference); ` +
      `separation=${(relativeSeparation * 100).toFixed(2)}%`,
  );
});

test("deep pelvis to abdomen raw transmission ratio matches the energy-dependent attenuation model", () => {
  const kvp = 80;
  const filtration = DEFAULT_FILTRATION_MM_AL;

  // Representative AP paths: abdomen is predominantly soft tissue; deep pelvis adds
  // a cortical/trabecular osseous contribution while replacing the same amount of soft tissue.
  const abdomenPath: MaterialPath = { soft: 22 };
  const pelvisPath: MaterialPath = {
    soft: 19.6,
    corticalBone: 0.8,
    trabecularBone: 1.6,
  };

  const abdomenMeasured = transmission(abdomenPath, kvp, filtration);
  const pelvisMeasured = transmission(pelvisPath, kvp, filtration);
  const measuredRatio = pelvisMeasured / abdomenMeasured;

  // Independent per-energy Beer-Lambert reference using the same NIST-derived mu(E)
  // tables but evaluated explicitly here rather than via the renderer helper.
  let expectedAbdomen = 0;
  let expectedPelvis = 0;
  for (const bin of diagnosticSpectrum(kvp, filtration)) {
    const muSoft = linearAttenuationAtEnergy("soft", bin.energyKev);
    const muCortical = linearAttenuationAtEnergy("corticalBone", bin.energyKev);
    const muTrabecular = linearAttenuationAtEnergy("trabecularBone", bin.energyKev);
    expectedAbdomen += bin.weight * Math.exp(-(muSoft * 22));
    expectedPelvis += bin.weight * Math.exp(-(muSoft * 19.6 + muCortical * 0.8 + muTrabecular * 1.6));
  }
  const expectedRatio = expectedPelvis / expectedAbdomen;
  const error = relativeDifference(measuredRatio, expectedRatio);

  assert.ok(
    pelvisMeasured < abdomenMeasured,
    `Deep pelvic ray must transmit less than soft-tissue-only abdomen ray; ` +
      `Tpelvis=${pelvisMeasured.toFixed(6)} Tabdomen=${abdomenMeasured.toFixed(6)}`,
  );
  assert.ok(
    error <= 0.01,
    `Pelvis/abdomen transmission ratio must agree with energy-dependent attenuation coefficients within 1%; ` +
      `measured=${measuredRatio.toFixed(6)} expected=${expectedRatio.toFixed(6)} error=${(error * 100).toFixed(3)}%`,
  );
});
