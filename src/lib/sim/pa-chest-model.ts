import type { Patient, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule } from "./geometry";

const emptyPaths=():Paths=>({air:0,lung:0,fat:0,soft:0,bone:0,cortical:0,gas:0,metal:0});
const clamp01=(v:number)=>Math.max(0,Math.min(1,v));
const smooth01=(v:number)=>{const t=clamp01(v);return t*t*(3-2*t);};
const gauss=(x:number,y:number,cx:number,cy:number,rx:number,ry:number,k=1.55)=>Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2)*k);

function torsoHalfWidthCm(yCm:number,widthMorph:number):number{
  if(yCm<25)return(10.8+(yCm-17.5)*.39)*widthMorph;
  if(yCm>45)return(13.7-(yCm-45)*.16)*widthMorph;
  return 13.7*widthMorph;
}

function torsoField(x:number,y:number,s:number,w:number):number{
  const yy=y/s;
  if(yy<17.5||yy>57.5)return 0;
  const top=smooth01((yy-17.5)/2.1);
  const bottom=1-smooth01((yy-55.5)/2.0);
  const half=torsoHalfWidthCm(yy,w);
  const q=Math.abs(x)/(Math.max(.5,half*s));
  const edge=q<1.045?Math.exp(-Math.pow(q/.965,9.5))*smooth01((1.045-q)/.045):0;
  return top*bottom*edge;
}

function lateralWallField(x:number,y:number,s:number,w:number):number{
  const yy=y/s;
  if(yy<20||yy>50.5)return 0;
  const half=torsoHalfWidthCm(yy,w)*s;
  const d=Math.abs(Math.abs(x)-half);
  const vertical=smooth01((yy-20)/2.2)*(1-smooth01((yy-49.5)/1.4));
  const rim=Math.exp(-Math.pow(d/(0.48*s),2));
  return rim*vertical;
}

function lungField(x:number,y:number,side:-1|1,s:number,base:number){
  const yy=y/s,t=clamp01((yy-18.8)/(base/s-18.8));
  const apex=smooth01((yy-18.8)/1.0),inferior=1-smooth01((yy-base/s+.08)/.42);
  const centre=side*(2.05+1.72*t)*s;
  const width=(.72+8.45*Math.pow(Math.sin(Math.PI*Math.min(.999,t)),.42)-.38*t)*s;
  const q=Math.abs(x-centre)/Math.max(.25,width);
  if(q>=1.025)return 0;
  return apex*inferior*Math.exp(-Math.pow(q/.945,7.5))*smooth01((1.025-q)/.045);
}

function vesselSegment(p:Paths,x:number,y:number,s:number,side:-1|1,a:[number,number],b:[number,number],r:number,w:number){
  p.soft+=softCapsule(x,y,side*a[0]*s,a[1]*s,side*b[0]*s,b[1]*s,r*s,.52)*w;
}

type VesselPath={points:Array<[number,number]>;radius:number;weight:number};
function addVessels(p:Paths,x:number,y:number,s:number,side:-1|1){
  const h:[number,number]=[2.55,34.0];
  const trees:VesselPath[]=[
    {points:[h,[3.5,32.8],[4.7,31.6],[6.0,30.6],[7.2,29.9]],radius:.15,weight:.065},
    {points:[h,[3.6,34.7],[4.8,35.5],[6.0,36.6],[7.3,38.0]],radius:.16,weight:.072},
    {points:[h,[3.4,35.2],[4.4,37.1],[5.3,39.3],[6.1,41.6],[6.9,43.8]],radius:.17,weight:.078},
    {points:[[4.4,37.1],[4.5,39.3],[4.45,41.4]],radius:.075,weight:.028},
    {points:[[5.3,39.3],[6.5,40.0],[7.7,40.15]],radius:.068,weight:.025},
    {points:[[4.7,31.6],[5.7,30.2],[6.8,29.25]],radius:.064,weight:.022},
  ];
  for(const tree of trees){
    for(let i=0;i<tree.points.length-1;i++){
      const t=i/Math.max(1,tree.points.length-1);
      vesselSegment(p,x,y,s,side,tree.points[i]!,tree.points[i+1]!,tree.radius*(1-.72*t),tree.weight*(1-.72*t));
    }
  }
}

function addFallbackSkeleton(p:Paths,x:number,y:number,s:number){
  for(let i=0;i<10;i++){
    const yy=(23+i*2.35)*s;
    for(const side of[-1,1]as const){
      p.bone+=softCapsule(x,y,side*1.4*s,yy,side*6*s,yy+.45*s,.09*s,.28)*.010;
      p.bone+=softCapsule(x,y,side*6*s,yy+.45*s,side*11.6*s,yy+1.05*s,.09*s,.28)*.009;
    }
  }
}

export function samplePaChest(x:number,y:number,patient:Patient,pose:SimPose,seed:number):Paths{
  const p=emptyPaths();
  const s=patient.heightCm/170,w=patient.morph.torsoWidth,depth=patient.thickness.chest,insp=pose.breath==="inspiration"?1:0;
  const torso=torsoField(x,y,s,w);
  if(torso<.001){p.air=40;return p;}

  const yy=y/s;
  const lateralWall=lateralWallField(x,y,s,w);
  const shoulderBoost=(gauss(x,y,-11.2*w*s,22.8*s,4.0*s,2.2*s)+gauss(x,y,11.2*w*s,22.8*s,4.0*s,2.2*s))*.055;
  const abdominalBoost=smooth01((yy-46.5)/2.0)*.34;
  p.soft=torso*(.54+abdominalBoost)+shoulderBoost;
  p.fat=torso*(patient.habitus==="hypersthenic"?.16:.06);

  const base=(48-insp*3)*s,rD=base-1.05*s,lD=base+.35*s;
  let rL=lungField(x,y,-1,s,rD),lL=lungField(x,y,1,s,lD);

  const svc=gauss(x,y,-.30*s,31.1*s,.72*s,3.25*s);
  const ra=gauss(x,y,-1.05*s,39.1*s,1.55*s,4.15*s);
  const rv=gauss(x,y,.45*s,39.8*s,1.9*s,3.7*s);
  const lv=gauss(x,y,3.55*s,41.0*s,2.85*s,4.9*s);
  const la=gauss(x,y,1.55*s,35.6*s,1.35*s,1.7*s);
  const pa=gauss(x,y,1.05*s,33.2*s,.78*s,1.15*s);
  const ao=gauss(x,y,1.48*s,28.7*s,.60*s,.74*s);
  const heart=clamp01(Math.max(ra*.58,rv*.46,lv,la*.36,pa*.24));
  lL*=Math.max(.02,1-heart*.992);rL*=Math.max(.87,1-heart*.016);
  const lungs=Math.max(rL,lL);
  p.soft*=Math.max(.015,1-lungs*.985);p.fat*=Math.max(.05,1-lungs*.95);
  p.lung+=(rL+lL)*(1.40+depth*.025);

  // Preserve a thin lateral chest-wall band after lung aeration is applied.
  p.soft+=lateralWall*.34;
  p.fat+=lateralWall*(patient.habitus==="hypersthenic"?.12:.055);

  p.soft+=svc*.22+ra*.60+rv*.46+lv*1.24+la*.40+pa*.28+ao*.24;

  p.air+=softCapsule(x,y,0,18.7*s,0,28.8*s,.24*s,.24)*3.5;
  p.air+=softCapsule(x,y,0,28.7*s,-2.15*s,31.8*s,.12*s,.28)*1.35;
  p.air+=softCapsule(x,y,0,28.7*s,1.95*s,31.6*s,.12*s,.28)*1.35;

  p.soft+=gauss(x,y,-2.45*s,34.4*s,1.05*s,1.50*s)*.18;
  p.soft+=gauss(x,y,2.50*s,33.8*s,1.06*s,1.42*s)*.20;
  addVessels(p,x,y,s,-1);addVessels(p,x,y,s,1);

  const rCurve=rD+.012*((x+4.0*s)**2)/s,lCurve=lD+.015*((x-3.8*s)**2)/s;
  const rGate=smooth01((x/s+12.5)/.85)*(1-smooth01((x/s+.15)/1.25));
  const lGate=smooth01((x/s-.15)/1.25)*(1-smooth01((x/s-12.5)/.85));
  const rn=(y-rCurve)/(.48*s),ln=(y-lCurve)/(.50*s);
  p.soft+=Math.exp(-(rn*rn))*.105*rGate+Math.exp(-(ln*ln))*.09*lGate;

  p.soft+=gauss(x,y,-5.1*s,rD+2.2*s,5.8*s,1.9*s)*.38;
  p.soft+=gauss(x,y,1.7*s,lD+2.6*s,3.6*s,1.8*s)*.10;
  p.gas+=gauss(x,y,5.0*s,lD+1.95*s,2.1*s,.80*s)*2.35;

  const coarse=fbm(x*.22,y*.22,seed+19)-.5;
  const fine=fbm(x*1.05,y*1.05,seed+29)-.5;
  const vertical=fbm(x*.58,y*1.75,seed+41)-.5;
  const central=Math.exp(-Math.abs(x)/(8.5*s));
  p.soft+=lungs*Math.max(0,coarse*.075+fine*.040+vertical*.026)*(.24+.24*central);

  addFallbackSkeleton(p,x,y,s);
  return p;
}
