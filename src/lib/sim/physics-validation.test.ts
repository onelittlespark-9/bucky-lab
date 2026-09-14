import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SLAB_VALIDATION_CASES,
  formatPhysicsValidationReport,
  runPhysicsValidation,
  validateThicknessDoubling,
  validateUniformSlab,
} from "./physics-validation.ts";

const KVP = 80;
const TOLERANCE = 0.05;

test("uniform slab raw transmission matches effective-energy Beer-Lambert within 5%", () => {
  const failures: string[] = [];
  for (const slab of DEFAULT_SLAB_VALIDATION_CASES) {
    const result = validateUniformSlab(slab, KVP, TOLERANCE);
    if (!result.passed) {
      failures.push(
        `${slab.id}: expected=${result.expectedTransmission.toFixed(6)} measured=${result.measuredTransmission.toFixed(6)} error=${result.percentError.toFixed(3)}%`,
      );
    }
  }
  assert.equal(failures.length, 0, failures.length ? `Slab validation failures:\n${failures.join("\n")}` : undefined);
});

test("doubling a uniform slab squares transmission in effective-energy validation mode", () => {
  const pairs = [
    ["soft", 5],
    ["pmma", 5],
    ["aluminium", 1],
    ["corticalBone", 0.5],
  ] as const;
  const failures: string[] = [];
  for (const [material, thicknessCm] of pairs) {
    const result = validateThicknessDoubling(material, thicknessCm, KVP, TOLERANCE);
    if (!result.passed) {
      failures.push(
        `${material} ${thicknessCm}→${thicknessCm * 2} cm: T2=${result.doubleTransmission.toFixed(6)} T1²=${result.squaredSingleTransmission.toFixed(6)} error=${result.percentError.toFixed(3)}%`,
      );
    }
  }
  assert.equal(failures.length, 0, failures.length ? `Thickness-doubling failures:\n${failures.join("\n")}` : undefined);
});

test("validation report fails as a single CI gate if any phantom case exceeds tolerance", () => {
  const report = runPhysicsValidation(KVP, TOLERANCE);
  console.log(formatPhysicsValidationReport(report));
  assert.equal(report.passed, true, formatPhysicsValidationReport(report));
});
