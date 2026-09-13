import type { Patient, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule, softEllipse } from "./geometry";
const P=():Paths=>({air:0,lung:0,fat:0,soft:0,bone:0,cortical:0,gas:0,metal:0});
const c=(v:number)=>Math.max(0,Math.min(1,v)); const sm=(v:number)=>{const t=c(v);return t*t*(3-2*t);};
const g=(x:number,y:number,cx:number,cy:number,rx:number,ry:number,k=1.55)=>Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2)*k);
function lung(x:number,y:number,side:-1|1,s:number,base:number){const yy=y/s,t=c((yy-18.7)/(base/s-18.7)),ap=sm((yy-18.7)/1.0),inf=1-sm((yy-base/s+.05)/.38);const centre=side*(2.15+1.75*t)*s;const width=(.65+8.55*Math.pow(Math.sin(Math.PI*Math.min(.999,t)),.40)-.45*t)*s;const q=Math.abs(x-centre)/Math.max(.25,width);return q<1.02?ap*inf*Math.exp(-Math.pow(q/.94,8))*sm((1.02-q)/.035):0;}
function seg(p:Paths,x:number,y:number,s:number,side:-1|1,a:[number,number],b:[number,number],r:number,w:number){p.soft+=softCapsule(x,y,side*a[0]*s,a[1]*s,side*b[0]*s,b[1]*s,r*s,.24)*w;}
function tree(p:Paths,x:number,y:number,s:number,side:-1|1){const h:[number,number]=[2.55,34.0];const paths:Array<[Array<[number,number]>,number,number]>=[[[h,[3.7,32.6],[5.0,31.1],[6.5,29.9],[8.0,29.1],[9.4,28.7]],.19,.34],[[h,[3.8,34.6],[5.2,35.1],[6.8,36.0],[8.3,37.2],[9.5,38.4]],.21,.38],[[h,[3.6,35.2],[4.7,37.0],[5.7,39.2],[6.7,41.5],[7.7,43.6],[8.5,45.2]],.22,.40],[[4.7,37.0],[4.8,39.6],[4.8,42.0],[4.7,44.4]],.11,.18],[[5.7,39.2],[6.8,39.9],[8.0,40.2],[9.2,40.0]],.10,.17],[[6.7,41.5],[7.8,42.3],[8.8,43.0]],.08,.13],[[5.2,35.1],[6.2,34.0],[7.4,33.4],[8.6,33.2]],.10,.16],[[5.0,31.1],[6.0,29.8],[7.2,28.9]],.09,.14]];for(const [pts,r,w] of paths){for(let i=0;i<pts.length-1;i++){const t=i/(pts.length-1);seg(p,x,y,s,side,pts[i]!,pts[i+1]!,r*(1-.65*t),w*(1-.55*t));}}}
function fallback(p:Paths,x:number,y:number,s:number){for(let i=0;i<10;i++){const yy=(23.0+i*2.35)*s;for(const side of[-1,1]as const){p.bone+=softCapsule(x,y,side*1.4*s,yy,side*6.0*s,yy+.45*s,.09*s,.28)*.014;p.bone+=softCapsule(x,y,side*6*s,yy+.45*s,side*11.6*s,yy+1.05*s,.09*s,.28)*.012;}}}
export function samplePaChest(x:number,y:number,patient:Patient,pose:SimPose,seed:number):Paths{
 const p=P(),s=patient.heightCm/170,w=patient.morph.torsoWidth,d=patient.thickness.chest,insp=pose.breath==="inspiration"?1:0;
 // Chest wall deliberately subordinate to internal anatomy; no dominant oval mask.
 const upper=softEllipse(x,y,0,27.2*s,13.9*w*s,7.7*s,0,.018),mid=softEllipse(x,y,0,36.2*s,14.7*w*s,10.5*s,0,.018),low=softEllipse(x,y,0,43.5*s,13.4*w*s,5.4*s,0,.018);const wall=Math.max(upper*.56,mid*.62,low*.30,g(x,y,-11.3*w*s,22.8*s,3.8*s,1.8*s)*.10,g(x,y,11.3*w*s,22.8*s,3.8*s,1.8*s)*.10);if(wall<.001){p.air=40;return p;}p.soft=wall*.72;p.fat=wall*(patient.habitus==="hypersthenic"?.18:.08);
 const base=(48.0-insp*3.0)*s,rD=base-1.05*s,lD=base+.35*s;let r=lung(x,y,-1,s,rD),l=lung(x,y,1,s,lD);
 // Anatomical cardiomediastinal silhouette built from overlapping low-gradient chambers.
 const svc=g(x,y,-.35*s,31.3*s,.72*s,3.4*s),ra=g(x,y,-1.15*s,39.3*s,1.65*s,4.25*s),rv=g(x,y,.55*s,40.0*s,2.0*s,3.9*s),lv=g(x,y,3.65*s,41.2*s,3.0*s,5.15*s),la=g(x,y,1.65*s,35.7*s,1.45*s,1.8*s),pa=g(x,y,1.15*s,33.3*s,.85*s,1.25*s),ao=g(x,y,1.55*s,28.8*s,.65*s,.78*s);const heart=c(Math.max(ra*.58,rv*.48,lv,la*.38,pa*.27));l*=Math.max(.02,1-heart*.992);r*=Math.max(.86,1-heart*.018);const lm=Math.max(r,l);p.soft*=Math.max(.012,1-lm*.988);p.fat*=Math.max(.04,1-lm*.96);p.lung+=(r+l)*(1.30+d*.024);p.soft+=svc*.25+ra*.65+rv*.50+lv*1.36+la*.48+pa*.36+ao*.31;
 // Trachea/carina/main bronchi.
 p.air+=softCapsule(x,y,0,18.6*s,0,29.0*s,.25*s,.20)*3.6;p.air+=softCapsule(x,y,0,28.8*s,-2.2*s,32.0*s,.13*s,.22)*1.45;p.air+=softCapsule(x,y,0,28.8*s,2.0*s,31.8*s,.13*s,.22)*1.45;
 // Asymmetric hila and multi-generation vascular trees.
 p.soft+=g(x,y,-2.55*s,34.5*s,.72*s,1.18*s)*.48+g(x,y,2.55*s,33.9*s,.75*s,1.10*s)*.52;tree(p,x,y,s,-1);tree(p,x,y,s,1);
 // Hemidiaphragms: high medial dome, rapid lateral descent, acute CP angles.
 const rCurve=rD+.014*((x+4.0*s)*(x+4.0*s))/s,lCurve=lD+.017*((x-3.8*s)*(x-3.8*s))/s;const rg=sm((x/s+12.7)/.22)*(1-sm((x/s+.15)/.58)),lg=sm((x/s-.15)/.58)*(1-sm((x/s-12.7)/.22));const rn=(y-rCurve)/(.115*s),ln=(y-lCurve)/(.125*s);p.soft+=Math.exp(-(rn*rn))*1.10*rg+p.soft*0;p.soft+=Math.exp(-(ln*ln))*.96*lg;
 // Liver/gastric bubble give clear subdiaphragmatic contrast without another torso ellipse.
 p.soft+=g(x,y,-5.2*s,rD+2.0*s,5.4*s,1.55*s)*.34;p.gas+=g(x,y,5.1*s,lD+1.8*s,2.1*s,.72*s)*2.8;
 // Parenchymal interstitial texture: low amplitude, spatially irregular and confined to aerated lung.
 const coarse=fbm(x*.24,y*.24,seed+19)-.5,fine=fbm(x*1.15,y*1.15,seed+29)-.5,vertical=fbm(x*.62,y*1.85,seed+41)-.5;p.soft+=lm*Math.max(0,coarse*.055+fine*.024+vertical*.018)*.22;
 fallback(p,x,y,s);return p;
}
