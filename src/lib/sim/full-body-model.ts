import type { Patient } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule, softEllipse } from "./geometry";

const emptyPaths=():Paths=>({air:0,lung:0,fat:0,soft:0,bone:0,cortical:0,gas:0,metal:0});

function bodyEnvelope(x:number,y:number,s:number,p:Patient):number{
  const head=softEllipse(x,y,0,9.8*s,7.4*s,8.9*s,0,.10);
  const neck=softCapsule(x,y,0,17.0*s,0,23.0*s,3.2*s,.22);

  const upperThorax=softEllipse(x,y,0,32.5*s,13.3*p.morph.torsoWidth*s,11.4*s,0,.10);
  const lowerThorax=softEllipse(x,y,0,43.0*s,11.5*p.morph.torsoWidth*s,10.9*s,0,.10);
  const waist=softEllipse(x,y,0,54.5*s,9.4*p.morph.abdomen*s,8.8*s,0,.12);
  const abdomen=softEllipse(x,y,0,63.0*s,10.8*p.morph.abdomen*s,10.5*s,0,.12);
  const pelvis=softEllipse(x,y,0,76.0*s,12.0*p.morph.hip*s,9.6*s,0,.12);

  const shoulderL=softEllipse(x,y,-11.8*p.morph.shoulder*s,27.3*s,4.4*s,4.2*s,-.10,.14);
  const shoulderR=softEllipse(x,y,11.8*p.morph.shoulder*s,27.3*s,4.4*s,4.2*s,.10,.14);

  const upperArmL=Math.max(
    softEllipse(x,y,-14.2*p.morph.shoulder*s,39*s,2.9*s,9.6*s,-.03,.16),
    softEllipse(x,y,-14.5*p.morph.shoulder*s,53*s,2.5*s,7.1*s,-.02,.16),
  );
  const upperArmR=Math.max(
    softEllipse(x,y,14.2*p.morph.shoulder*s,39*s,2.9*s,9.6*s,.03,.16),
    softEllipse(x,y,14.5*p.morph.shoulder*s,53*s,2.5*s,7.1*s,.02,.16),
  );
  const elbowL=softEllipse(x,y,-14.7*p.morph.shoulder*s,61.3*s,2.5*s,3.2*s,0,.16);
  const elbowR=softEllipse(x,y,14.7*p.morph.shoulder*s,61.3*s,2.5*s,3.2*s,0,.16);
  const forearmL=Math.max(
    softEllipse(x,y,-14.9*p.morph.shoulder*s,72*s,2.35*s,8.7*s,-.02,.16),
    softEllipse(x,y,-15.1*p.morph.shoulder*s,84*s,1.9*s,5.4*s,-.01,.16),
  );
  const forearmR=Math.max(
    softEllipse(x,y,14.9*p.morph.shoulder*s,72*s,2.35*s,8.7*s,.02,.16),
    softEllipse(x,y,15.1*p.morph.shoulder*s,84*s,1.9*s,5.4*s,.01,.16),
  );
  const handL=softEllipse(x,y,-15.2*p.morph.shoulder*s,94.0*s,2.5*s,5.0*s,-.02,.14);
  const handR=softEllipse(x,y,15.2*p.morph.shoulder*s,94.0*s,2.5*s,5.0*s,.02,.14);

  const thighL=Math.max(
    softEllipse(x,y,-5.8*p.morph.hip*s,91*s,4.6*s,11.7*s,.02,.14),
    softEllipse(x,y,-5.7*p.morph.hip*s,109*s,4.0*s,9.2*s,.01,.14),
  );
  const thighR=Math.max(
    softEllipse(x,y,5.8*p.morph.hip*s,91*s,4.6*s,11.7*s,-.02,.14),
    softEllipse(x,y,5.7*p.morph.hip*s,109*s,4.0*s,9.2*s,-.01,.14),
  );
  const kneeL=softEllipse(x,y,-5.7*p.morph.hip*s,121.2*s,3.5*s,3.8*s,0,.14);
  const kneeR=softEllipse(x,y,5.7*p.morph.hip*s,121.2*s,3.5*s,3.8*s,0,.14);
  const calfL=Math.max(
    softEllipse(x,y,-5.7*p.morph.hip*s,135*s,3.4*s,10.5*s,.02,.14),
    softEllipse(x,y,-5.6*p.morph.hip*s,151*s,2.7*s,8.2*s,.01,.14),
  );
  const calfR=Math.max(
    softEllipse(x,y,5.7*p.morph.hip*s,135*s,3.4*s,10.5*s,-.02,.14),
    softEllipse(x,y,5.6*p.morph.hip*s,151*s,2.7*s,8.2*s,-.01,.14),
  );
  const ankleL=softEllipse(x,y,-5.6*p.morph.hip*s,162*s,2.35*s,3.4*s,0,.14);
  const ankleR=softEllipse(x,y,5.6*p.morph.hip*s,162*s,2.35*s,3.4*s,0,.14);
  const footL=softEllipse(x,y,-5.6*p.morph.hip*s,168*s,3.1*s,5.6*s,.02,.12);
  const footR=softEllipse(x,y,5.6*p.morph.hip*s,168*s,3.1*s,5.6*s,-.02,.12);

  return Math.max(
    head,neck,upperThorax,lowerThorax,waist,abdomen,pelvis,shoulderL,shoulderR,
    upperArmL,upperArmR,elbowL,elbowR,forearmL,forearmR,handL,handR,
    thighL,thighR,kneeL,kneeR,calfL,calfR,ankleL,ankleR,footL,footR,
  );
}

export function sampleFullBody(x:number,y:number,patient:Patient,seed:number):Paths{
  const p=emptyPaths(),s=patient.heightCm/170,env=bodyEnvelope(x,y,s,patient);
  if(env<.002){p.air=42;return p;}

  const yy=y/s;
  const torso=yy>=22&&yy<=86;
  const limb=yy>84;
  p.soft=env*(torso?.63:limb?.36:.46);
  p.fat=env*(patient.habitus==="hypersthenic"?.14:patient.habitus==="asthenic"?.045:.08);

  // Thorax: keep lung and mediastinal attenuation subordinate to the native atlas skeleton.
  const rightLung=softEllipse(x,y,-5.1*s,39.0*s,6.5*s,13.5*s,-.02,.12);
  const leftLung=softEllipse(x,y,4.9*s,39.4*s,6.0*s,13.1*s,.02,.12);
  const lungs=Math.max(rightLung,leftLung);
  p.lung+=(rightLung+leftLung)*(1.00+patient.thickness.chest*.015);
  p.soft*=Math.max(.22,1-lungs*.70);

  const mediastinum=softEllipse(x,y,.4*s,39.5*s,2.5*s,8.8*s,0,.18);
  const heartA=softEllipse(x,y,2.2*s,43.5*s,4.0*s,5.5*s,.16,.18);
  const heartB=softEllipse(x,y,3.3*s,47.0*s,4.4*s,4.0*s,.10,.18);
  p.soft+=mediastinum*.28+Math.max(heartA,heartB)*.82;
  p.lung*=Math.max(.25,1-Math.max(heartA,heartB)*.62);
  p.air+=softCapsule(x,y,0,18*s,0,29.5*s,.38*s,.28)*3.2;

  // Abdomen/pelvis: broad low-contrast fields rather than opaque geometric organs.
  p.soft+=softEllipse(x,y,-4.5*s,60.0*s,7.4*s,6.0*s,.02,.18)*.18;
  p.soft+=softEllipse(x,y,4.4*s,61.0*s,4.4*s,4.8*s,-.04,.18)*.08;
  p.gas+=softEllipse(x,y,4.8*s,58.5*s,2.1*s,1.6*s,-.06,.20)*.65;
  p.soft+=softEllipse(x,y,0,74.0*s,8.5*s,6.0*s,0,.20)*.08;

  // Very low amplitude tissue texture: enough to avoid flat blocks without drawing fake anatomy.
  const broad=fbm(x*.10,y*.10,seed+211)-.5;
  const mid=fbm(x*.30,y*.30,seed+223)-.5;
  const fine=fbm(x*.90,y*.90,seed+227)-.5;
  p.soft=Math.max(0,p.soft+env*(broad*.035+mid*.018+fine*.008));
  return p;
}
