import type { Patient, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule, softEllipse } from "./geometry";
const emptyPaths=():Paths=>({air:0,lung:0,fat:0,soft:0,bone:0,cortical:0,gas:0,metal:0});
const clamp01=(v:number)=>Math.max(0,Math.min(1,v));
const smooth01=(v:number)=>{const t=clamp01(v);return t*t*(3-2*t);};
const gauss=(x:number,y:number,cx:number,cy:number,rx:number,ry:number)=>Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2)*1.65);
function lungField(x:number,y:number,side:-1|1,s:number,bottom:number):number{const yy=y/s,apex=19.7,base=bottom/s,t=clamp01((yy-apex)/Math.max(1,base-apex));const superior=smooth01((yy-apex)/1.35),inferior=1-smooth01((yy-base+.25)/.72);const centre=side*(2.75+2.18*t-.12*t*t)*s;const bulge=Math.pow(Math.sin(Math.PI*Math.min(.995,t)),.46);const width=(1.0+7.75*bulge-.34*t)*s;const q=Math.abs(x-centre)/Math.max(.4,width);return q<1.045?superior*inferior*Math.exp(-Math.pow(q/.88,6.2))*smooth01((1.045-q)/.075):0;}
function addVessel(p:Paths,x:number,y:number,s:number,side:-1|1,points:Array<[number,number]>,radius:number,gain:number):void{for(let i=0;i<points.length-1;i++){const a=points[i]!,b=points[i+1]!,t=i/Math.max(1,points.length-2),r=radius*(1-.64*t),g=gain*(1-.58*t);p.soft+=softCapsule(x,y,side*a[0]*s,a[1]*s,side*b[0]*s,b[1]*s,r*s,.34)*g;}}
function addFallbackSkeleton(p:Paths,x:number,y:number,s:number):void{for(let i=0;i<10;i++){const y0=(23.7+i*2.35)*s,drop=(1.05+i*.055)*s;for(const side of[-1,1]as const){p.bone+=softCapsule(x,y,side*1.5*s,y0,side*6.2*s,y0+.38*drop,.11*s,.34)*.028;p.bone+=softCapsule(x,y,side*6.2*s,y0+.38*drop,side*11.7*s,y0+drop,.11*s,.34)*.024;}}p.bone+=softCapsule(x,y,-11.2*s,23.8*s,-2*s,26.7*s,.20*s,.30)*.11;p.bone+=softCapsule(x,y,11.2*s,23.8*s,2*s,26.7*s,.20*s,.30)*.11;}
export function samplePaChest(x:number,y:number,patient:Patient,pose:SimPose,seed:number):Paths{
 const p=emptyPaths(),s=patient.heightCm/170,w=patient.morph.torsoWidth,depth=patient.thickness.chest,insp=pose.breath==="inspiration"?1:0;
 const upper=softEllipse(x,y,0,28.5*s,14.7*w*s,9.3*s,0,.04),mid=softEllipse(x,y,0,37.8*s,15.15*w*s,11.9*s,0,.04),lower=softEllipse(x,y,0,45.5*s,13.0*w*s,6.7*s,0,.04);const shoulders=Math.min(.29,gauss(x,y,-12.0*w*s,23.2*s,4.5*s,2.3*s)+gauss(x,y,12.0*w*s,23.2*s,4.5*s,2.3*s));const envelope=Math.max(upper,mid*.96,lower*.60,shoulders);if(envelope<.002){p.air=36;return p;}
 const habitus=patient.habitus==="hypersthenic"?1.12:patient.habitus==="asthenic"?.86:1;p.soft=envelope*1.16*habitus;p.fat=envelope*(patient.habitus==="hypersthenic"?.36:patient.habitus==="asthenic"?.14:.19);
 const diaphragmBase=(48.8-insp*2.85)*s,rightDia=diaphragmBase-1.0*s,leftDia=diaphragmBase+.35*s;let rightLung=lungField(x,y,-1,s,rightDia),leftLung=lungField(x,y,1,s,leftDia);
 const lv=gauss(x,y,3.25*s,41.6*s,3.35*s,5.15*s),rv=gauss(x,y,.35*s,40.4*s,2.0*s,4.15*s),la=gauss(x,y,1.8*s,36.5*s,1.75*s,2.05*s),root=gauss(x,y,.2*s,33.4*s,1.05*s,2.2*s);const heart=clamp01(Math.max(lv,rv*.58,la*.32,root*.20));leftLung*=Math.max(.055,1-heart*.97);rightLung*=Math.max(.80,1-heart*.035);
 const lungMask=Math.max(rightLung,leftLung);p.soft*=Math.max(.042,1-lungMask*.962);p.fat*=Math.max(.10,1-lungMask*.90);p.lung+=(rightLung+leftLung)*(1.0+depth*.021);
 const upperMed=gauss(x,y,0,27.1*s,.92*s,3.7*s),midMed=gauss(x,y,.02*s,33.0*s,1.12*s,4.95*s),aorta=gauss(x,y,1.62*s,29.4*s,.64*s,.82*s);p.soft+=heart*1.10+upperMed*.20+midMed*.28+aorta*.16;
 p.air+=softCapsule(x,y,0,19.4*s,0,29.0*s,.28*s,.26)*3.0;p.air+=softCapsule(x,y,0,29.0*s,-2.05*s,32.1*s,.15*s,.28)*1.0;p.air+=softCapsule(x,y,0,29.0*s,1.9*s,31.9*s,.15*s,.28)*1.0;
 for(const side of[-1,1]as const){const hx=2.85,hy=side<0?34.9:34.3;p.soft+=gauss(x,y,side*hx*s,hy*s,.92*s,1.25*s)*.27;p.soft+=gauss(x,y,side*(hx+.3)*s,(hy+1.0)*s,.48*s,.72*s)*.11;addVessel(p,x,y,s,side,[[hx,hy],[4.0,33.5],[5.4,32.2],[6.9,31.2],[8.2,30.7]],.18,.20);addVessel(p,x,y,s,side,[[hx,hy],[4.2,35.2],[5.6,36.3],[7.0,37.8],[8.3,39.3]],.19,.21);addVessel(p,x,y,s,side,[[hx,hy],[4.0,35.9],[5.2,38.1],[6.5,40.5],[7.6,42.7],[8.5,44.5]],.19,.22);addVessel(p,x,y,s,side,[[4.2,35.2],[5.1,34.0],[6.3,33.2]],.105,.11);addVessel(p,x,y,s,side,[[5.6,36.3],[6.6,35.4],[7.7,34.7]],.095,.10);addVessel(p,x,y,s,side,[[5.2,38.1],[5.7,40.0],[6.1,42.0],[6.3,44.0]],.095,.10);addVessel(p,x,y,s,side,[[6.5,40.5],[7.5,41.5],[8.5,42.0]],.085,.085);}
 // Domes peak medially and descend laterally, terminating in sharp costophrenic recesses.
 const rDomeY=rightDia+.030*((x+4.6*s)*(x+4.6*s))/s,lDomeY=leftDia+.034*((x-4.4*s)*(x-4.4*s))/s;const rGate=smooth01((x/s+13.2)/.75)*(1-smooth01((x/s+.25)/1.05)),lGate=smooth01((x/s-.25)/1.05)*(1-smooth01((x/s-13.2)/.75));const rn=(y-rDomeY)/(.24*s),ln=(y-lDomeY)/(.26*s);p.soft+=Math.exp(-(rn*rn))*.58*rGate;p.soft+=Math.exp(-(ln*ln))*.52*lGate;
 // Liver under the right dome and gastric bubble under the left improve basal definition.
 p.soft+=gauss(x,y,-5.4*s,rightDia+2.2*s,6.0*s,2.2*s)*.16;p.gas+=gauss(x,y,5.0*s,leftDia+2.25*s,2.15*s,.95*s)*1.75;
 // Subtle parenchymal texture is strongest around vessels and bases, never a uniform overlay.
 const coarse=(fbm(x*.20,y*.20,seed+19)-.5),fine=(fbm(x*.82,y*.82,seed+29)-.5);p.soft+=lungMask*Math.max(0,coarse*.020+fine*.008)*.055;
 addFallbackSkeleton(p,x,y,s);return p;
}
