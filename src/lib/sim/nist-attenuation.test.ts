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
  close(linearAttenuationAtEnergy("soft",20),0.8230*1.06,1e-6,"soft tissue at 20 keV");
  close(linearAttenuationAtEnergy("soft",30),0.3790*1.06,1e-6,"soft tissue at 30 keV");
  close(linearAttenuationAtEnergy("soft",100),0.1693*1.06,1e-6,"soft tissue at 100 keV");
  close(linearAttenuationAtEnergy("soft",150),0.1492*1.06,1e-6,"soft tissue at 150 keV");
  close(linearAttenuationAtEnergy("corticalBone",20),4.001*1.92,1e-6,"cortical bone at 20 keV");
  close(linearAttenuationAtEnergy("corticalBone",30),1.331*1.92,1e-6,"cortical bone at 30 keV");
  close(linearAttenuationAtEnergy("corticalBone",100),0.1855*1.92,1e-6,"cortical bone at 100 keV");
  close(linearAttenuationAtEnergy("corticalBone",150),0.1480*1.92,1e-6,"cortical bone at 150 keV");
});

test("diagnostic spectra use at least 20 energy bins and extend toward selected tube potential",()=>{
  for(const kvp of [60,80,100,120]){
    const spectrum=diagnosticSpectrum(kvp);
    assert.ok(spectrum.length>=20,`${kvp} kVp must use at least 20 active energy bins, got ${spectrum.length}`);
    assert.ok(Math.min(...spectrum.map(b=>b.energyKev))<=20,`${kvp} kVp spectrum must include the low-energy diagnostic range`);
    assert.ok(Math.max(...spectrum.map(b=>b.energyKev))<kvp,`${kvp} kVp spectrum must terminate below tube potential`);
  }
  assert.ok(Math.max(...diagnosticSpectrum(120).map(b=>b.energyKev))>110,"120 kVp spectrum must contain >110 keV photons");
  assert.ok(effectivePhotonEnergyKev(120)>effectivePhotonEnergyKev(60),"effective energy must increase with kVp");
});

test("required materials retain distinct energy-dependent attenuation curves",()=>{
  const materials=["air","adipose","soft","trabecularBone","corticalBone"] as const;
  for(const material of materials){
    const low=linearAttenuationAtEnergy(material,30);
    const high=linearAttenuationAtEnergy(material,100);
    assert.notEqual(low,high,`${material} attenuation must vary with photon energy`);
    assert.ok(low>high,`${material} attenuation should fall across the diagnostic range`);
  }
  assert.ok(linearAttenuationAtEnergy("corticalBone",60)>linearAttenuationAtEnergy("trabecularBone",60));
  assert.ok(linearAttenuationAtEnergy("trabecularBone",60)>linearAttenuationAtEnergy("soft",60));
  assert.ok(linearAttenuationAtEnergy("soft",60)>linearAttenuationAtEnergy("adipose",60));
  assert.ok(linearAttenuationAtEnergy("adipose",60)>linearAttenuationAtEnergy("air",60));
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
  assert.ok(t20>t10*t10,"polychromatic hardening must survive thickness doubling");
});

test("raising kVp increases penetration and reduces cortical-to-soft subject contrast",()=>{
  const soft={soft:20} as const;
  const bone={soft:19,corticalBone:1} as const;
  const t60=primaryTransmission(soft,60),t120=primaryTransmission(soft,120);
  assert.ok(t120>t60,"higher kVp must increase soft-tissue transmission");
  const contrast60=Math.abs(primaryTransmission(bone,60)-t60)/t60;
  const contrast120=Math.abs(primaryTransmission(bone,120)-t120)/t120;
  assert.ok(contrast120<contrast60,"bone-soft subject contrast must decrease as kVp rises");
});
