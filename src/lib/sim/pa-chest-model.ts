import type { Patient, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule, softEllipse } from "./geometry";

const emptyPaths=():Paths=>({air:0,lung:0,fat:0,soft:0,bone:0,cortical:0,gas:0,metal:0});
const clamp01=(v:number)=>Math.max(0,Math.min(1,v));
const smooth01=(v:number)=>{const t=clamp01(v);return t*t*(3-2*t);};
const gauss=(x:number,y:number,cx:number,cy:number,rx:number,ry:number)=>Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2)*1.65);

function lungField(x:number,y:number,side:-1|1,s:number,bottom:number):number{
 const yy=y/s,apex=20.0,base=bottom/s,t=clamp01((yy-apex)/Math.max(1,base-apex));
 const superior=smooth01((yy-apex)/1.7),inferior=1-smooth01((yy-base+0.65)/1.35);
 const centre=side*(3.0+2.25*t-0.22*t*t)*s;
 const bulge=Math.pow(Math.sin(Math.PI*Math.min(.995,t)),.52);
 const width=(1.25+7.75*bulge-.48*t)*s;
 const q=Math.abs(x-centre)/Math.max(.4,width);
 const lateral=q<1.08?Math.exp(-Math.pow(q/.83,5.2))*smooth01((1.08-q)/.12):0;
 return superior*inferior*lateral;
}

function addFallbackSkeleton(p:Paths,x:number,y:number,s:number):void{
 for(let i=0;i<10;i++){const y0=(23.7+i*2.35)*s,drop=(1.05+i*.055)*s;for(const side of[-1,1]as const){p.bone+=softCapsule(x,y,side*1.5*s,y0,side*6.2*s,y0+.38*drop,.11*s,.34)*.028;p.bone+=softCapsule(x,y,side*6.2*s,y0+.38*drop,side*11.7*s,y0+drop,.11*s,.34)*.024;}}
 p.bone+=softCapsule(x,y,-11.2*s,23.8*s,-2*s,26.7*s,.20*s,.30)*.11;p.bone+=softCapsule(x,y,11.2*s,23.8*s,2*s,26.7*s,.20*s,.30)*.11;
}

export function samplePaChest(x:number,y:number,patient:Patient,pose:SimPose,seed:number):Paths{
 const p=emptyPaths(),s=patient.heightCm/170,w=patient.morph.torsoWidth,depth=patient.thickness.chest,insp=pose.breath==="inspiration"?1:0;
 const upper=softEllipse(x,y,0,29.0*s,15.3*w*s,10.1*s,0,.05),mid=softEllipse(x,y,0,38.3*s,15.7*w*s,12.5*s,0,.05),lower=softEllipse(x,y,0,46.5*s,14.0*w*s,8.0*s,0,.05);
 const shoulderL=gauss(x,y,-12.6*w*s,23.7*s,5.0*s,2.8*s),shoulderR=gauss(x,y,12.6*w*s,23.7*s,5.0*s,2.8*s);
 const envelope=Math.max(upper,mid*.98,lower*.76,Math.min(.42,shoulderL+shoulderR));if(envelope<.002){p.air=36;return p;}
 const habitus=patient.habitus==="hypersthenic"?1.12:patient.habitus==="asthenic"?.86:1;p.soft=envelope*1.32*habitus;p.fat=envelope*(patient.habitus==="hypersthenic"?.44:patient.habitus==="asthenic"?.18:.25);
 const diaphragmBase=(49.4-insp*2.8)*s,rightDia=diaphragmBase-.95*s,leftDia=diaphragmBase+.35*s;
 let rightLung=lungField(x,y,-1,s,rightDia),leftLung=lungField(x,y,1,s,leftDia);
 const lv=gauss(x,y,3.45*s,42.3*s,3.75*s,5.75*s),rv=gauss(x,y,.55*s,41.0*s,2.35*s,4.75*s),la=gauss(x,y,2.0*s,37.0*s,2.05*s,2.45*s),root=gauss(x,y,.35*s,33.9*s,1.3*s,2.55*s);
 const heart=clamp01(Math.max(lv,rv*.65,la*.38,root*.26));leftLung*=Math.max(.07,1-heart*.95);rightLung*=Math.max(.74,1-heart*.06);
 const lungMask=Math.max(rightLung,leftLung);p.soft*=Math.max(.065,1-lungMask*.945);p.fat*=Math.max(.14,1-lungMask*.86);p.lung+=(rightLung+leftLung)*(.88+depth*.020);
 const upperMed=gauss(x,y,0,27.5*s,1.18*s,4.2*s),midMed=gauss(x,y,.08*s,33.7*s,1.38*s,5.7*s),aorta=gauss(x,y,1.85*s,29.8*s,.78*s,1.0*s);p.soft+=heart*.96+upperMed*.17+midMed*.24+aorta*.13;
 p.air+=softCapsule(x,y,0,19.8*s,0,29.6*s,.32*s,.28)*2.8;p.air+=softCapsule(x,y,0,29.5*s,-2.15*s,32.7*s,.17*s,.30)*.95;p.air+=softCapsule(x,y,0,29.5*s,2.0*s,32.5*s,.17*s,.30)*.95;
 // Hilar shadows and branching pulmonary vessels: dense centrally, progressively tapering peripherally.
 for(const side of[-1,1]as const){const hx=side*3.0*s,hy=(side<0?35.3:34.6)*s;p.soft+=gauss(x,y,hx,hy,1.12*s,1.55*s)*.19;const branches=[[4.4,31.4,.15,.13],[5.2,33.0,.14,.14],[5.8,35.0,.14,.15],[6.5,37.0,.13,.14],[7.2,39.0,.12,.13],[8.0,41.0,.105,.115],[8.8,43.0,.09,.095],[9.3,44.8,.075,.075],[6.3,43.5,.09,.09]];for(const [tx,ty,r,g]of branches){const ex=side*tx*s,ey=ty*s;p.soft+=softCapsule(x,y,hx,hy,ex,ey,r*s,.42)*g;const mx=hx+(ex-hx)*.55,my=hy+(ey-hy)*.55;p.soft+=softCapsule(x,y,mx,my,ex+side*.95*s,ey+(ty>hy/s?.65:-.55)*s,r*s*.48,.38)*g*.45;}}
 // Distinct hemidiaphragm domes. These also create visible cardio/costophrenic recesses rather than a flat basal fade.
 const rDomeY=rightDia+.038*((x+5.3*s)*(x+5.3*s))/s,lDomeY=leftDia+.042*((x-5.0*s)*(x-5.0*s))/s;
 const rGate=smooth01((x/s+13.4)/1.8)*(1-smooth01((x/s+.25)/1.7)),lGate=smooth01((x/s-.25)/1.7)*(1-smooth01((x/s-13.4)/1.8));
 const rn=(y-rDomeY)/(.36*s),ln=(y-lDomeY)/(.38*s);p.soft+=Math.exp(-(rn*rn))*.32*rGate;p.soft+=Math.exp(-(ln*ln))*.29*lGate;
 // Slight basal soft-tissue reinforcement below each dome increases diaphragm definition while preserving sharp lateral angles.
 p.soft+=smooth01((y-rightDia)/(.9*s))*(1-smooth01((y-rightDia-2.3*s)/(1.3*s)))*rGate*.08;p.soft+=smooth01((y-leftDia)/(.9*s))*(1-smooth01((y-leftDia-2.3*s)/(1.3*s)))*lGate*.07;
 p.gas+=gauss(x,y,5.0*s,leftDia+2.55*s,2.35*s,1.15*s)*1.45;
 const coarse=(fbm(x*.18,y*.18,seed+19)-.5)*.020,fine=(fbm(x*.72,y*.72,seed+29)-.5)*.008;p.soft+=lungMask*Math.max(0,coarse+fine)*.04;
 addFallbackSkeleton(p,x,y,s);return p;
}
