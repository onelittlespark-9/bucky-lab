import type { Patient, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule, softEllipse } from "./geometry";

const emptyPaths=():Paths=>({air:0,lung:0,fat:0,soft:0,bone:0,cortical:0,gas:0,metal:0});
const clamp01=(v:number)=>Math.max(0,Math.min(1,v));
const smooth01=(v:number)=>{const t=clamp01(v);return t*t*(3-2*t);};
const gauss=(x:number,y:number,cx:number,cy:number,rx:number,ry:number)=>Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2)*1.65);

function lungField(x:number,y:number,side:-1|1,s:number,bottom:number):number{
 const yy=y/s,apex=19.7,base=bottom/s,t=clamp01((yy-apex)/Math.max(1,base-apex));
 const superior=smooth01((yy-apex)/1.45),inferior=1-smooth01((yy-base+0.42)/1.05);
 const centre=side*(2.9+2.35*t-0.18*t*t)*s;
 const bulge=Math.pow(Math.sin(Math.PI*Math.min(.995,t)),.49);
 const width=(1.10+7.95*bulge-.42*t)*s;
 const q=Math.abs(x-centre)/Math.max(.4,width);
 const lateral=q<1.055?Math.exp(-Math.pow(q/.86,5.7))*smooth01((1.055-q)/.095):0;
 return superior*inferior*lateral;
}

function addVessel(p:Paths,x:number,y:number,s:number,side:-1|1,points:Array<[number,number]>,radius:number,gain:number):void{
 for(let i=0;i<points.length-1;i++){
  const a=points[i]!,b=points[i+1]!,t=i/Math.max(1,points.length-2);
  const r=radius*(1-.58*t),g=gain*(1-.52*t);
  p.soft+=softCapsule(x,y,side*a[0]*s,a[1]*s,side*b[0]*s,b[1]*s,r*s,.40)*g;
 }
}

function addFallbackSkeleton(p:Paths,x:number,y:number,s:number):void{
 for(let i=0;i<10;i++){const y0=(23.7+i*2.35)*s,drop=(1.05+i*.055)*s;for(const side of[-1,1]as const){p.bone+=softCapsule(x,y,side*1.5*s,y0,side*6.2*s,y0+.38*drop,.11*s,.34)*.028;p.bone+=softCapsule(x,y,side*6.2*s,y0+.38*drop,side*11.7*s,y0+drop,.11*s,.34)*.024;}}
 p.bone+=softCapsule(x,y,-11.2*s,23.8*s,-2*s,26.7*s,.20*s,.30)*.11;p.bone+=softCapsule(x,y,11.2*s,23.8*s,2*s,26.7*s,.20*s,.30)*.11;
}

export function samplePaChest(x:number,y:number,patient:Patient,pose:SimPose,seed:number):Paths{
 const p=emptyPaths(),s=patient.heightCm/170,w=patient.morph.torsoWidth,depth=patient.thickness.chest,insp=pose.breath==="inspiration"?1:0;
 const upper=softEllipse(x,y,0,28.8*s,15.0*w*s,9.7*s,0,.045),mid=softEllipse(x,y,0,38.1*s,15.5*w*s,12.2*s,0,.045),lower=softEllipse(x,y,0,46.0*s,13.6*w*s,7.4*s,0,.045);
 const shoulderL=gauss(x,y,-12.4*w*s,23.5*s,4.8*s,2.55*s),shoulderR=gauss(x,y,12.4*w*s,23.5*s,4.8*s,2.55*s);
 const envelope=Math.max(upper,mid*.97,lower*.70,Math.min(.36,shoulderL+shoulderR));if(envelope<.002){p.air=36;return p;}
 const habitus=patient.habitus==="hypersthenic"?1.12:patient.habitus==="asthenic"?.86:1;
 p.soft=envelope*1.24*habitus;p.fat=envelope*(patient.habitus==="hypersthenic"?.40:patient.habitus==="asthenic"?.16:.22);
 const diaphragmBase=(49.0-insp*2.85)*s,rightDia=diaphragmBase-.95*s,leftDia=diaphragmBase+.35*s;
 let rightLung=lungField(x,y,-1,s,rightDia),leftLung=lungField(x,y,1,s,leftDia);
 const lv=gauss(x,y,3.35*s,41.9*s,3.55*s,5.45*s),rv=gauss(x,y,.45*s,40.8*s,2.2*s,4.5*s),la=gauss(x,y,1.9*s,36.8*s,1.95*s,2.3*s),root=gauss(x,y,.28*s,33.7*s,1.18*s,2.4*s);
 const heart=clamp01(Math.max(lv,rv*.62,la*.35,root*.23));leftLung*=Math.max(.065,1-heart*.96);rightLung*=Math.max(.76,1-heart*.05);
 const lungMask=Math.max(rightLung,leftLung);p.soft*=Math.max(.055,1-lungMask*.952);p.fat*=Math.max(.12,1-lungMask*.88);p.lung+=(rightLung+leftLung)*(.92+depth*.020);
 const upperMed=gauss(x,y,0,27.3*s,1.05*s,4.0*s),midMed=gauss(x,y,.05*s,33.4*s,1.28*s,5.35*s),aorta=gauss(x,y,1.75*s,29.6*s,.72*s,.92*s);p.soft+=heart*1.02+upperMed*.18+midMed*.25+aorta*.14;
 p.air+=softCapsule(x,y,0,19.5*s,0,29.3*s,.30*s,.28)*2.8;p.air+=softCapsule(x,y,0,29.2*s,-2.1*s,32.4*s,.16*s,.30)*.95;p.air+=softCapsule(x,y,0,29.2*s,1.95*s,32.2*s,.16*s,.30)*.95;

 // Hilar shadows with upper/lower lobe branching rather than radial spokes.
 for(const side of[-1,1]as const){
  const hx=3.0,hy=side<0?35.1:34.5;
  p.soft+=gauss(x,y,side*hx*s,hy*s,1.05*s,1.42*s)*.22;
  p.soft+=gauss(x,y,side*(hx+.35)*s,(hy+1.05)*s,.58*s,.88*s)*.08;
  addVessel(p,x,y,s,side,[[hx,hy],[4.2,33.8],[5.6,32.4],[7.1,31.4],[8.5,30.8]],.16,.16);
  addVessel(p,x,y,s,side,[[hx,hy],[4.4,35.4],[5.9,36.6],[7.3,38.1],[8.6,39.8]],.17,.17);
  addVessel(p,x,y,s,side,[[hx,hy],[4.2,36.1],[5.5,38.4],[6.9,40.8],[8.0,43.2],[8.8,45.0]],.17,.18);
  addVessel(p,x,y,s,side,[[4.4,35.4],[5.2,34.2],[6.4,33.4]],.095,.085);
  addVessel(p,x,y,s,side,[[5.9,36.6],[6.9,35.7],[7.9,35.0]],.085,.075);
  addVessel(p,x,y,s,side,[[5.5,38.4],[6.0,40.1],[6.5,42.2],[6.7,44.4]],.085,.08);
  addVessel(p,x,y,s,side,[[6.9,40.8],[7.9,41.8],[8.8,42.3]],.075,.065);
 }

 // Distinct hemidiaphragms. A stronger central dome fades sharply laterally to create both costo- and cardiophrenic angles.
 const rDomeY=rightDia+.034*((x+5.2*s)*(x+5.2*s))/s,lDomeY=leftDia+.038*((x-4.9*s)*(x-4.9*s))/s;
 const rLat=smooth01((x/s+13.5)/1.35)*(1-smooth01((x/s+.15)/1.45)),lLat=smooth01((x/s-.15)/1.45)*(1-smooth01((x/s-13.5)/1.35));
 const rn=(y-rDomeY)/(.30*s),ln=(y-lDomeY)/(.32*s);
 p.soft+=Math.exp(-(rn*rn))*.42*rLat;p.soft+=Math.exp(-(ln*ln))*.38*lLat;
 const rBelow=smooth01((y-rDomeY)/(.55*s))*(1-smooth01((y-rDomeY-1.8*s)/(.95*s)))*rLat;
 const lBelow=smooth01((y-lDomeY)/(.55*s))*(1-smooth01((y-lDomeY-1.8*s)/(.95*s)))*lLat;
 p.soft+=rBelow*.11+lBelow*.10;
 // Small medial diaphragmatic reinforcement makes the cardiophrenic angles visible without filling the recesses.
 p.soft+=gauss(x,y,-1.5*s,rightDia+.5*s,1.4*s,.65*s)*.08;p.soft+=gauss(x,y,1.7*s,leftDia+.55*s,1.3*s,.62*s)*.07;
 p.gas+=gauss(x,y,5.0*s,leftDia+2.4*s,2.25*s,1.05*s)*1.55;
 const coarse=(fbm(x*.18,y*.18,seed+19)-.5)*.018,fine=(fbm(x*.72,y*.72,seed+29)-.5)*.007;p.soft+=lungMask*Math.max(0,coarse+fine)*.035;
 addFallbackSkeleton(p,x,y,s);return p;
}
