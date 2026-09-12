import type { Patient, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule, softEllipse } from "./geometry";

const emptyPaths = (): Paths => ({ air: 0, lung: 0, fat: 0, soft: 0, bone: 0, cortical: 0, gas: 0, metal: 0 });
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth01 = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
const gauss = (x:number,y:number,cx:number,cy:number,rx:number,ry:number) => Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2)*1.65);

function lungField(x:number,y:number,side:-1|1,s:number,base:number):number {
  const yy = y / s;
  const top = 18.7;
  const bottom = base / s + (side < 0 ? -0.7 : 0.4);
  const t = clamp01((yy - top) / Math.max(1,bottom - top));
  const vertical = smooth01((yy-top)/2.4) * (1-smooth01((yy-bottom+1.2)/2.5));
  const centre = side * (3.15 + 2.35*t) * s;
  const width = (2.2 + 7.5*Math.pow(Math.sin(Math.PI*Math.min(0.98,t)),0.72)) * s;
  const q = Math.abs(x-centre) / Math.max(0.5,width);
  const lateral = q < 1 ? smooth01((1-q)/0.18) : 0;
  return vertical * lateral;
}

function addFallbackSkeleton(p:Paths,x:number,y:number,s:number):void {
  // This layer is only used when the atlas projection is judged empty/invalid.
  // It is deliberately low attenuation and curved so a failed WebGL atlas does
  // not leave the chest completely boneless or revert to bright diagram lines.
  for(let i=0;i<10;i++){
    const y0=(24.0+i*2.35)*s;
    const drop=(1.8+i*0.08)*s;
    for(const side of[-1,1] as const){
      const sx=side;
      p.bone += softCapsule(x,y,sx*1.5*s,y0,sx*7.0*s,y0+0.75*drop,0.15*s,0.34)*0.052;
      p.bone += softCapsule(x,y,sx*7.0*s,y0+0.75*drop,sx*12.8*s,y0+1.55*drop,0.15*s,0.34)*0.048;
      p.bone += softCapsule(x,y,sx*12.8*s,y0+1.55*drop,sx*9.9*s,y0+2.18*drop,0.13*s,0.34)*0.032;
    }
  }
  p.bone += softCapsule(x,y,-11.0*s,24.7*s,-2.2*s,27.2*s,0.28*s,0.30)*0.13;
  p.bone += softCapsule(x,y,11.0*s,24.7*s,2.2*s,27.2*s,0.28*s,0.30)*0.13;
  for(let i=0;i<11;i++){
    const vy=(26.2+i*1.92)*s;
    p.bone += gauss(x,y,0,vy,0.72*s,0.54*s)*0.035;
  }
  p.cortical += gauss(x,y,0,35.5*s,0.46*s,10.0*s)*0.010;
}

/** Continuous normal PA chest attenuation field. Atlas owns the skeleton when valid. */
export function samplePaChest(x: number, y: number, patient: Patient, pose: SimPose, seed: number): Paths {
  const p = emptyPaths();
  const s = patient.heightCm / 170;
  const w = patient.morph.torsoWidth;
  const depth = patient.thickness.chest;
  const insp = pose.breath === "inspiration" ? 1 : 0;

  // Thoracic wall: shoulders are broader, lower thorax slightly narrower.
  const body = softEllipse(x,y,0,38.8*s,15.8*w*s,22.8*s,0,0.05);
  const shoulderL = gauss(x,y,-12.7*w*s,24.4*s,6.0*s,4.0*s);
  const shoulderR = gauss(x,y,12.7*w*s,24.4*s,6.0*s,4.0*s);
  const envelope = Math.max(body,Math.min(0.64,shoulderL+shoulderR));
  if(envelope < 0.002){ p.air = 36; return p; }

  const habitus = patient.habitus === "hypersthenic" ? 1.14 : patient.habitus === "asthenic" ? 0.82 : 1.0;
  p.soft = envelope * 1.72 * habitus;
  p.fat = envelope * (patient.habitus === "hypersthenic" ? 0.58 : patient.habitus === "asthenic" ? 0.24 : 0.36);

  const base = (50.2-insp*2.8)*s;
  const rightDia = base-0.9*s;
  const leftDia = base+0.45*s;

  let rightLung = lungField(x,y,-1,s,base);
  let leftLung = lungField(x,y,1,s,base);

  // Cardiac silhouette from overlapping components rather than one ellipse.
  const lv = gauss(x,y,3.4*s,43.0*s,4.55*s,6.8*s);
  const rv = gauss(x,y,0.45*s,41.6*s,3.25*s,5.8*s);
  const la = gauss(x,y,2.0*s,37.9*s,3.0*s,3.5*s);
  const heart = clamp01(Math.max(lv,rv*0.76,la*0.48));
  leftLung *= Math.max(0.10,1-heart*0.92);
  rightLung *= Math.max(0.64,1-heart*0.13);

  const lungMask = Math.max(rightLung,leftLung);
  p.soft *= Math.max(0.10,1-lungMask*0.91);
  p.fat *= Math.max(0.20,1-lungMask*0.80);
  p.lung += (rightLung+leftLung)*(0.78+depth*0.020);

  const upperMediastinum = gauss(x,y,0.0,27.8*s,1.6*s,5.0*s);
  const midMediastinum = gauss(x,y,0.15*s,34.5*s,1.95*s,7.2*s);
  const aorticArch = gauss(x,y,2.0*s,30.0*s,1.05*s,1.35*s);
  p.soft += heart*0.94 + upperMediastinum*0.18 + midMediastinum*0.27 + aorticArch*0.13;

  // Tracheobronchial air column.
  p.air += softCapsule(x,y,0,20.2*s,0,30.4*s,0.34*s,0.32)*3.1;
  p.air += softCapsule(x,y,0,30.4*s,-2.1*s,33.4*s,0.21*s,0.34)*1.0;
  p.air += softCapsule(x,y,0,30.4*s,2.0*s,33.4*s,0.21*s,0.34)*1.0;

  // Hila with branching, tapering pulmonary vascular markings.
  for(const side of[-1,1] as const){
    const hx=side*3.0*s;
    const hy=(side<0?35.5:34.8)*s;
    p.soft += gauss(x,y,hx,hy,1.25*s,1.65*s)*0.14;
    const branches = [
      [4.7,31.2,0.13,0.095],[5.4,34.0,0.12,0.100],[6.1,37.0,0.12,0.105],
      [7.0,39.8,0.11,0.095],[7.9,42.4,0.10,0.083],[8.5,44.7,0.085,0.070],
      [8.0,46.7,0.07,0.055],[5.4,45.2,0.075,0.060]
    ];
    for(const [tx,ty,r,g] of branches){
      p.soft += softCapsule(x,y,hx,hy,side*tx*s,ty*s,r*s,0.36)*g;
    }
  }

  // Smooth diaphragmatic domes and costophrenic taper.
  const rDomeY=rightDia+0.037*((x+6.0*s)*(x+6.0*s))/s;
  const lDomeY=leftDia+0.041*((x-5.6*s)*(x-5.6*s))/s;
  const rGate=smooth01((x/s+13.5)/3.5)*(1-smooth01((x/s-0.2)/3.0));
  const lGate=smooth01((x/s-0.2)/3.0)*(1-smooth01((x/s-13.5)/3.5));
  const rNorm=(y-rDomeY)/(0.72*s);
  const lNorm=(y-lDomeY)/(0.74*s);
  p.soft += Math.exp(-(rNorm*rNorm))*0.23*rGate;
  p.soft += Math.exp(-(lNorm*lNorm))*0.21*lGate;

  p.gas += gauss(x,y,5.4*s,leftDia+3.0*s,2.8*s,1.5*s)*1.6;

  const coarse=(fbm(x*0.20,y*0.20,seed+19)-0.5)*0.020;
  const fine=(fbm(x*0.72,y*0.72,seed+29)-0.5)*0.010;
  p.soft += lungMask*Math.max(0,coarse+fine)*0.055;

  addFallbackSkeleton(p,x,y,s);
  return p;
}
