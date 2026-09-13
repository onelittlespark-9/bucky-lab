import type { Patient, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule } from "./geometry";

const emptyPaths=():Paths=>({air:0,lung:0,fat:0,soft:0,bone:0,cortical:0,gas:0,metal:0});
const clamp01=(v:number)=>Math.max(0,Math.min(1,v));
const smooth01=(v:number)=>{const t=clamp01(v);return t*t*(3-2*t);};
const gauss=(x:number,y:number,cx:number,cy:number,rx:number,ry:number,k=1.55)=>Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2)*k);

function torsoHalfWidthCm(y:number,w:number){
  if(y<19.0)return(7.7+(y-16.4)*1.02)*w;
  if(y<24.0)return(10.35+(y-19.0)*.57)*w;
  if(y<34.0)return(13.20+(y-24.0)*.055)*w;
  if(y<44.0)return(13.75-(y-34.0)*.055)*w;
  if(y<51.0)return(13.20-(y-44.0)*.18)*w;
  return(11.94-(y-51.0)*.28)*w;
}
function torsoField(x:number,y:number,s:number,w:number){
  const yy=y/s;if(yy<16.4||yy>56.0)return 0;
  const half=Math.max(7.0,torsoHalfWidthCm(yy,w))*s,q=Math.abs(x)/half;
  if(q>=1.025)return 0;
  const top=smooth01((yy-16.4)/1.15),bottom=1-smooth01((yy-54.2)/1.55);
  const lateral=Math.exp(-Math.pow(q/.982,18))*smooth01((1.025-q)/.030);
  return top*bottom*lateral;
}
function lateralWall(x:number,y:number,s:number,w:number){
  const yy=y/s;if(yy<20.0||yy>50.8)return 0;
  const half=torsoHalfWidthCm(yy,w)*s,d=Math.abs(Math.abs(x)-half);
  const vertical=smooth01((yy-20)/1.2)*(1-smooth01((yy-49.5)/1.0));
  return Math.exp(-Math.pow(d/(.27*s),2))*vertical;
}
function shoulderField(x:number,y:number,s:number,w:number){
  const yy=y/s;if(yy<17||yy>34)return 0;
  const shoulders=Math.max(gauss(x,y,-12.7*w*s,21.8*s,4.4*s,1.75*s,1.3),gauss(x,y,12.7*w*s,21.8*s,4.4*s,1.75*s,1.3));
  const arms=Math.max(gauss(x,y,-15.1*w*s,27.8*s,1.85*s,6.4*s,1.55),gauss(x,y,15.1*w*s,27.8*s,1.85*s,6.4*s,1.55));
  return Math.max(shoulders,arms*.46);
}
function lungField(x:number,y:number,side:-1|1,s:number,base:number){
  const yy=y/s,t=clamp01((yy-18.0)/(base/s-18.0));
  const apex=smooth01((yy-18.0)/.62),inferior=1-smooth01((yy-base/s+.05)/.23);
  const centre=side*(1.55+1.25*t)*s;
  const bell=Math.pow(Math.sin(Math.PI*Math.min(.999,t)),.38);
  const width=(.30+8.80*bell-.40*t*t)*s;
  const q=Math.abs(x-centre)/Math.max(.18,width);if(q>=1.006)return 0;
  const sideEdge=smooth01((1.006-q)/.020);
  return apex*inferior*Math.exp(-Math.pow(q/.978,12))*sideEdge;
}
function vessel(p:Paths,x:number,y:number,s:number,side:-1|1,a:[number,number],b:[number,number],r:number,w:number){p.soft+=softCapsule(x,y,side*a[0]*s,a[1]*s,side*b[0]*s,b[1]*s,r*s,.60)*w;}
function addVessels(p:Paths,x:number,y:number,s:number,side:-1|1){
  const h:[number,number]=[2.35,33.8];
  const trees:Array<{pts:Array<[number,number]>;r:number;w:number}>=[
    {pts:[h,[3.25,32.7],[4.35,31.5],[5.55,30.4],[6.85,29.5]],r:.11,w:.038},
    {pts:[h,[3.40,34.6],[4.55,35.4],[5.80,36.4],[7.15,37.7]],r:.12,w:.043},
    {pts:[h,[3.30,35.0],[4.15,36.9],[4.95,39.0],[5.75,41.1],[6.55,43.0]],r:.125,w:.046},
    {pts:[[4.15,36.9],[4.15,39.0],[4.05,41.2]],r:.048,w:.014},
    {pts:[[4.95,39.0],[6.0,39.6],[7.05,39.8]],r:.044,w:.013},
    {pts:[[4.35,31.5],[5.25,30.0],[6.25,28.9]],r:.042,w:.012}
  ];
  for(const t of trees)for(let i=0;i<t.pts.length-1;i++){const f=i/Math.max(1,t.pts.length-1);vessel(p,x,y,s,side,t.pts[i]!,t.pts[i+1]!,t.r*(1-.80*f),t.w*(1-.78*f));}
}
function addFallbackSkeleton(p:Paths,x:number,y:number,s:number){for(let i=0;i<10;i++){const yy=(23+i*2.35)*s;for(const side of[-1,1]as const){p.bone+=softCapsule(x,y,side*1.4*s,yy,side*6*s,yy+.45*s,.09*s,.28)*.004;p.bone+=softCapsule(x,y,side*6*s,yy+.45*s,side*11.6*s,yy+1.05*s,.09*s,.28)*.0035;}}}

export function samplePaChest(x:number,y:number,patient:Patient,pose:SimPose,seed:number):Paths{
  const p=emptyPaths(),s=patient.heightCm/170,w=patient.morph.torsoWidth,depth=patient.thickness.chest,insp=pose.breath==="inspiration"?1:0;
  const torso=torsoField(x,y,s,w),shoulder=shoulderField(x,y,s,w);
  if(Math.max(torso,shoulder)<.001){p.air=40;return p;}
  const yy=y/s,wall=lateralWall(x,y,s,w);
  const abdomen=smooth01((yy-45.2)/1.1);
  p.soft=torso*(.42+.58*abdomen)+shoulder*.105;
  p.fat=torso*(patient.habitus==="hypersthenic"?.13:.043)+wall*.040;

  const base=(48.0-insp*3.0)*s,rightDia=base-.90*s,leftDia=base+.34*s;
  let rightLung=lungField(x,y,-1,s,rightDia),leftLung=lungField(x,y,1,s,leftDia);

  // Cardiomediastinal silhouette: narrow superior mediastinum, asymmetric cardiac border.
  const upperMediastinum=gauss(x,y,-.10*s,28.8*s,.78*s,4.0*s,1.15);
  const svc=gauss(x,y,-.48*s,31.2*s,.58*s,2.5*s,1.35);
  const ra=gauss(x,y,-1.05*s,39.2*s,1.38*s,3.9*s,1.30);
  const rv=gauss(x,y,.25*s,39.5*s,1.55*s,3.1*s,1.35);
  const lv=gauss(x,y,3.20*s,40.5*s,2.38*s,4.30*s,1.30);
  const la=gauss(x,y,1.30*s,35.5*s,1.02*s,1.40*s,1.45);
  const pa=gauss(x,y,1.05*s,33.0*s,.58*s,.88*s,1.50);
  const ao=gauss(x,y,1.45*s,28.7*s,.48*s,.60*s,1.55);
  const heart=clamp01(Math.max(ra*.62,rv*.44,lv,la*.31,pa*.20));
  leftLung*=Math.max(.010,1-heart*.996);rightLung*=Math.max(.91,1-heart*.010);
  const lungs=Math.max(rightLung,leftLung);

  // Lung aeration removes torso attenuation but deliberately preserves a thin pleural/chest-wall rim.
  p.soft*=Math.max(.008,1-lungs*.992);p.fat*=Math.max(.035,1-lungs*.968);
  p.lung+=(rightLung+leftLung)*(1.62+depth*.021);
  p.soft+=wall*.27+shoulder*.040;
  p.fat+=wall*(patient.habitus==="hypersthenic"?.10:.036);

  p.soft+=upperMediastinum*.19+svc*.18+ra*.60+rv*.40+lv*1.08+la*.32+pa*.21+ao*.21;

  // Sternum is a subtle central superimposition in PA; the atlas carries the osseous component.
  p.soft+=gauss(x,y,0,27.0*s,.58*s,1.7*s,1.35)*.070+gauss(x,y,0,34.4*s,.38*s,4.8*s,1.28)*.050;

  // Trachea and main bronchi.
  p.air+=softCapsule(x,y,0,18.2*s,0,28.6*s,.22*s,.24)*3.5;
  p.air+=softCapsule(x,y,0,28.5*s,-1.95*s,31.5*s,.105*s,.28)*1.18;
  p.air+=softCapsule(x,y,0,28.5*s,1.82*s,31.3*s,.105*s,.28)*1.18;

  p.soft+=gauss(x,y,-2.28*s,34.2*s,.82*s,1.16*s,1.5)*.115+gauss(x,y,2.32*s,33.6*s,.84*s,1.12*s,1.5)*.130;
  addVessels(p,x,y,s,-1);addVessels(p,x,y,s,1);

  // True hemidiaphragm transition: broad tissue-density change plus a faint superior interface.
  const rCurve=rightDia+.0085*((x+4.1*s)**2)/s,lCurve=leftDia+.0105*((x-3.8*s)**2)/s;
  const rGate=smooth01((x/s+12.0)/.52)*(1-smooth01((x/s+.15)/1.05));
  const lGate=smooth01((x/s-.15)/1.05)*(1-smooth01((x/s-12.0)/.52));
  const rBelow=smooth01((y-rCurve)/(.72*s)),lBelow=smooth01((y-lCurve)/(.72*s));
  p.soft+=rBelow*rGate*.33+lBelow*lGate*.18;
  const rn=(y-rCurve)/(.46*s),ln=(y-lCurve)/(.48*s);
  p.soft+=Math.exp(-(rn*rn))*.026*rGate+Math.exp(-(ln*ln))*.022*lGate;

  // Costophrenic recesses: retain aerated taper immediately above the lateral domes.
  const rAngle=gauss(x,y,-10.7*s,rightDia+.20*s,1.15*s,.82*s,1.65);
  const lAngle=gauss(x,y,10.7*s,leftDia+.20*s,1.15*s,.82*s,1.65);
  p.lung+=(rAngle+lAngle)*.34;
  p.soft*=Math.max(.70,1-(rAngle+lAngle)*.30);

  // Upper abdomen and gastric bubble establish the lower diaphragm boundaries.
  p.soft+=gauss(x,y,-5.2*s,rightDia+2.55*s,6.2*s,2.55*s,1.05)*.62;
  p.soft+=gauss(x,y,2.2*s,leftDia+2.75*s,4.2*s,2.25*s,1.08)*.17;
  p.gas+=gauss(x,y,5.0*s,leftDia+2.05*s,2.0*s,.76*s,1.25)*2.75;

  // Fine, non-geometric pulmonary markings.
  const coarse=fbm(x*.18,y*.18,seed+19)-.5,fine=fbm(x*.82,y*.82,seed+29)-.5,vertical=fbm(x*.43,y*1.36,seed+41)-.5;
  const central=Math.exp(-Math.abs(x)/(7.1*s)),basal=smooth01((yy-29)/15);
  p.soft+=lungs*Math.max(0,coarse*.095+fine*.052+vertical*.032)*(.25+.34*central+.12*basal);

  addFallbackSkeleton(p,x,y,s);return p;
}
