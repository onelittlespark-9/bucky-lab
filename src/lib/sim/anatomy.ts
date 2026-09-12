import type { Patient, Projection, SimPose } from "./types";
import { fbm, rimEllipse, softCapsule, softEllipse } from "./geometry";
export interface Paths{air:number;lung:number;fat:number;soft:number;bone:number;cortical:number;gas:number;metal:number}
export interface SampleCtx{patient:Patient;projection:Projection;pose:SimPose;seed:number}
const E=():Paths=>({air:0,lung:0,fat:0,soft:0,bone:0,cortical:0,gas:0,metal:0});
export function hashPatient(id:string){let h=2166136261;for(const c of id){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
const sy=(v:number,p:Patient)=>v*p.heightCm/170, s=(p:Patient)=>p.heightCm/170;
const addBone=(p:Paths,v:number)=>{p.bone+=v};
function torso(x:number,y:number,c:SampleCtx,lat=false):Paths{const p=E(),{patient,pose,seed}=c,k=s(patient);if(lat){const env=softEllipse(x,y,0,sy(50,patient),14*patient.morph.torsoDepth,38*k,0,.1);if(env<.02){p.air=40;return p}p.soft=patient.thickness.chest*.9*env*.55;p.fat=env*2;const dia=sy(48,patient)+(pose.breath==="inspiration"?-2.5:1.5),lung=softEllipse(x,y,-2,dia-12,11,16+(pose.breath==="inspiration"?3:0),.1,.12);p.lung+=lung*patient.thickness.chest*.5;p.soft*=1-lung*.5;addBone(p,softCapsule(x,y,6,sy(28,patient),6.5,sy(48,patient),.6,.2)*4);for(let i=0;i<10;i++){const yy=sy(24+i*4.5,patient);addBone(p,softEllipse(x,y,-1.5,yy,1.4,1.2,0,.2)*6);addBone(p,softEllipse(x,y,-4.5,yy,1.2,1.5,0,.25)*3)}p.air+=10*(1-env);return p}const env=Math.max(0,1-Math.sqrt((x/(16*patient.morph.torsoWidth))**2+((y-sy(53,patient))/(39*k))**2*.72)*.94);if(env<.02){p.air=40;return p}const dia=sy(48,patient)+(pose.breath==="inspiration"?-2.5:1.5),lh=22*k+(pose.breath==="inspiration"?4:0),ly=dia-lh*.48;p.soft=Math.max(.4,.55*(patient.thickness.chest+patient.thickness.abdomen)*env);p.fat=(patient.habitus==="hypersthenic"?4.5:patient.habitus==="asthenic"?.8:2)*env;for(const q of[[-8.2*patient.morph.torsoWidth,ly,10.2*patient.morph.torsoWidth,lh*1.05],[7.4*patient.morph.torsoWidth,ly+.6,9.2*patient.morph.torsoWidth,lh]]as const){let l=softEllipse(x,y,q[0],q[1],q[2],q[3],0,.12);if(y>dia+1)l=0;p.lung+=l*patient.thickness.chest*.45;p.soft*=1-l*.55;p.soft+=l*fbm(x*.45,y*.45,seed+3)}const heart=softEllipse(x,y,2.6*patient.morph.torsoWidth,dia-6,6.4*patient.morph.torsoWidth,7.2*k,.45,.15);p.soft+=heart*7;p.lung*=1-heart*.85;p.lung+=softCapsule(x,y,0,sy(20,patient),.4,dia-10,.85,.3)*4;p.gas+=softEllipse(x,y,7.5*patient.morph.torsoWidth,dia+3.5,4.2,3.2,.2,.2)*6;const sx=.15*pose.rotationY;for(let i=0;i<12;i++){const yy=sy(22+i*4.2,patient),lum=i>=7,rx=lum?1.6:1.15,ry=lum?1.4:1.1;addBone(p,softEllipse(x,y,sx,yy,rx,ry,0,.2)*(lum?5.5:4.2));p.cortical+=rimEllipse(x,y,sx,yy,rx,ry,.35)*2}addBone(p,softCapsule(x,y,sx,sy(16,patient),sx,sy(88,patient),.7,.4)*2.2);for(const side of[-1,1]){const clav=softCapsule(x,y,-12*patient.morph.torsoWidth,sy(26,patient),12*patient.morph.torsoWidth,sy(26,patient),.55,.25);addBone(p,clav*4.5);p.cortical+=clav*1.4;const scap=softEllipse(x,y,side*11*patient.morph.torsoWidth,sy(32,patient),5.5,8,side*.3,.2);addBone(p,scap*(1-Math.min(1,pose.shoulderRoll*1.2))*2.8)}for(let i=0;i<10;i++)for(const side of[-1,1]){const yy=sy(27+i*2.8,patient),rib=softCapsule(x,y,side*3,yy,side*14*patient.morph.torsoWidth,yy+2.4,.36,.18);addBone(p,rib*2.7);p.cortical+=rib*.75}addBone(p,softEllipse(x,y,0,sy(76,patient),4,6,0,.2)*5);for(const side of[-1,1])addBone(p,softCapsule(x,y,side*8*patient.morph.torsoWidth,sy(84,patient),side*9*patient.morph.torsoWidth,sy(100,patient),1.3,.2)*6);return p}
function extremityBase(p:Paths,c:SampleCtx,x:number,y:number){const {patient,seed}=c;p.soft+=Math.max(0,patient.thickness.extremity)*.35;p.fat+=patient.habitus==="hypersthenic" ? .5 : .25;p.soft+=(fbm(x*1.8,y*1.8,seed)-.5)*.12}
function hand(x:number,y:number,c:SampleCtx):Paths{const p=E();extremityBase(p,c,x,y);for(let d=0;d<5;d++){const bx=-3.3+d*1.62;addBone(p,softCapsule(x,y,bx,-2,bx+(d-2)*.12,5.2,d===0?.5:.38,.14)*4.2);p.cortical+=rimEllipse(x,y,bx,1.6,d===0?.52:.4,3,.08)*1.2;let yy=4.8;for(let j=0;j<(d===0?2:3);j++){const len=(d===0?2.35:2.05)-j*.17,ph=softCapsule(x,y,bx,yy,bx,yy+len,.34-j*.025,.12);addBone(p,ph*(3.1-j*.18));p.cortical+=ph*.28;yy+=len+.28}}for(let r=0;r<2;r++)for(let col=0;col<4;col++){const cx=-2.4+col*1.55+(r?.22:0),cy=-4.8+r*1.35;addBone(p,softEllipse(x,y,cx,cy,.68,.62,0,.18)*3.8);p.cortical+=rimEllipse(x,y,cx,cy,.65,.6,.3)*.8}addBone(p,softCapsule(x,y,-2.4,-8,-2.1,-4.8,.7,.14)*4.5);addBone(p,softCapsule(x,y,2.3,-8,2,-4.8,.55,.14)*4);return p}
function wrist(x:number,y:number,c:SampleCtx){const p=hand(x,y+3.2,c);addBone(p,softEllipse(x,y,0,0,3.8,2.8,0,.18)*1.5);return p}
function elbow(x:number,y:number,c:SampleCtx):Paths{const p=E();extremityBase(p,c,x,y);addBone(p,softCapsule(x,y,0,-8,0,-1,1.55,.13)*6);p.cortical+=rimEllipse(x,y,0,-4.5,1.5,3.2,.55,.12)*1.4;addBone(p,softEllipse(x,y,-1.8,.3,1.5,1.25,0,.16)*5.5+softEllipse(x,y,1.8,.3,1.45,1.2,0,.16)*5.2);addBone(p,softCapsule(x,y,-.9,1,-1,8,.75,.13)*5.2+softCapsule(x,y,1,1,1,8,.62,.13)*4.7);const j=softEllipse(x,y,0,1.05,3,.42,0,.2);p.bone*=1-j*.72;return p}
function shoulder(x:number,y:number,c:SampleCtx):Paths{const p=E();extremityBase(p,c,x,y);addBone(p,softEllipse(x,y,0,.2,3.25,3.25,0,.12)*5.4);p.cortical+=rimEllipse(x,y,0,.2,3.15,3.1,.6,.12)*1.5;addBone(p,softCapsule(x,y,0,2,0,10.5,1.2,.14)*4.6);addBone(p,softEllipse(x,y,-3.7,-1.1,2.4,1.05,.25,.16)*3.8+softCapsule(x,y,-6.2,-1.2,6.2,-1.35,.48,.16)*3.2);return p}
function knee(x:number,y:number,c:SampleCtx,lat=false):Paths{const p=E();extremityBase(p,c,x,y);addBone(p,softCapsule(x,y,lat?1:0,-8.5,lat?1:0,lat?0:-.5,2,.13)*6);addBone(p,softEllipse(x,y,lat?0:-1.65,0,lat?2.4:1.75,lat?2.2:1.45,0,.16)*5.2);addBone(p,softCapsule(x,y,lat?.5:0,1.2,lat?.5:0,9,lat?1.9:2,.14)*5.2);addBone(p,softEllipse(x,y,lat?-2.5:-2.2,1,lat?1.5:1,lat?2.2:1.15,.2,.18)*3.5);const j=softEllipse(x,y,lat?.4:0,.65,lat?2.8:3.7,.42,0,.2);p.bone*=1-j*.72;return p}
function foot(x:number,y:number,c:SampleCtx):Paths{const p=E();extremityBase(p,c,x,y);for(let i=0;i<5;i++){const bx=-3.25+i*1.62;addBone(p,softCapsule(x,y,bx,-1.7,bx+(i-2)*.16,4.9,i===0?.48:.36,.13)*4.4);for(let j=0;j<2;j++)addBone(p,softCapsule(x,y,bx+(i-2)*.18,5.3+j*1.75,bx+(i-2)*.2,6.65+j*1.75,.25-j*.025,.12)*3.3)}for(let i=0;i<7;i++)addBone(p,softEllipse(x,y,-4+i*1.3,-4.4+Math.abs(i-3)*.25,.85,.9,.1*(i-3),.18)*3.8);addBone(p,softEllipse(x,y,0,-6,2.7,1.5,0,.16)*3.5);return p}
function ankle(x:number,y:number,c:SampleCtx):Paths{const p=E();extremityBase(p,c,x,y);addBone(p,softCapsule(x,y,-1.15,-8.5,-1,.8,1.05,.13)*5.3+softCapsule(x,y,1.15,-8.3,1.1,.6,.72,.13)*4.4);addBone(p,softEllipse(x,y,0,1.6,2.8,1.5,0,.15)*5+softEllipse(x,y,-2.25,1.1,.95,1.55,0,.15)*4+softEllipse(x,y,2.1,1,.85,1.45,0,.15)*3.6);const j=softEllipse(x,y,0,.65,2,.35,0,.2);p.bone*=1-j*.72;return p}
function cspine(x:number,y:number,c:SampleCtx):Paths{const p=E();p.soft=4;for(let i=0;i<7;i++){const yy=14+i*2.2;addBone(p,softEllipse(x,y,0,yy,1.15,.82,0,.12)*4.8);p.cortical+=rimEllipse(x,y,0,yy,1.1,.78,.35,.12);addBone(p,softEllipse(x,y,-1.9,yy,.75,.8,0,.18)*1.8);const d=softEllipse(x,y,0,yy+1.08,1,.18,0,.15);p.bone*=1-d*.55;p.soft+=d*.35}p.soft+=softEllipse(x,y,2.6,18,2.2,7.5,0,.2);p.air+=softCapsule(x,y,1.5,12,1.5,22,.55,.25)*3;return p}
function skull(x:number,y:number,c:SampleCtx):Paths{const p=E(),o=softEllipse(x,y,0,-1,11.5,10.5,0,.1),i=softEllipse(x,y,.2,-.7,9.7,8.9,0,.12);p.soft=3;addBone(p,o*3+i*1.8);p.cortical+=rimEllipse(x,y,0,-1,11.5,10.5,.65)*3.2+rimEllipse(x,y,.2,-.7,9.8,8.9,.5)*1.5;addBone(p,softEllipse(x,y,2.8,3.7,4.4,3,.25,.13)*2.5+softEllipse(x,y,4.5,6,4.8,2.7,.38,.13)*2);for(const q of[[3,2,2.7,2],[5.2,1.5,2,1.4],[2.8,5.2,1.8,1.4]]as const){const a=softEllipse(x,y,q[0],q[1],q[2],q[3],0,.18);p.air+=a*5.5;p.bone*=1-a*.4}return p}
function pelvis(x:number,y:number,c:SampleCtx):Paths{
  const p=E(),{patient,pose,seed}=c,k=s(patient);
  const cy=sy(78,patient),hipW=patient.morph.hip;
  const env=softEllipse(x,y,0,cy,18.5*hipW,16.5*k,0,.08);
  if(env<.015){p.air=42;return p}
  p.soft=3.8*env;p.fat=(patient.habitus==="hypersthenic"?3.8:patient.habitus==="asthenic"?1.1:2.2)*env;
  p.soft+=(fbm(x*.55,y*.55,seed+19)-.5)*.35*env;
  for(const side of[-1,1]){
    const sx=side*8.2*hipW,wing=softEllipse(x,y,sx,sy(70.5,patient),9.2*hipW,8.2*k,side*.12,.11);
    addBone(p,wing*2.8);p.cortical+=rimEllipse(x,y,sx,sy(70.5,patient),9.15*hipW,8.15*k,.72)*2.1;
    const crest=softCapsule(x,y,side*1.5,sy(64.8,patient),side*16.2*hipW,sy(66.8,patient),.72,.16);
    addBone(p,crest*3.4);p.cortical+=crest*.9;
    const ischium=softCapsule(x,y,side*5.8,sy(78,patient),side*8.2,sy(89.5,patient),2.1,.14);
    addBone(p,ischium*2.8);p.cortical+=ischium*.8;
  }
  addBone(p,softEllipse(x,y,0,sy(77.2,patient),4.5,9.4*k,0,.12)*3.4);p.cortical+=rimEllipse(x,y,0,sy(77.2,patient),4.45,9.35*k,.62)*1.7;
  for(let i=0;i<3;i++)for(const side of[-1,1])p.air+=softEllipse(x,y,side*(1.8+i*.45),sy(73.7+i*2.3,patient),.72,.62,0,.18)*2.2;
  for(const side of[-1,1]){const si=softCapsule(x,y,side*4.5,sy(67.8,patient),side*5.4,sy(77.5,patient),.32,.12);p.soft+=si*.7;p.bone*=1-si*.12;}
  for(const side of[-1,1]){
    const ax=side*6.1*hipW;addBone(p,softEllipse(x,y,ax,sy(79.2,patient),4.5*hipW,4.4*k,side*.08,.12)*2.7);p.cortical+=rimEllipse(x,y,ax,sy(79.2,patient),4.45*hipW,4.35*k,.62)*1.8;
    const joint=softEllipse(x,y,ax,sy(80.2,patient),2.75*hipW,2.55*k,0,.12);p.bone*=1-joint*.72;p.soft+=joint*.18;
    const of=softEllipse(x,y,side*6.5*hipW,sy(84.2,patient),3.0*hipW,4.0*k,side*.08,.1);p.air+=of*5.5;p.bone*=1-of*.72;
  }
  addBone(p,softEllipse(x,y,0,sy(84.8,patient),2.5,1.9,0,.14)*3.8);p.cortical+=rimEllipse(x,y,0,sy(84.8,patient),2.45,1.85,.65)*1.4;
  for(const side of[-1,1]){const upper=softCapsule(x,y,side*1.2,sy(84,patient),side*6.4,sy(82.7,patient),1.15,.14),lower=softCapsule(x,y,side*1.5,sy(86.5,patient),side*6.7,sy(89,patient),1.05,.14);addBone(p,upper*2.5+lower*2.2);p.cortical+=(upper+lower)*.55;}
  const sym=softEllipse(x,y,0,sy(86.1,patient),.42,2.1,0,.18);p.soft+=sym*1.4;p.bone*=1-sym*.85;
  const hipAngle=((pose.hipInternal||0)*Math.PI)/180;
  for(const side of[-1,1]){
    const hx=side*6.3*hipW,hy=sy(79.8,patient),head=softEllipse(x,y,hx,hy,3.0*hipW,3.0*k,0,.1);addBone(p,head*3.7);p.cortical+=rimEllipse(x,y,hx,hy,2.95*hipW,2.95*k,.65)*1.8;
    const neckLen=4.8*hipW,dx=side*Math.cos(hipAngle)*neckLen,dy=Math.sin(hipAngle)*neckLen,neck=softCapsule(x,y,hx,hy,hx+dx,hy+dy,1.45,.12);addBone(p,neck*3.2);p.cortical+=neck*.7;
    const trocX=hx+side*3.0*hipW,trocY=sy(84.5,patient),gt=softEllipse(x,y,trocX,trocY,2.4*hipW,2.7*k,0,.12);addBone(p,gt*3.1);p.cortical+=rimEllipse(x,y,trocX,trocY,2.35*hipW,2.65*k,.62)*1.3;
    const shaft=softCapsule(x,y,hx+side*4.0*hipW,sy(84,patient),hx+side*4.3*hipW,sy(101,patient),2.15,.12);addBone(p,shaft*3.0);p.cortical+=shaft*.7;
    addBone(p,softEllipse(x,y,hx+side*1.7*hipW,sy(87.3,patient),1.25,1.55,0,.13)*2.1);
  }
  p.gas+=softEllipse(x,y,-8,sy(73,patient),2.8,1.8,.15,.2)*1.8;p.gas+=softEllipse(x,y,8.5,sy(77,patient),2.5,1.7,-.2,.2)*1.5;
  return p;
}
function hip(x:number,y:number,c:SampleCtx):Paths{
  const p=E(),{patient,pose,seed}=c,k=s(patient),side=c.projection.laterality==="right"?-1:1;
  const cx=side*8.0*patient.morph.hip,cy=sy(82,patient),env=softEllipse(x,y,cx,cy,10.5*patient.morph.hip,13*k,0,.08);
  if(env<.015){p.air=42;return p}
  p.soft=4.2*env;p.fat=(patient.habitus==="hypersthenic"?3.5:1.8)*env;p.soft+=(fbm(x*.7,y*.7,seed+27)-.5)*.3*env;
  const a=((pose.hipInternal||0)*Math.PI)/180,head=softEllipse(x,y,cx,cy,3.15*patient.morph.hip,3.15*k,0,.1);addBone(p,head*3.8);p.cortical+=rimEllipse(x,y,cx,cy,3.08*patient.morph.hip,3.08*k,.66)*1.9;
  const len=5.1*patient.morph.hip,dx=side*Math.cos(a)*len,dy=Math.sin(a)*len,neck=softCapsule(x,y,cx,cy,cx+dx,cy+dy,1.5,.12);addBone(p,neck*3.4);p.cortical+=neck*.75;
  const acet=softEllipse(x,y,cx-side*1.7*patient.morph.hip,cy,4.8*patient.morph.hip,4.6*k,0,.11);addBone(p,acet*2.6);p.cortical+=rimEllipse(x,y,cx-side*1.7*patient.morph.hip,cy,4.7*patient.morph.hip,4.5*k,.65)*1.7;
  const joint=softEllipse(x,y,cx-side*1.0,cy,2.75*patient.morph.hip,2.55*k,0,.12);p.bone*=1-joint*.78;p.soft+=joint*.2;
  const gt=softEllipse(x,y,cx+side*3.1*patient.morph.hip,sy(86,patient),2.55*patient.morph.hip,2.8*k,0,.12);addBone(p,gt*3.1);p.cortical+=rimEllipse(x,y,cx+side*3.1*patient.morph.hip,sy(86,patient),2.48*patient.morph.hip,2.72*k,.62)*1.35;
  addBone(p,softEllipse(x,y,cx+side*1.5*patient.morph.hip,sy(88.5,patient),1.3,1.55,0,.13)*2.2);
  const shaft=softCapsule(x,y,cx+side*4.0*patient.morph.hip,sy(86,patient),cx+side*4.4*patient.morph.hip,sy(104,patient),2.25,.12);addBone(p,shaft*3.2);p.cortical+=shaft*.75;
  p.gas+=softEllipse(x,y,cx-side*4.5,sy(77,patient),2.2,1.5,.2,.2)*1.5;return p;
}
export function sampleAnatomy(x:number,y:number,c:SampleCtx):Paths{if(c.projection.id==="ap-pelvis")return pelvis(x,y,c);if(c.projection.id==="ap-hip")return hip(x,y,c);switch(c.projection.anatomy){case"torso-ap":return torso(x,y,c);case"torso-lat":return torso(x,y,c,true);case"cspine-lat":return cspine(x,y,c);case"skull-lat":return skull(x,y,c);case"hand-pa":return hand(x,y,c);case"wrist-pa":return wrist(x,y,c);case"elbow-ap":return elbow(x,y,c);case"shoulder-ap":return shoulder(x,y,c);case"knee-ap":return knee(x,y,c);case"knee-lat":return knee(x,y,c,true);case"foot-dp":return foot(x,y,c);case"ankle-ap":return ankle(x,y,c);default:return torso(x,y,c)}}
