import type { Patient, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule } from "./geometry";

const emptyPaths=():Paths=>({air:0,lung:0,fat:0,soft:0,bone:0,cortical:0,gas:0,metal:0});
const clamp01=(v:number)=>Math.max(0,Math.min(1,v));
const smooth01=(v:number)=>{const t=clamp01(v);return t*t*(3-2*t);};
const gauss=(x:number,y:number,cx:number,cy:number,rx:number,ry:number,k=1.55)=>Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2)*k);

function torsoHalfWidthCm(yCm:number,widthMorph:number):number{
  if(yCm<21.5)return(8.9+(yCm-17.2)*.78)*widthMorph;
  if(yCm<28)return(12.25+(yCm-21.5)*.22)*widthMorph;
  if(yCm<43)return13.7*widthMorph;
  if(yCm<50)return(13.7-(yCm-43)*.10)*widthMorph;
  return(13.0-(yCm-50)*.20)*widthMorph;
}

function torsoField(x:number,y:number,s:number,w:number):number{
  const yy=y/s;
  if(yy<17.2||yy>57.0)return 0;
  const top=smooth01((yy-17.2)/1.4);
  const bottom=1-smooth01((yy-55.2)/1.8);
  const half=Math.max(7.5,torsoHalfWidthCm(yy,w))*s;
  const q=Math.abs(x)/half;
  if(q>=1.06)return 0;
  const core=Math.exp(-Math.pow(q/.985,12));
  const edge=smooth01((1.06-q)/.055);
  return top*bottom*core*edge;
}

function lateralWallField(x:number,y:number,s:number,w:number):number{
  const yy=y/s;
  if(yy<20||yy>51.5)return 0;
  const half=torsoHalfWidthCm(yy,w)*s;
  const d=Math.abs(Math.abs(x)-half);
  const vertical=smooth01((yy-20)/1.4)*(1-smooth01((yy-50.3)/1.3));
  return Math.exp(-Math.pow(d/(.62*s),2))*vertical;
}

function shoulderArmField(x:number,y:number,s:number,w:number):number{
  const yy=y/s;
  if(yy<18||yy>36)return 0;
  const shoulderL=gauss(x,y,-13.1*w*s,22.5*s,4.8*s,2.5*s,1.1);
  const shoulderR=gauss(x,y,13.1*w*s,22.5*s,4.8*s,2.5*s,1.1);
  const armL=gauss(x,y,-15.1*w*s,29.5*s,2.6*s,8.4*s,1.35);
  const armR=gauss(x,y,15.1*w*s,29.5*s,2.6*s,8.4*s,1.35);
  return Math.max(shoulderL,shoulderR,armL*.82,armR*.82);
}

function lungField(x:number,y:number,side:-1|1,s:number,base:number){
  const yy=y/s,t=clamp01((yy-18.5)/(base/s-18.5));
  const apex=smooth01((yy-18.5)/.9),inferior=1-smooth01((yy-base/s+.04)/.34);
  const centre=side*(1.95+1.60*t)*s;
  const width=(.50+8.55*Math.pow(Math.sin(Math.PI*Math.min(.999,t)),.44)-.30*t)*s;
  const q=Math.abs(x-centre)/Math.max(.25,width);
  if(q>=1.018)return 0;
  return apex*inferior*Math.exp(-Math.pow(q/.955,8))*smooth01((1.018-q)/.036);
}

function vesselSegment(p:Paths,x:number,y:number,s:number,side:-1|1,a:[number,number],b:[number,number],r:number,w:number){
  p.soft+=softCapsule(x,y,side*a[0]*s,a[1]*s,side*b[0]*s,b[1]*s,r*s,.58)*w;
}
type VesselPath={points:Array<[number,number]>;radius:number;weight:number};
function addVessels(p:Paths,x:number,y:number,s:number,side:-1|1){
  const h:[number,number]=[2.45,34.1];
  const trees:VesselPath[]=[
    {points:[h,[3.35,32.9],[4.45,31.8],[5.65,30.8],[6.85,30.1],[8.0,29.7]],radius:.145,weight:.053},
    {points:[h,[3.45,34.8],[4.55,35.5],[5.75,36.4],[6.95,37.5],[8.15,38.6]],radius:.150,weight:.057},
    {points:[h,[3.35,35.3],[4.20,37.2],[5.0,39.2],[5.8,41.3],[6.6,43.3],[7.25,44.7]],radius:.158,weight:.060},
    {points:[[4.20,37.2],[4.25,39.1],[4.2,41.0],[4.1,42.8]],radius:.068,weight:.021},
    {points:[[5.0,39.2],[6.0,39.8],[7.05,40.0],[8.0,40.0]],radius:.060,weight:.018},
    {points:[[4.45,31.8],[5.3,30.5],[6.25,29.6]],radius:.058,weight:.017},
    {points:[[5.75,36.4],[6.7,35.7],[7.55,35.25]],radius:.052,weight:.015},
  ];
  for(const tree of trees){
    for(let i=0;i<tree.points.length-1;i++){
      const t=i/Math.max(1,tree.points.length-1);
      vesselSegment(p,x,y,s,side,tree.points[i]!,tree.points[i+1]!,tree.radius*(1-.74*t),tree.weight*(1-.72*t));
    }
  }
}

function addFallbackSkeleton(p:Paths,x:number,y:number,s:number){
  for(let i=0;i<10;i++){
    const yy=(23+i*2.35)*s;
    for(const side of[-1,1]as const){
      p.bone+=softCapsule(x,y,side*1.4*s,yy,side*6*s,yy+.45*s,.09*s,.28)*.008;
      p.bone+=softCapsule(x,y,side*6*s,yy+.45*s,side*11.6*s,yy+1.05*s,.09*s,.28)*.007;
    }
  }
}

export function samplePaChest(x:number,y:number,patient:Patient,pose:SimPose,seed:number):Paths{
  const p=emptyPaths();
  const s=patient.heightCm/170,w=patient.morph.torsoWidth,depth=patient.thickness.chest,insp=pose.breath==="inspiration"?1:0;
  const torso=torsoField(x,y,s,w),shoulders=shoulderArmField(x,y,s,w);
  if(Math.max(torso,shoulders)<.001){p.air=40;return p;}

  const yy=y/s,lateralWall=lateralWallField(x,y,s,w);
  const abdominalBoost=smooth01((yy-46.0)/1.8)*.38;
  p.soft=torso*(.56+abdominalBoost)+shoulders*.24;
  p.fat=torso*(patient.habitus==="hypersthenic"?.17:.065)+shoulders*.035;

  const base=(48.0-insp*3.0)*s,rightDia=base-1.05*s,leftDia=base+.28*s;
  let rightLung=lungField(x,y,-1,s,rightDia),leftLung=lungField(x,y,1,s,leftDia);

  const svc=gauss(x,y,-.28*s,31.0*s,.72*s,3.2*s);
  const rightAtrium=gauss(x,y,-1.05*s,39.0*s,1.55*s,4.15*s);
  const rightVentricle=gauss(x,y,.45*s,39.7*s,1.9*s,3.7*s);
  const leftVentricle=gauss(x,y,3.45*s,40.9*s,2.80*s,4.85*s);
  const leftAtrium=gauss(x,y,1.50*s,35.5*s,1.28*s,1.65*s);
  const pulmonaryArtery=gauss(x,y,1.05*s,33.1*s,.76*s,1.12*s);
  const aorticKnuckle=gauss(x,y,1.45*s,28.6*s,.58*s,.72*s);
  const heart=clamp01(Math.max(rightAtrium*.60,rightVentricle*.44,leftVentricle,leftAtrium*.34,pulmonaryArtery*.23));
  leftLung*=Math.max(.015,1-heart*.994);rightLung*=Math.max(.88,1-heart*.014);
  const lungs=Math.max(rightLung,leftLung);
  p.soft*=Math.max(.014,1-lungs*.986);p.fat*=Math.max(.05,1-lungs*.95);
  p.lung+=(rightLung+leftLung)*(1.42+depth*.025);

  // Lateral soft-tissue margins and axillary folds remain visible after lung aeration.
  p.soft+=lateralWall*.43+shoulders*.08;
  p.fat+=lateralWall*(patient.habitus==="hypersthenic"?.14:.060);

  // Cardiovascular silhouette.
  p.soft+=svc*.22+rightAtrium*.62+rightVentricle*.44+leftVentricle*1.22+leftAtrium*.39+pulmonaryArtery*.27+aorticKnuckle*.23;

  // Sternum: subtle manubrium/body/xiphoid attenuation, visible without becoming a bright vertical bar.
  const manubrium=gauss(x,y,0,27.0*s,.78*s,2.05*s,1.25);
  const sternalBody=gauss(x,y,0,34.7*s,.55*s,5.65*s,1.15);
  const xiphoid=gauss(x,y,.05*s,40.4*s,.36*s,1.20*s,1.35);
  p.soft+=manubrium*.15+sternalBody*.115+xiphoid*.075;

  // Trachea, carina and main bronchi.
  p.air+=softCapsule(x,y,0,18.5*s,0,28.7*s,.24*s,.24)*3.5;
  p.air+=softCapsule(x,y,0,28.6*s,-2.1*s,31.7*s,.12*s,.28)*1.30;
  p.air+=softCapsule(x,y,0,28.6*s,1.9*s,31.5*s,.12*s,.28)*1.30;

  // Hila and branching pulmonary vascular markings.
  p.soft+=gauss(x,y,-2.4*s,34.4*s,1.08*s,1.55*s)*.17;
  p.soft+=gauss(x,y,2.45*s,33.8*s,1.08*s,1.48*s)*.19;
  addVessels(p,x,y,s,-1);addVessels(p,x,y,s,1);

  // Hemidiaphragm interfaces are generated mainly by the lung/subdiaphragmatic transition.
  const rightCurve=rightDia+.010*((x+4.0*s)**2)/s,leftCurve=leftDia+.013*((x-3.8*s)**2)/s;
  const rightGate=smooth01((x/s+12.4)/.85)*(1-smooth01((x/s+.10)/1.25));
  const leftGate=smooth01((x/s-.10)/1.25)*(1-smooth01((x/s-12.4)/.85));
  const rn=(y-rightCurve)/(.60*s),ln=(y-leftCurve)/(.62*s);
  p.soft+=Math.exp(-(rn*rn))*.072*rightGate+Math.exp(-(ln*ln))*.062*leftGate;

  // Subdiaphragmatic anatomy produces the visible domes, CP angles and gastric bubble.
  p.soft+=gauss(x,y,-5.0*s,rightDia+2.25*s,5.9*s,2.0*s)*.42;
  p.soft+=gauss(x,y,1.5*s,leftDia+2.65*s,3.7*s,1.9*s)*.11;
  p.gas+=gauss(x,y,5.0*s,leftDia+1.95*s,2.15*s,.82*s)*2.45;

  // Fine pulmonary markings: low-contrast, spatially irregular, strongest centrally and basally.
  const coarse=fbm(x*.22,y*.22,seed+19)-.5;
  const fine=fbm(x*1.05,y*1.05,seed+29)-.5;
  const vertical=fbm(x*.58,y*1.75,seed+41)-.5;
  const central=Math.exp(-Math.abs(x)/(8.0*s));
  const basal=smooth01((yy-31)/13);
  p.soft+=lungs*Math.max(0,coarse*.082+fine*.044+vertical*.028)*(.22+.26*central+.10*basal);

  addFallbackSkeleton(p,x,y,s);
  return p;
}
