import type { Patient } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule, softEllipse } from "./geometry";

const emptyPaths=():Paths=>({air:0,lung:0,fat:0,soft:0,bone:0,cortical:0,gas:0,metal:0});
const clamp01=(v:number)=>Math.max(0,Math.min(1,v));
const smooth01=(v:number)=>{const t=clamp01(v);return t*t*(3-2*t);};

function bodyEnvelope(x:number,y:number,s:number,p:Patient):number{
  const head=softEllipse(x,y,0,10*s,8.0*s,9.2*s,0,.08);
  const neck=softCapsule(x,y,0,17*s,0,23*s,4.1*s,.18);
  const thorax=softEllipse(x,y,0,38*s,14.2*p.morph.torsoWidth*s,18.2*s,0,.08);
  const abdomen=softEllipse(x,y,0,61*s,12.7*p.morph.abdomen*s,15.0*s,0,.08);
  const pelvis=softEllipse(x,y,0,79*s,13.5*p.morph.hip*s,12.0*s,0,.08);
  const shoulderL=softEllipse(x,y,-14.2*p.morph.shoulder*s,27*s,5.0*s,5.2*s,-.18,.12);
  const shoulderR=softEllipse(x,y,14.2*p.morph.shoulder*s,27*s,5.0*s,5.2*s,.18,.12);
  const armL=softCapsule(x,y,-15.5*p.morph.shoulder*s,29*s,-17.0*p.morph.shoulder*s,72*s,2.8*s,.18);
  const armR=softCapsule(x,y,15.5*p.morph.shoulder*s,29*s,17.0*p.morph.shoulder*s,72*s,2.8*s,.18);
  const forearmL=softCapsule(x,y,-17.0*p.morph.shoulder*s,72*s,-17.8*p.morph.shoulder*s,94*s,2.35*s,.18);
  const forearmR=softCapsule(x,y,17.0*p.morph.shoulder*s,72*s,17.8*p.morph.shoulder*s,94*s,2.35*s,.18);
  const handL=softEllipse(x,y,-18.0*p.morph.shoulder*s,99*s,2.7*s,5.4*s,-.06,.12);
  const handR=softEllipse(x,y,18.0*p.morph.shoulder*s,99*s,2.7*s,5.4*s,.06,.12);
  const thighL=softCapsule(x,y,-6.7*p.morph.hip*s,87*s,-6.3*p.morph.hip*s,124*s,5.1*s,.16);
  const thighR=softCapsule(x,y,6.7*p.morph.hip*s,87*s,6.3*p.morph.hip*s,124*s,5.1*s,.16);
  const calfL=softCapsule(x,y,-6.2*p.morph.hip*s,123*s,-6.0*p.morph.hip*s,157*s,3.7*s,.16);
  const calfR=softCapsule(x,y,6.2*p.morph.hip*s,123*s,6.0*p.morph.hip*s,157*s,3.7*s,.16);
  const footL=softEllipse(x,y,-6.0*p.morph.hip*s,164*s,3.3*s,6.4*s,0,.12);
  const footR=softEllipse(x,y,6.0*p.morph.hip*s,164*s,3.3*s,6.4*s,0,.12);
  return Math.max(head,neck,thorax,abdomen,pelvis,shoulderL,shoulderR,armL,armR,forearmL,forearmR,handL,handR,thighL,thighR,calfL,calfR,footL,footR);
}

export function sampleFullBody(x:number,y:number,patient:Patient,seed:number):Paths{
  const p=emptyPaths(),s=patient.heightCm/170,env=bodyEnvelope(x,y,s,patient);
  if(env<.002){p.air=42;return p;}
  const yy=y/s;
  const torsoWeight=yy<24?0.50:yy<52?0.70:yy<88?0.82:0.42;
  p.soft=env*torsoWeight;
  p.fat=env*(patient.habitus==="hypersthenic"?.18:patient.habitus==="asthenic"?.055:.10);

  // Thoracic organs.
  const rL=softEllipse(x,y,-5.8*s,37.0*s,7.3*s,14.2*s,-.02,.10);
  const lL=softEllipse(x,y,5.4*s,37.4*s,6.7*s,13.8*s,.02,.10);
  const lungs=Math.max(rL,lL);
  p.lung+=(rL+lL)*(1.12+patient.thickness.chest*.018);
  p.soft*=Math.max(.12,1-lungs*.76);
  const heart=softEllipse(x,y,2.8*s,43.2*s,4.5*s,6.3*s,.20,.12);
  p.soft+=heart*1.18;
  p.lung*=Math.max(.18,1-heart*.72);
  p.air+=softCapsule(x,y,0,18*s,0,31*s,.42*s,.25)*4.2;

  // Abdominal and pelvic soft-tissue structure.
  p.soft+=softEllipse(x,y,-4.8*s,57.5*s,8.5*s,7.4*s,.03,.12)*.42; // liver
  p.soft+=softEllipse(x,y,4.5*s,59.0*s,5.3*s,5.7*s,-.06,.12)*.16; // stomach
  p.gas+=softEllipse(x,y,5.3*s,56.8*s,2.6*s,2.0*s,-.08,.15)*1.6;
  p.soft+=softEllipse(x,y,-5.3*s,66.0*s,2.6*s,4.0*s,.08,.14)*.18;
  p.soft+=softEllipse(x,y,5.3*s,66.0*s,2.6*s,4.0*s,-.08,.14)*.18;
  p.gas+=softEllipse(x,y,0,72*s,7.0*s,5.5*s,0,.18)*.16;

  // Gradual musculature/soft-tissue variation across the entire body.
  const broad=(fbm(x*.12,y*.12,seed+211)-.5),mid=(fbm(x*.38,y*.38,seed+223)-.5),fine=(fbm(x*1.15,y*1.15,seed+227)-.5);
  const texture=Math.max(-.08,Math.min(.12,broad*.075+mid*.035+fine*.014));
  p.soft=Math.max(0,p.soft+env*texture);

  // Slightly denser limb muscle columns, still subordinate to atlas bone.
  const limbs=smooth01((yy-82)/8);
  p.soft+=env*limbs*.08;
  return p;
}
