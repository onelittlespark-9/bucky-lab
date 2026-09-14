import test from "node:test";
import assert from "node:assert/strict";
import { printBeamHardeningValidation, runBeamHardeningValidation } from "./beam-hardening-validation.ts";

test("polychromatic spectrum produces measurable beam hardening and centre-to-edge profile", () => {
  const report = runBeamHardeningValidation({ kvp: 80, filtrationMmAl: 2.5, thinThicknessCm: 5, thickThicknessCm: 20 });
  printBeamHardeningValidation(report);

  assert.equal(report.passed, true, report.failures.join("\n"));
  assert.ok(report.thickTransmission > report.monoExtrapolatedThickTransmission);
  assert.ok(report.thickApparentMuCmInv < report.thinApparentMuCmInv);
  assert.ok(report.centreTransmission < report.edgeTransmission);
  assert.ok(report.centreOpticalDepth > report.edgeOpticalDepth);
  assert.ok(report.centreApparentMuCmInv < report.edgeApparentMuCmInv);
});

test("beam-hardening validation remains polychromatic across common diagnostic kVp values", () => {
  for (const kvp of [60, 80, 100, 120]) {
    const report = runBeamHardeningValidation({ kvp, filtrationMmAl: 2.5 });
    assert.equal(report.passed, true, `${kvp} kVp:\n${report.failures.join("\n")}`);
  }
});
