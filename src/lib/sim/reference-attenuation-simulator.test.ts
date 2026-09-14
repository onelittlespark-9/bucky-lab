import test from "node:test";
import assert from "node:assert/strict";
import { primaryTransmission } from "./nist-attenuation.ts";
import {
  referenceSpectrum,
  simulateReferenceCylinderProfile,
  simulateReferenceRay,
  type ReferenceMaterialPath,
} from "./reference-attenuation-simulator.ts";

function relativeError(measured:number,expected:number){
  return Math.abs(measured-expected)/Math.max(1e-12,Math.abs(expected));
}

const RAYS: Array<[string, ReferenceMaterialPath]> = [
  ["open-air", {}],
  ["10cm-soft", {soft:10}],
  ["lung", {soft:2.5,inflatedLung:17}],
  ["abdomen", {adipose:2,soft:18}],
  ["femur-cortex", {soft:10.8,corticalBone:.8,trabecularBone:.4}],
  ["femur-medulla", {soft:10.2,adipose:1.3,trabecularBone:.5}],
  ["pelvis", {adipose:2,soft:17,trabecularBone:1.2,corticalBone:.7}],
  ["mixed-thorax", {adipose:1.5,muscle:2,inflatedLung:14,blood:1.2,soft:2,corticalBone:.25}],
];

test("reference simulator uses a higher-resolution independent spectrum",()=>{
  for(const kvp of [60,80,100,120]){
    const bins=referenceSpectrum(kvp);
    assert.ok(bins.length>=39,`${kvp} kVp reference spectrum should use 1 keV bins`);
    const total=bins.reduce((s,b)=>s+b.weight,0);
    assert.ok(Math.abs(total-1)<1e-12,`${kvp} kVp reference spectrum must normalise to unity`);
  }
});

test("production polychromatic transmission agrees with the independent reference simulator",()=>{
  const tolerance=.03;
  for(const kvp of [60,80,100,120]){
    for(const [name,paths] of RAYS){
      const production=primaryTransmission(paths,kvp);
      const reference=simulateReferenceRay(paths,kvp).transmission;
      const error=relativeError(production,reference);
      assert.ok(error<=tolerance,`${name} @ ${kvp} kVp differs from reference by ${(error*100).toFixed(3)}%: production=${production}, reference=${reference}`);
    }
  }
});

test("reference simulator independently reproduces beam hardening and cupping",()=>{
  const thin=simulateReferenceRay({soft:5},80).transmission;
  const thick=simulateReferenceRay({soft:20},80).transmission;
  assert.ok(thick>Math.pow(thin,4),"reference model must exhibit beam hardening rather than monoenergetic scaling");
  const profile=simulateReferenceCylinderProfile({diameterCm:20,kvp:80});
  const centre=profile[0]!;
  const edge=profile[profile.length-1]!;
  assert.ok(centre.transmission<edge.transmission,"reference cylinder centre must transmit less than its edge");
  assert.ok(centre.opticalDepth>edge.opticalDepth,"reference cylinder centre must have greater optical depth");
  assert.ok(centre.apparentMuCmInv<edge.apparentMuCmInv,"reference cylinder centre must show a lower apparent mu after beam hardening");
});

test("reference bone-soft contrast falls monotonically with kVp",()=>{
  let previous=Infinity;
  for(const kvp of [60,80,100,120]){
    const soft=simulateReferenceRay({soft:20},kvp).transmission;
    const bone=simulateReferenceRay({soft:19,corticalBone:1},kvp).transmission;
    const contrast=Math.abs(soft-bone)/soft;
    assert.ok(contrast<previous,`${kvp} kVp reference bone-soft contrast must fall with increasing kVp`);
    previous=contrast;
  }
});
