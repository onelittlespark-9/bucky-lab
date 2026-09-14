import test from "node:test";
import assert from "node:assert/strict";
import {
  formatQuantitativeRoiReport,
  validateQuantitativeRois,
} from "./quantitative-roi-validation.ts";

const KVP = 80;
const TOLERANCE = 0.15;

test("quantitative raw ROIs remain physically consistent before window/level", () => {
  const report = validateQuantitativeRois({ kvp: KVP, toleranceFraction: TOLERANCE });
  console.log(formatQuantitativeRoiReport(report));

  assert.equal(report.passed, true, formatQuantitativeRoiReport(report));
  assert.equal(report.measurements.length, 5);

  const byId = new Map(report.measurements.map(item => [item.id, item] as const));
  const cortical = byId.get("cortical")!;
  const medullary = byId.get("medullary")!;
  const soft = byId.get("softTissue")!;
  const air = byId.get("air")!;
  const water = byId.get("waterSlab")!;

  assert.ok(cortical.measuredTransmission < medullary.measuredTransmission,
    "Cortical bone must transmit less than the medullary cavity.");
  assert.ok(medullary.measuredTransmission < air.measuredTransmission,
    "Medullary path must still attenuate relative to air.");
  assert.ok(soft.measuredTransmission < air.measuredTransmission,
    "Soft tissue must attenuate relative to air.");
  assert.ok(Math.abs(water.measuredTransmission - soft.measuredTransmission) / soft.measuredTransmission < 0.01,
    "10 cm water-equivalent slab should match 10 cm soft-tissue transmission within 1%.");

  assert.ok(report.boneSoftContrast < 0,
    "Transmission-domain bone-soft contrast should be negative because cortical bone transmits less.");
  assert.ok(report.boneAirContrast < 0,
    "Transmission-domain bone-air contrast should be negative because cortical bone transmits less than air.");
  assert.ok(report.corticalMedullaryRatio < 1,
    "Cortical/medullary transmission ratio must be below 1.");

  assert.ok(report.boneSoftContrastError <= TOLERANCE * 100,
    `Bone-soft contrast error ${report.boneSoftContrastError.toFixed(2)}% exceeds 15%.`);
  assert.ok(report.boneAirContrastError <= TOLERANCE * 100,
    `Bone-air contrast error ${report.boneAirContrastError.toFixed(2)}% exceeds 15%.`);
  assert.ok(report.corticalMedullaryRatioError <= TOLERANCE * 100,
    `Cortical/medullary ratio error ${report.corticalMedullaryRatioError.toFixed(2)}% exceeds 15%.`);
});
