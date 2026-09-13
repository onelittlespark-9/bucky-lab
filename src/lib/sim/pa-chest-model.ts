import type { Patient, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule } from "./geometry";

const emptyPaths=():Paths=>({air:0,lung:0,fat:0,soft:0,bone:0,cortical:0,gas:0,metal:0});
const clamp01=(v:number)=>Math.max(0,Math.min(1,v));
const smooth01=(v:number)=>{const t=clamp01(v);return t*t*(3-2*t);};
const gauss=(x:number,y:number,cx:number,cy:number,rx:number,ry:number,k=1.55)=>Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2)*k);

function torsoHalfWidthCm(y:number,w:number){
  if(y<20)return(8.6+(y-16.8)*.78)*w;
  if(y<25)return(11.1+(y-20)*.48)*w;
  if(y<42)return 13.5*w;
  if(y<49)return(13.5-(y-42)*.12)*w;
  return(12.66-(y-49)*.18)*w;
}
function torsoField(x:number,y:number,s:number,w:number){
  const yy=y/s;if(yy<16.8||yy>57)return 0;
  const half=Math.max(7.2,torsoHalfWidthCm(yy,w))*s,q=Math.abs(x)/half;
  if(q>=1.035)return 0;
  const vertical=smooth01((yy-16.8)/1.25)*(1-smooth01((yy-55.4)/1.6));
  return vertical*Math.exp(-Math.pow(q/.982,14))*smooth01((1.035-q)/.035);
}
function lateralWall(x:number,y:number,s:number,w:number){
  const yy=y/s;if(yy<20||yy>51)return 0;
  const half=torsoHalfWidthCm(yy,w)*s,d=Math.abs(Math.abs(x)-half);
  return Math.exp(-Math.pow(d/(.38*s),2))*smooth01((yy-20)/1.3)*(1-smooth01((yy-49.8)/1.1));
}
function shoulderField(x:number,y:number,s:number,w:number){
  const yy=y/s;if(yy<17||yy>35)return 0;
  const a=Math.max(gauss(x,y,-12.8*w*s,22.0*s,4.5*s,2.1*s,1.2),gauss(x,y,12.8*w*s,22.0*s,4.5*s,2.1*s,1.2));
  const b=Math.max(gauss(x,y,-15.0*w*s,28.8*s,2.2*s,7.5*s,1.4),gauss(x,y,15.0*w*s,28.8*s,2.2*s,7.5*s,1.4));
  return Math.max(a,b*.62);
}
function lungField(x:number,y:number,side:-1|1,s:number,base:number){
  const yy=y/s,t=clamp01((yy-18.1)/(base/s-18.1));
  const apex=smooth01((yy-18.1)/.75),inferior=1-smooth01((yy-base/s+.08)/.30);
  const centre=side*(1.75+1.55*t)*s;
  const width=(.42+8.65*Math.pow(Math.sin(Math.PI*Math.min(.999,t)),.43)-.22*t)*s;
  const q=Math.abs(x-centre)/Math.max(.2,width);if(q>=1.012)return 0;
  return apex*inferior*Math.exp(-Math.pow(q/.968,9))*smooth01((1.012-q)/.026);
}
function vessel(p:Paths,x:number,y:number,s:number,side:-1|1,a:[number,number],b:[number,number],r:number,w:number){p.soft+=softCapsule(x,y,side*a[0]*s,a[1]*s,side*b[0]*s,b[1]*s,r*s,.60)*w;}
function addVessels(p:Paths,x:number,y:number,s:number,side:-1|1){
  const h:[number,number]=[2.45,34.0];
  const trees:Array<{pts:Array<[number,number]>;r:number;w:number}>=[
    {pts:[h,[3.3,32.9],[4.4,31.7],[5.7,30.6],[7.1,29.8]],r:.13,w:.045},
    {pts:[h,[3.5,34.8],[4.7,35.6],[6.0,36.7],[7.5,38.0]],r:.14,w:.050},
    {pts:[h,[3.4,35.2],[4.3,37.1],[5.2,39.3],[6.1,41.5],[7.0,43.7]],r:.15,w:.054},
    {pts:[[4.3,37.1],[4.35,39.4],[4.25,42.0]],r:.060,w:.018},
    {pts:[[5.2,39.3],[6.4,40.0],[7.7,40.2]],r:.054,w:.016},
    {pts:[[4.4,31.7],[5.4,30.2],[6.6,29.1]],r:.052,w:.015}
  ];
  for(const t of trees)for(let i=0;i<t.pts.length-1;i++){const f=i/Math.max(1,t.pts.length-1);vessel(p,x,y,s,side,t.pts[i]!,t.pts[i+1]!,t.r*(1-.75*f),t.w*(1-.74*f));}
}
function addFallbackSkeleton(p:Paths,x:number,y:number,s:number){for(let i=0;i<10;i++){const yy=(23+i*2.35)*s;for(const side of[-1,1]as const){p.bone+=softCapsule(x,y,side*1.4*s,yy,side*6*s,yy+.45*s,.09*s,.28)*.006;p.bone+=softCapsule(x,y,side*6*s,yy+.45*s,side*11.6*s,yy+1.05*s,.09*s,.28)*.005;}}}

export function samplePaChest(x:number,y:number,patient:Patient,pose:SimPose,seed:number):Paths{
  const p=emptyPaths(),s=patient.heightCm/170,w=patient.morph.torsoWidth,depth=patient.thickness.chest,insp=pose.breath==="inspiration"?1:0;
  const torso=torsoField(x,y,s,w),shoulder=shoulderField(x,y,s,w);
  if(Math.max(torso,shoulder)<.001){p.air=40;return p;}
  const yy=y/s,wall=lateralWall(x,y,s,w),abdominal=smooth01((yy-46.2)/1.5);
  p.soft=torso*(.50+.42*abdominal)+shoulder*.15;
  p.fat=torso*(patient.habitus==="hypersthenic"?.15:.055)+wall*.055;

  const base=(48-insp*3.15)*s,rightDia=base-1.0*s,leftDia=base+.30*s;
  let rightLung=lungField(x,y,-1,s,rightDia),leftLung=lungField(x,y,1,s,leftDia);

  const svc=gauss(x,y,-.25*s,30.7*s,.62*s,3.0*s);
  const ra=gauss(x,y,-1.05*s,39.0*s,1.45*s,4.0*s);
  const rv=gauss(x,y,.45*s,39.6*s,1.75*s,3.4*s);
  const lv=gauss(x,y,3.15*s,40.6*s,2.45*s,4.45*s);
  const la=gauss(x,y,1.35*s,35.4*s,1.18*s,1.55*s);
  const pa=gauss(x,y,1.0*s,33.0*s,.68*s,1.0*s);
  const ao=gauss(x,y,1.38*s,28.5*s,.54*s,.68*s);
  const heart=clamp01(Math.max(ra*.58,rv*.43,lv,la*.32,pa*.22));
  leftLung*=Math.max(.012,1-heart*.995);rightLung*=Math.max(.89,1-heart*.012);
  const lungs=Math.max(rightLung,leftLung);
  p.soft*=Math.max(.012,1-lungs*.988);p.fat*=Math.max(.045,1-lungs*.955);
  p.lung+=(rightLung+leftLung)*(1.48+depth*.024);

  // Thin, continuous lateral chest wall rather than a broad rectangular envelope.
  p.soft+=wall*.34+shoulder*.055;
  p.fat+=wall*(patient.habitus==="hypersthenic"?.12:.048);

  // Compact, anatomically asymmetric cardiomediastinal silhouette.
  p.soft+=svc*.20+ra*.58+rv*.42+lv*1.10+la*.34+pa*.24+ao*.22;

  // Sternum is subtle on PA imaging; atlas supplies the bone, this supplies overlying soft-tissue depth.
  p.soft+=gauss(x,y,0,27.0*s,.66*s,1.9*s,1.25)*.10+gauss(x,y,0,34.5*s,.46*s,5.2*s,1.2)*.072;

  // Airway.
  p.air+=softCapsule(x,y,0,18.3*s,0,28.6*s,.23*s,.24)*3.4;
  p.air+=softCapsule(x,y,0,28.5*s,-2.0*s,31.6*s,.11*s,.28)*1.25;
  p.air+=softCapsule(x,y,0,28.5*s,1.85*s,31.4*s,.11*s,.28)*1.25;

  // Hila and vessels remain low contrast and taper into peripheral lung.
  p.soft+=gauss(x,y,-2.35*s,34.3*s,.92*s,1.32*s)*.14+gauss(x,y,2.38*s,33.7*s,.94*s,1.28*s)*.16;
  addVessels(p,x,y,s,-1);addVessels(p,x,y,s,1);

  // Dome geometry with natural costophrenic taper. The transition itself provides most of the visible diaphragm.
  const rCurve=rightDia+.010*((x+4.0*s)**2)/s,lCurve=leftDia+.012*((x-3.7*s)**2)/s;
  const rGate=smooth01((x/s+12.0)/.65)*(1-smooth01((x/s+.05)/1.15));
  const lGate=smooth01((x/s-.05)/1.15)*(1-smooth01((x/s-12.0)/.65));
  const rn=(y-rCurve)/(.72*s),ln=(y-lCurve)/(.74*s);
  p.soft+=Math.exp(-(rn*rn))*.040*rGate+Math.exp(-(ln*ln))*.034*lGate;

  // Subdiaphragmatic attenuation: liver on patient right, stomach and gastric bubble on left.
  p.soft+=gauss(x,y,-5.0*s,rightDia+2.4*s,6.0*s,2.3*s,1.2)*.48;
  p.soft+=gauss(x,y,2.1*s,leftDia+2.7*s,4.0*s,2.1*s,1.2)*.12;
  p.gas+=gauss(x,y,5.1*s,leftDia+2.0*s,2.05*s,.78*s,1.25)*2.55;

  // Fine lung markings; deliberately irregular rather than visible straight line primitives.
  const coarse=fbm(x*.20,y*.20,seed+19)-.5,fine=fbm(x*.92,y*.92,seed+29)-.5,vertical=fbm(x*.47,y*1.52,seed+41)-.5;
  const central=Math.exp(-Math.abs(x)/(7.6*s)),basal=smooth01((yy-30)/14);
  p.soft+=lungs*Math.max(0,coarse*.088+fine*.047+vertical*.030)*(.22+.30*central+.11*basal);

  addFallbackSkeleton(p,x,y,s);return p;
}
