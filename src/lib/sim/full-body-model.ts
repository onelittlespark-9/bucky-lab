import type { Patient } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule, softEllipse } from "./geometry";

const emptyPaths=():Paths=>({air:0,lung:0,fat:0,soft:0,bone:0,cortical:0,gas:0,metal:0});
const union=(...v:number[])=>Math.max(0,...v);

function envelope(x:number,y:number,s:number,p:Patient){
  const tw=p.morph.torsoWidth,aw=p.morph.abdomen,hw=p.morph.hip,sw=p.morph.shoulder;
  const head=softEllipse(x,y,0,9.7*s,7.15*s,8.65*s,0,.055);
  const neck=softCapsule(x,y,0,16.2*s,0,24.2*s,2.65*s,.10);
  const traps=softEllipse(x,y,0,26.1*s,10.4*sw*s,4.6*s,0,.07);
  const chest=union(softEllipse(x,y,0,34.0*s,12.7*tw*s,10.6*s,0,.055),softEllipse(x,y,0,43.2*s,11.9*tw*s,9.6*s,0,.06));
  const abdomen=union(softEllipse(x,y,0,55.0*s,9.8*aw*s,7.8*s,0,.07),softEllipse(x,y,0,64.2*s,10.5*aw*s,8.1*s,0,.07));
  const pelvis=union(softEllipse(x,y,0,73.5*s,11.8*hw*s,7.5*s,0,.06),softEllipse(x,y,0,79.8*s,10.8*hw*s,5.7*s,0,.07));
  const shoulderL=softCapsule(x,y,-8.4*sw*s,27.2*s,-13.0*sw*s,30.0*s,3.05*s,.08),shoulderR=softCapsule(x,y,8.4*sw*s,27.2*s,13.0*sw*s,30.0*s,3.05*s,.08);
  const armL=union(softCapsule(x,y,-13.2*sw*s,30*s,-14.3*sw*s,57*s,2.45*s,.09),softCapsule(x,y,-14.3*sw*s,58*s,-15.0*sw*s,87*s,2.05*s,.09),softEllipse(x,y,-15.1*sw*s,94*s,2.35*s,4.6*s,0,.08));
  const armR=union(softCapsule(x,y,13.2*sw*s,30*s,14.3*sw*s,57*s,2.45*s,.09),softCapsule(x,y,14.3*sw*s,58*s,15.0*sw*s,87*s,2.05*s,.09),softEllipse(x,y,15.1*sw*s,94*s,2.35*s,4.6*s,0,.08));
  const legL=union(softCapsule(x,y,-5.7*hw*s,80*s,-5.7*hw*s,119*s,3.8*s,.075),softCapsule(x,y,-5.7*hw*s,120*s,-5.55*hw*s,160*s,2.85*s,.08),softEllipse(x,y,-5.45*hw*s,168*s,2.8*s,5.2*s,0,.07));
  const legR=union(softCapsule(x,y,5.7*hw*s,80*s,5.7*hw*s,119*s,3.8*s,.075),softCapsule(x,y,5.7*hw*s,120*s,5.55*hw*s,160*s,2.85*s,.08),softEllipse(x,y,5.45*hw*s,168*s,2.8*s,5.2*s,0,.07));
  return union(head,neck,traps,chest,abdomen,pelvis,shoulderL,shoulderR,armL,armR,legL,legR);
}

export function sampleFullBody(x:number,y:number,patient:Patient,seed:number):Paths{
  const p=emptyPaths(),s=patient.heightCm/170,env=envelope(x,y,s,patient);
  if(env<.0015){p.air=42;return p;}
  const yy=y/s;
  const central=Math.exp(-Math.pow(x/(11*s),2));
  const depth=yy<20?.46:yy<49?.68:yy<82?.61:yy<120?.42:.34;
  p.soft=env*depth;
  p.fat=env*(patient.habitus==="hypersthenic"?.12:patient.habitus==="asthenic"?.035:.065);

  // Aerated lungs: long, tapering fields with a mediastinal notch and inferior diaphragmatic termination.
  const rUpper=softEllipse(x,y,-5.25*s,35.8*s,6.35*s,11.9*s,-.025,.07);
  const rLower=softEllipse(x,y,-5.0*s,44.2*s,6.25*s,9.3*s,.025,.07);
  const lUpper=softEllipse(x,y,5.15*s,35.8*s,6.05*s,11.8*s,.025,.07);
  const lLower=softEllipse(x,y,5.35*s,43.4*s,5.55*s,8.5*s,-.025,.07);
  const right=Math.max(rUpper,rLower),left=Math.max(lUpper,lLower),lungs=Math.max(right,left);
  p.lung+=(right+left)*(1.14+patient.thickness.chest*.012);
  p.soft*=Math.max(.13,1-lungs*.84);
  p.fat*=Math.max(.28,1-lungs*.62);

  // Mediastinum and heart are overlapping attenuation fields, not a single geometric plaque.
  const superiorMed=softEllipse(x,y,.1*s,30.8*s,2.15*s,6.8*s,0,.10);
  const lowerMed=softEllipse(x,y,.45*s,39.8*s,2.45*s,7.6*s,0,.11);
  const heartR=softEllipse(x,y,-.55*s,44.0*s,3.15*s,5.2*s,.08,.10);
  const heartL=softEllipse(x,y,2.65*s,45.8*s,4.65*s,6.0*s,.12,.09);
  const apex=softEllipse(x,y,2.9*s,49.0*s,3.3*s,3.0*s,.08,.10);
  const cardiac=Math.max(heartR,heartL,apex);
  p.soft+=superiorMed*.31+lowerMed*.34+cardiac*.72;
  p.lung*=Math.max(.18,1-cardiac*.70);
  p.air+=softCapsule(x,y,0,17.0*s,0,30.2*s,.34*s,.18)*2.7;

  // Diaphragmatic/subdiaphragmatic density gradients.
  const liver=softEllipse(x,y,-4.0*s,55.5*s,7.2*s,5.2*s,.02,.12);
  const leftUpperAbd=softEllipse(x,y,4.1*s,56.8*s,5.1*s,4.7*s,-.03,.13);
  p.soft+=liver*.26+leftUpperAbd*.12;
  p.gas+=softEllipse(x,y,4.7*s,55.0*s,2.15*s,1.45*s,-.05,.13)*.72;
  p.soft+=softEllipse(x,y,0,64*s,8.7*s,7.2*s,0,.16)*.11;
  p.soft+=softEllipse(x,y,0,75*s,9.5*s,6.0*s,0,.15)*.10;

  // Subtle depth modulation avoids flat mannequin limbs without drawing artificial joint circles.
  const broad=fbm(x*.085,y*.085,seed+211)-.5,mid=fbm(x*.24,y*.24,seed+223)-.5,fine=fbm(x*.72,y*.72,seed+227)-.5;
  const tissueTexture=env*(broad*.040+mid*.020+fine*.006);
  p.soft=Math.max(0,p.soft+tissueTexture+env*central*.008);
  return p;
}
