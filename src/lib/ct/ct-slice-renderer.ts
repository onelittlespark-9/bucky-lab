import type {CtPhase} from "./ct-protocols";
export type CtWindow="soft"|"lung"|"bone"|"brain";
const WINDOWS:Record<CtWindow,[number,number]>={soft:[50,400],lung:[-600,1500],bone:[450,1800],brain:[40,80]};
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ell=(x:number,y:number,cx:number,cy:number,rx:number,ry:number)=>1-((x-cx)/rx)**2-((y-cy)/ry)**2;
const ring=(x:number,y:number,cx:number,cy:number,rx:number,ry:number,t:number)=>{const q=Math.sqrt(((x-cx)/rx)**2+((y-cy)/ry)**2);return Math.abs(q-1)<t;};
const noise=(x:number,y:number,z:number)=>Math.sin(x*37.1+y*19.7+z*11.3)*.52+Math.sin(x*83.7-y*43.2+z*29.1)*.28+Math.sin(x*151.3+y*97.1)*.20;
function phaseBoost(phase:CtPhase){return phase==="arterial"?150:phase==="portal-venous"?82:phase==="delayed"?48:phase==="split-bolus-bastion"?118:0;}
function vessel(x:number,y:number,cx:number,cy:number,r:number){return ell(x,y,cx,cy,r,r)>0;}
function chestHu(phase:CtPhase,z:number,x:number,y:number){
 const boost=phaseBoost(phase),shape=.97*((x/.88)**2)+((y+.015)/.70)**2+.045*Math.cos(x*8)-.025*Math.cos(y*11);if(shape>1)return-1000;
 let hu=28+7*noise(x,y,z);if(shape>.78)hu=-92+12*noise(x,y,z); // subcutaneous fat
 // pectoral/paraspinal muscle groups
 if(ell(x,y,-.39,-.43,.28,.13)>0||ell(x,y,.39,-.43,.28,.13)>0||ell(x,y,-.17,.43,.14,.13)>0||ell(x,y,.17,.43,.14,.13)>0)hu=48+5*noise(x,y,z);
 const taper=.90+.10*Math.cos((z-.20)*5),left=Math.max(ell(x,y,-.31,-.04,.285*taper,.43),ell(x,y,-.38,.08,.22,.38)),right=Math.max(ell(x,y,.31,-.04,.285*taper,.43),ell(x,y,.38,.08,.22,.38));
 const leftNotch=ell(x,y,-.09,.06,.18,.24)>0,rightNotch=ell(x,y,.09,.04,.15,.22)>0;const inLung=(left>0&&!leftNotch)||(right>0&&!rightNotch);
 if(inLung){hu=-825+42*noise(x,y,z); // pulmonary vascular tree: branching, not solid black cavities
   const side=x<0?-1:1,ax=.105*side,ay=.02;for(let b=0;b<5;b++){const ang=(-1.05+b*.52)+(side<0?.10:-.10),len=.20+.025*b,cx=ax+Math.cos(ang)*len,cy=ay+Math.sin(ang)*len,rad=.020-.002*b;if(vessel(x,y,cx,cy,rad))hu=55+boost*.42;const mx=(ax+cx)*.5,my=(ay+cy)*.5;if(vessel(x,y,mx,my,rad*.72))hu=45+boost*.38;}
   // bronchi and small peripheral markings
   if(vessel(x,y,.15*side,-.01,.025)||vessel(x,y,.20*side,.06,.017))hu=-960;
 }
 // mediastinum, heart and chambers
 if(ell(x,y,.01,.08,.22,.31)>0)hu=42+5*noise(x,y,z);
 const heart=ell(x,y,.055,.16,.27,.25);if(heart>0)hu=48+7*noise(x,y,z)+boost*.16;
 if(vessel(x,y,-.055,.10,.055))hu=42+boost*.58; // descending/ascending vascular structures
 if(vessel(x,y,.075,-.015,.045))hu=46+boost*.90; // aorta
 if(vessel(x,y,-.035,-.015,.038))hu=42+boost*.65; // pulmonary artery/SVC region
 if(phase!=="non-contrast"&&heart>0){if(ell(x,y,-.04,.14,.085,.105)>0)hu=50+boost*.48;if(ell(x,y,.10,.14,.075,.10)>0)hu=50+boost*.34;}
 // oesophagus/tracheobronchial air
 if(vessel(x,y,-.015,-.10,.030))hu=-930;
 // vertebral body with cortical rim, posterior elements and spinal canal
 const vb=ell(x,y,0,.43,.105,.080);if(vb>0)hu=260+90*noise(x,y,z);if(ring(x,y,0,.43,.105,.080,.10))hu=920;if(vessel(x,y,0,.37,.035))hu=15;if(ell(x,y,0,.535,.035,.07)>0)hu=760;
 // sternum
 if(ell(x,y,0,-.54,.045,.025)>0)hu=680;
 // multiple posterior/lateral rib cross-sections rather than two circular dots
 for(const sx of[-1,1])for(let r=0;r<5;r++){const a=-1.02+r*.48,cx=sx*(.48+.12*Math.cos(a)),cy=.02+.40*Math.sin(a);if(ring(x,y,cx,cy,.042,.033,.24))hu=980;else if(ell(x,y,cx,cy,.032,.025)>0)hu=220;}
 return hu;
}
function abdomenHu(phase:CtPhase,z:number,x:number,y:number){const boost=phaseBoost(phase),shape=(x/.82)**2+((y+.01)/.68)**2;if(shape>1)return-1000;let hu=30+7*noise(x,y,z);if(shape>.78)hu=-95+12*noise(x,y,z);if(ell(x,y,-.25,-.02,.38,.28)>0)hu=58+(phase==="portal-venous"?38:boost*.22)+7*noise(x,y,z);if(ell(x,y,.42,-.05,.14,.20)>0)hu=52+boost*.20;for(const sx of[-1,1])if(ell(x,y,.28*sx,.12,.12,.18)>0)hu=35+boost*.30;for(const sx of[-1,1])if(ell(x,y,.29*sx,.34,.075,.075)>0)hu=42+boost*.72;if(vessel(x,y,.04,.06,.045))hu=45+boost*.88;if(vessel(x,y,-.045,.08,.04))hu=45+boost*.50;const gas=Math.max(ell(x,y,-.18,.23,.12,.09),ell(x,y,.15,.22,.13,.10));if(gas>0)hu=-720;const vb=ell(x,y,0,.40,.11,.085);if(vb>0)hu=300+80*noise(x,y,z);if(ring(x,y,0,.40,.11,.085,.10))hu=1000;return hu;}
function headHu(phase:CtPhase,z:number,x:number,y:number){const outer=ell(x,y,0,0,.72,.82);if(outer<=0)return-1000;let hu=-70;const brain=ell(x,y,0,.01,.62,.70);if(brain<=0)return 980;hu=36+3.5*noise(x,y,z);const greyRim=ell(x,y,0,.01,.59,.67);if(greyRim>0&&ell(x,y,0,.01,.53,.60)<0)hu=42+2*noise(x,y,z);const vent=Math.max(ell(x,y,-.085,.015,.065,.13),ell(x,y,.085,.015,.065,.13));if(vent>0)hu=8;if(vessel(x,y,0,.13,.018)&&phase!=="non-contrast")hu=100+phaseBoost(phase);return hu;}
function huAt(protocol:string,phase:CtPhase,z:number,x:number,y:number){if(protocol==="ct-head")return headHu(phase,z,x,y);if(z<.45)return chestHu(phase,z,x,y);return abdomenHu(phase,z,x,y);}
export function renderCtSlice(protocol:string,phase:CtPhase,slice:number,window:CtWindow,size=512){const canvas=document.createElement("canvas");canvas.width=size;canvas.height=size;const g=canvas.getContext("2d");if(!g)throw new Error("CT renderer could not obtain canvas context");const img=g.createImageData(size,size),z=clamp(slice/100),[level,width]=WINDOWS[window];for(let py=0;py<size;py++)for(let px=0;px<size;px++){const x=(px/(size-1)-.5)*2,y=(py/(size-1)-.5)*2,hu=huAt(protocol,phase,z,x,y)+(Math.sin(px*.71+py*.37+slice)*1.8),v=Math.round(clamp((hu-(level-width/2))/width)*255),i=(py*size+px)*4;img.data[i]=v;img.data[i+1]=v;img.data[i+2]=v;img.data[i+3]=255;}g.putImageData(img,0,0);return canvas.toDataURL("image/png");}
