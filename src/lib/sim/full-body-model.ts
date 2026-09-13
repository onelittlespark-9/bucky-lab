import type { Patient } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule, softEllipse } from "./geometry";
const emptyPaths=():Paths=>({air:0,lung:0,fat:0,soft:0,bone:0,cortical:0,gas:0,metal:0});
const union=(...v:number[])=>Math.max(0,...v);
function bodyEnvelope(x:number,y:number,s:number,p:Patient){const tw=p.morph.torsoWidth,aw=p.morph.abdomen,hw=p.morph.hip,sw=p.morph.shoulder;
 const head=union(softEllipse(x,y,0,8.7*s,6.15*s,7.75*s,0,.10),softEllipse(x,y,0,13.1*s,4.7*s,4.1*s,0,.12));
 const neck=softCapsule(x,y,0,14.8*s,0,23.5*s,2.25*s,.16);
 const trapL=softCapsule(x,y,-1.7*s,22.2*s,-8.8*sw*s,27.2*s,2.25*s,.16),trapR=softCapsule(x,y,1.7*s,22.2*s,8.8*sw*s,27.2*s,2.25*s,.16);
 const chest=union(softEllipse(x,y,0,34.8*s,11.65*tw*s,9.9*s,0,.12),softEllipse(x,y,0,43.5*s,10.75*tw*s,8.9*s,0,.13));
 const abdomen=union(softEllipse(x,y,0,55.4*s,8.75*aw*s,7.5*s,0,.16),softEllipse(x,y,0,64.2*s,9.15*aw*s,7.1*s,0,.17));
 const pelvis=union(softEllipse(x,y,0,72.7*s,10.45*hw*s,6.8*s,0,.14),softEllipse(x,y,0,78.7*s,9.35*hw*s,5.4*s,0,.16));
 const upperArmL=softCapsule(x,y,-11.0*sw*s,28.2*s,-13.3*sw*s,56.0*s,2.05*s,.18),upperArmR=softCapsule(x,y,11.0*sw*s,28.2*s,13.3*sw*s,56.0*s,2.05*s,.18);
 const foreL=softCapsule(x,y,-13.3*sw*s,56*s,-14.25*sw*s,86.8*s,1.62*s,.18),foreR=softCapsule(x,y,13.3*sw*s,56*s,14.25*sw*s,86.8*s,1.62*s,.18);
 const handL=softEllipse(x,y,-14.45*sw*s,92.5*s,1.85*s,5.4*s,-.04,.16),handR=softEllipse(x,y,14.45*sw*s,92.5*s,1.85*s,5.4*s,.04,.16);
 const thighL=softCapsule(x,y,-5.0*hw*s,78.5*s,-5.35*hw*s,117.5*s,3.18*s,.15),thighR=softCapsule(x,y,5.0*hw*s,78.5*s,5.35*hw*s,117.5*s,3.18*s,.15);
 const calfL=softCapsule(x,y,-5.35*hw*s,117.5*s,-5.15*hw*s,157.0*s,2.35*s,.16),calfR=softCapsule(x,y,5.35*hw*s,117.5*s,5.15*hw*s,157.0*s,2.35*s,.16);
 const footL=softCapsule(x,y,-5.15*hw*s,158*s,-4.45*hw*s,169*s,2.0*s,.18),footR=softCapsule(x,y,5.15*hw*s,158*s,4.45*hw*s,169*s,2.0*s,.18);
 return union(head,neck,trapL,trapR,chest,abdomen,pelvis,upperArmL,upperArmR,foreL,foreR,handL,handR,thighL,thighR,calfL,calfR,footL,footR);}
export function sampleFullBody(x:number,y:number,patient:Patient,seed:number):Paths{const p=emptyPaths(),s=patient.heightCm/170,env=bodyEnvelope(x,y,s,patient);if(env<.001){p.air=42;return p;}const yy=y/s;
 // projected body thickness varies continuously by region and towards the lateral skin margin
 const width=yy<20?6.2:yy<27?5.0:yy<50?11.7:yy<68?9.2:yy<82?10.2:yy<118?6.8:3.8;
 const lateral=Math.sqrt(Math.max(.05,1-Math.min(.96,(x/(width*s))**2)));
 const depth=(yy<20?.38:yy<27?.31:yy<50?.57:yy<68?.50:yy<82?.53:yy<118?.34:.28)*(.68+.32*lateral);
 p.soft=env*depth;p.fat=env*(patient.habitus==="hypersthenic"?.105:patient.habitus==="asthenic"?.028:.055)*(.75+.25*lateral);
 // lung fields with medial hilar concavity and inferior domes
 const ru=softEllipse(x,y,-4.9*s,35.2*s,5.55*s,11.1*s,-.02,.13),rl=softEllipse(x,y,-5.05*s,43.0*s,5.65*s,8.2*s,.02,.14),lu=softEllipse(x,y,4.8*s,35.1*s,5.4*s,11.0*s,.02,.13),ll=softEllipse(x,y,5.15*s,42.5*s,5.15*s,7.7*s,-.02,.14);
 const r=Math.max(ru,rl),l=Math.max(lu,ll),lungs=Math.max(r,l);p.lung+=(r+l)*(1.48+patient.thickness.chest*.014);p.soft*=Math.max(.075,1-lungs*.91);p.fat*=Math.max(.22,1-lungs*.72);
 // mediastinal and cardiac contours kept translucent at whole-body scale
 const sup=softEllipse(x,y,.05*s,30.5*s,1.75*s,6.1*s,0,.16),med=softEllipse(x,y,.25*s,39.0*s,2.05*s,7.0*s,0,.17),hr=softEllipse(x,y,-.45*s,43.8*s,2.75*s,4.8*s,.06,.16),hl=softEllipse(x,y,2.15*s,45.2*s,3.75*s,5.3*s,.10,.15),ap=softEllipse(x,y,2.55*s,48.0*s,2.75*s,2.7*s,.08,.16),cardiac=Math.max(hr,hl,ap);p.soft+=sup*.20+med*.23+cardiac*.43;p.lung*=Math.max(.20,1-cardiac*.65);p.air+=softCapsule(x,y,0,16*s,0,29.5*s,.28*s,.22)*2.2;
 // diaphragm and abdomen: broad gradients rather than organ-shaped circles
 const liver=softEllipse(x,y,-3.5*s,54.7*s,6.7*s,4.5*s,.02,.20),left=softEllipse(x,y,3.8*s,55.7*s,4.6*s,3.9*s,-.02,.20);p.soft+=liver*.18+left*.08;p.gas+=softEllipse(x,y,4.3*s,54.4*s,1.75*s,1.15*s,0,.22)*.62;p.soft+=softEllipse(x,y,0,63*s,8.1*s,6.5*s,0,.22)*.07+softEllipse(x,y,0,74*s,8.8*s,5.3*s,0,.22)*.06;
 const broad=fbm(x*.075,y*.075,seed+211)-.5,mid=fbm(x*.22,y*.22,seed+223)-.5,fine=fbm(x*.68,y*.68,seed+227)-.5;p.soft=Math.max(0,p.soft+env*(broad*.026+mid*.012+fine*.004));return p;}
