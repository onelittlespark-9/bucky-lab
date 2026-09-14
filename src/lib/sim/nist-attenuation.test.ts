import test from "node:test";
import assert from "node:assert/strict";
import {
  diagnosticSpectrum,
  effectivePhotonEnergyKev,
  linearAttenuationAtEnergy,
  materialTransmission,
  primaryOpticalDepth,
  primaryTransmission,
} from "./nist-attenuation.ts";

function close(actual:number,expected:number,tolerance:number,message:string){
  assert.ok(Math.abs(actual-expected)<=tolerance,`${message}: expected ${expected}, got ${actual}`);
}

test("NIST soft-tissue and cortical-bone anchor coefficients remain calibrated",()=>{
  // NIST ICRU-44 mass attenuation anchors multiplied by simulator densities.
  close(linearAttenuationAtEnergy("soft",30),0.3790*1.06,1e-6,"soft tissue at 30 keV");
  close(linearAttenuationAtEnergy("soft",100),0.1693*1.06,1e-6,"soft tissue at 100 keV");
  close(linearAttenuationAtEnergy("soft",150),0.1492*1.06,1e-6,"soft tissue at 150 keV");
  close(linearAttenuationAtEnergy("corticalBone",30),1.331*1.92,1e-6,"cortical bone at 30 keV");
  close(linearAttenuationAtEnergy("corticalBone",100),0.1855*1.92,1e-6,"cortical bone at 100 keV");
  close(linearAttenuationAtEnergy("corticalBone",150),0.1480*1.92,1e-6,"cortical bone at 150 keV");
});

test("spectrum extends to the selected tube potential and hardens with kVp",()=>{
  const s60=diagnosticSpectrum(60);
  const s120=diagnosticSpectrum(120);
  assert.ok(Math.max(...s60.map(b=>b.energyKev))<60,"60 kVp spectrum must terminate below tube potential");
  assert.ok(Math.max(...s120.map(b=>b.energyKev))>110,"120 kVp spectrum must contain >110 keV photons");
  assert.ok(effectivePhotonEnergyKev(120)>effectivePhotonEnergyKev(60),"effective energy must increase with kVp");
});

test("primary transmission is a true heterogeneous Beer-Lambert energy integral",()=>{
  const paths={soft:18,corticalBone:0.8,adipose:2} as const;
  const transmission=primaryTransmission(paths,80);
  assert.ok(transmission>0&&transmission<1,"mixed-material transmission must remain physical");
  close(primaryOpticalDepth(paths,80),-Math.log(transmission),1e-12,"OD must equal -ln transmission");
});

test("polychromatic beam hardening is preserved rather than forcing a monoenergetic square law",()=>{
  const t10=materialTransmission("soft",10,80);
  const t20=materialTransmission("soft",20,80);
  // In a polychromatic beam the first slab preferentially removes low-energy
  // photons, so the second equal slab attenuates a harder spectrum and T(20)
  // is greater than T(10)^2. Equality would indicate a single effective energy.
  assert.ok(t20>t10*t10,"polychromatic hardening must survive thickness doubling");
});

test("raising kVp increases penetration and reduces cortical-to-soft subject contrast",()=>{
  const soft={soft:20} as const;
  const bone={soft:20,corticalBone:1} as const;
  const t60=primaryTransmission(soft,60),t120=primaryTransmission(soft,120);
  assert.ok(t120>t60,"higher kVp must increase soft-tissue transmission");
  const contrast60=primaryOpticalDepth(bone,60)-primaryOpticalDepth(soft,60);
  const contrast120=primaryOpticalDepth(bone,120)-primaryOpticalDepth(soft,120);
  assert.ok(contrast120<contrast60,"bone-soft subject contrast must decrease as kVp rises");
});
