import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const renderUrl = new URL("./render-radiograph.ts", import.meta.url);
const tissueUrl = new URL("./atlas-tissue-projector.ts", import.meta.url);
const skeletalUrl = new URL("./atlas-skeletal-projector.ts", import.meta.url);

test("production renderer integrates atlas material paths before Beer-Lambert", async () => {
  const source = await readFile(renderUrl, "utf8");
  for (const token of [
    "projectAtlasTissuePaths",
    "projectAtlasSkeletalPaths",
    "canonicalAtlasMaterialProjection",
    "beam.opticalDepth(materialPaths)",
    "beam.transmission(materialPaths)",
    "mergeSkeletal(materialPaths",
    "applyPathologyMaterials(materialPaths",
  ]) assert.ok(source.includes(token), `render path missing ${token}`);
  assert.ok(!source.includes("pathologyDelta("), "pathology must not inject a direct optical-density delta");
  assert.ok(!/softOD\s*\+\s*bone\s*\+\s*pathOD/.test(source), "renderer must not add separately pre-integrated atlas optical depths");
});

test("atlas projectors expose centimetre material path maps without post-OD feathering", async () => {
  const [tissue, skeletal] = await Promise.all([readFile(tissueUrl, "utf8"), readFile(skeletalUrl, "utf8")]);
  for (const token of ["AtlasTissueMaterialPaths", "projectAtlasTissuePaths", "inflatedLung:Float32Array", "blood:Float32Array"])
    assert.ok(tissue.includes(token), `tissue projector missing ${token}`);
  for (const token of ["AtlasSkeletalMaterialPaths", "projectAtlasSkeletalPaths", "corticalBone:Float32Array", "trabecularBone:Float32Array", "displacedSoft:Float32Array"])
    assert.ok(skeletal.includes(token), `skeletal projector missing ${token}`);
  assert.ok(!/primaryOpticalDepth\([^\n]+\)\s*\*\s*feather/.test(tissue), "tissue atlas must not feather optical depth after attenuation");
  assert.ok(!/const\s+physical\s*=\s*blur\(out/.test(tissue), "tissue atlas must not blur the final physical optical-depth map before rendering");
});
