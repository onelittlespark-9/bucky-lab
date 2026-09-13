import type { Patient } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule, softEllipse } from "./geometry";

const emptyPaths=():Paths=>({air:0,lung:0,fat:0,soft:0,bone:0,cortical:0,gas:0,metal:0});
const clamp01=(v:number)=>Math.max(0,Math.min(1,v));
const smooth01=(v:number)=>{const t=clamp01(v);return t*t*(3-2*t);};

interface BodyMasks {
  envelope:number;
  axial:number;
  upperLimbs:number;
  lowerLimbs:number;
  head:number;
}

function bodyMasks(x:number,y:number,s:number,p:Patient):BodyMasks{
  const shoulderX=15.4*p.morph.shoulder*s;
  const hipX=6.8*p.morph.hip*s;

  const head=softEllipse(x,y,0,10.3*s,7.7*s,9.3*s,0,.10);
  const jaw=softEllipse(x,y,0,17.0*s,5.2*s,4.0*s,0,.16);
  const neck=softCapsule(x,y,0,17.4*s,0,24.4*s,3.55*s,.20);

  const upperThorax=softEllipse(x,y,0,32.8*s,13.6*p.morph.torsoWidth*s,11.0*s,0,.10);
  const lowerThorax=softEllipse(x,y,0,43.5*s,14.1*p.morph.torsoWidth*s,11.8*s,0,.10);
  const abdomen=softEllipse(x,y,0,62.2*s,11.5*p.morph.abdomen*s,15.2*s,0,.10);
  const pelvis=softEllipse(x,y,0,80.0*s,12.0*p.morph.hip*s,11.8*s,0,.10);

  const shoulderL=softCapsule(x,y,-8.8*s,25.2*s,-shoulderX,28.0*s,4.1*s,.20);
  const shoulderR=softCapsule(x,y,8.8*s,25.2*s,shoulderX,28.0*s,4.1*s,.20);

  const upperArmL=softCapsule(x,y,-shoulderX,29.0*s,-16.0*p.morph.shoulder*s,59.0*s,2.65*s,.18);
  const upperArmR=softCapsule(x,y,shoulderX,29.0*s,16.0*p.morph.shoulder*s,59.0*s,2.65*s,.18);
  const elbowL=softEllipse(x,y,-16.0*p.morph.shoulder*s,60.5*s,2.9*s,3.2*s,0,.15);
  const elbowR=softEllipse(x,y,16.0*p.morph.shoulder*s,60.5*s,2.9*s,3.2*s,0,.15);
  const forearmL=softCapsule(x,y,-16.0*p.morph.shoulder*s,61.0*s,-16.8*p.morph.shoulder*s,87.5*s,2.25*s,.18);
  const forearmR=softCapsule(x,y,16.0*p.morph.shoulder*s,61.0*s,16.8*p.morph.shoulder*s,87.5*s,2.25*s,.18);
  const handL=softEllipse(x,y,-16.9*p.morph.shoulder*s,93.2*s,2.55*s,6.3*s,-.04,.14);
  const handR=softEllipse(x,y,16.9*p.morph.shoulder*s,93.2*s,2.55*s,6.3*s,.04,.14);

  const groinL=softCapsule(x,y,-3.6*s,82.0*s,-hipX,89.0*s,4.9*s,.18);
  const groinR=softCapsule(x,y,3.6*s,82.0*s,hipX,89.0*s,4.9*s,.18);
  const thighL=softCapsule(x,y,-hipX,88.0*s,-6.5*p.morph.hip*s,122.0*s,4.75*s,.18);
  const thighR=softCapsule(x,y,hipX,88.0*s,6.5*p.morph.hip*s,122.0*s,4.75*s,.18);
  const kneeL=softEllipse(x,y,-6.4*p.morph.hip*s,124.0*s,4.2*s,4.5*s,0,.14);
  const kneeR=softEllipse(x,y,6.4*p.morph.hip*s,124.0*s,4.2*s,4.5*s,0,.14);
  const calfL=softCapsule(x,y,-6.4*p.morph.hip*s,127.0*s,-6.0*p.morph.hip*s,154.0*s,3.45*s,.18);
  const calfR=softCapsule(x,y,6.4*p.morph.hip*s,127.0*s,6.0*p.morph.hip*s,154.0*s,3.45*s,.18);
  const ankleL=softEllipse(x,y,-6.0*p.morph.hip*s,157.3*s,2.65*s,3.2*s,0,.15);
  const ankleR=softEllipse(x,y,6.0*p.morph.hip*s,157.3*s,2.65*s,3.2*s,0,.15);
  const footL=softEllipse(x,y,-6.0*p.morph.hip*s,165.0*s,3.0*s,7.0*s,0,.14);
  const footR=softEllipse(x,y,6.0*p.morph.hip*s,165.0*s,3.0*s,7.0*s,0,.14);

  const axial=Math.max(head,jaw,neck,upperThorax,lowerThorax,abdomen,pelvis,shoulderL,shoulderR,groinL,groinR);
  const upperLimbs=Math.max(upperArmL,upperArmR,elbowL,elbowR,forearmL,forearmR,handL,handR);
  const lowerLimbs=Math.max(thighL,thighR,kneeL,kneeR,calfL,calfR,ankleL,ankleR,footL,footR);
  return {envelope:Math.max(axial,upperLimbs,lowerLimbs),axial,upperLimbs,lowerLimbs,head};
}

export function sampleFullBody(x:number,y:number,patient:Patient,seed:number):Paths{
  const p=emptyPaths(),s=patient.heightCm/170,m=bodyMasks(x,y,s,patient);
  if(m.envelope<.002){p.air=42;return p;}
  const yy=y/s;

  // Region-specific projected tissue thickness rather than one lower-body blob.
  const headWeight=yy<20?.46:0;
  const thoraxWeight=yy>=20&&yy<52?.66:0;
  const abdomenWeight=yy>=52&&yy<75?.78:0;
  const pelvisWeight=yy>=75&&yy<92?.84:0;
  const upperLimbWeight=m.upperLimbs*.34;
  const lowerLimbWeight=m.lowerLimbs*(yy<128?.47:.37);
  const trunkWeight=Math.max(headWeight,thoraxWeight,abdomenWeight,pelvisWeight)*m.axial;
  p.soft=Math.max(trunkWeight,upperLimbWeight,lowerLimbWeight);

  const fatBase=patient.habitus==="hypersthenic"?.17:patient.habitus==="asthenic"?.045:.085;
  p.fat=m.envelope*fatBase*(m.axial>.2?1:.68);

  // Lungs and mediastinum share the same whole-body coordinates as the body envelope.
  const rL=softEllipse(x,y,-5.6*s,37.2*s,7.2*s,14.6*s,-.015,.10);
  const lL=softEllipse(x,y,5.4*s,37.5*s,6.8*s,14.2*s,.015,.10);
  const lungs=Math.max(rL,lL);
  p.lung+=(rL+lL)*(1.36+patient.thickness.chest*.018);
  p.soft*=Math.max(.055,1-lungs*.925);

  const heart=Math.max(
    softEllipse(x,y,2.7*s,42.8*s,4.1*s,6.0*s,.16,.12),
    softEllipse(x,y,.5*s,39.4*s,2.2*s,4.2*s,.04,.14)*.55,
  );
  p.soft+=heart*1.05;
  p.lung*=Math.max(.12,1-heart*.82);
  p.air+=softCapsule(x,y,0,18.0*s,0,30.0*s,.38*s,.25)*4.3;

  // Diaphragm/upper abdomen continuity.
  const rightDia=48.0*s,leftDia=49.2*s;
  const rightBelow=smooth01((y-rightDia)/(.85*s))*softEllipse(x,y,-5.2*s,52.5*s,7.9*s,5.2*s,0,.18);
  const leftBelow=smooth01((y-leftDia)/(.85*s))*softEllipse(x,y,4.0*s,53.0*s,7.2*s,5.0*s,0,.18);
  p.soft+=rightBelow*.42+leftBelow*.17;

  // Abdominal and pelvic structures are deliberately lower contrast than bone.
  p.soft+=softEllipse(x,y,-4.8*s,58.0*s,8.0*s,7.0*s,.02,.14)*.30;
  p.soft+=softEllipse(x,y,4.5*s,59.3*s,5.0*s,5.4*s,-.05,.15)*.10;
  p.gas+=softEllipse(x,y,5.2*s,56.8*s,2.5*s,1.85*s,-.06,.16)*1.55;
  p.soft+=softEllipse(x,y,-5.2*s,66.0*s,2.5*s,3.9*s,.06,.16)*.12;
  p.soft+=softEllipse(x,y,5.2*s,66.0*s,2.5*s,3.9*s,-.06,.16)*.12;
  p.gas+=softEllipse(x,y,0,72.5*s,7.3*s,5.2*s,0,.20)*.10;

  // Natural projected texture across all continuous soft tissues.
  const broad=fbm(x*.11,y*.11,seed+211)-.5;
  const mid=fbm(x*.34,y*.34,seed+223)-.5;
  const fine=fbm(x*1.05,y*1.05,seed+227)-.5;
  const texture=Math.max(-.055,Math.min(.075,broad*.050+mid*.026+fine*.010));
  p.soft=Math.max(0,p.soft+m.envelope*texture);

  // Preserve skin margins around the extremities without turning them into solid white columns.
  p.soft+=m.upperLimbs*.035+m.lowerLimbs*.045+m.head*.025;
  return p;
}
