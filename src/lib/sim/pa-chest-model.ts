import type { Patient, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule, softEllipse } from "./geometry";

const emptyPaths = (): Paths => ({ air: 0, lung: 0, fat: 0, soft: 0, bone: 0, cortical: 0, gas: 0, metal: 0 });
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth01 = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
const gauss = (x:number,y:number,cx:number,cy:number,rx:number,ry:number) => Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2)*1.65);

function lungField(x:number,y:number,side:-1|1,s:number,bottom:number):number {
  const yy = y / s;
  const apex = 20.2;
  const base = bottom / s;
  const t = clamp01((yy-apex)/Math.max(1,base-apex));
  const vertical = smooth01((yy-apex)/1.8) * (1-smooth01((yy-base+0.7)/2.0));
  const centre = side * (3.15 + 2.75*t - 0.42*t*t) * s;
  const midBulge = Math.pow(Math.sin(Math.PI*Math.min(0.995,t)),0.66);
  const width = (1.65 + 7.7*midBulge - 0.85*t) * s;
  const q = Math.abs(x-centre) / Math.max(0.45,width);
  const edge = q < 1 ? smooth01((1-q)/0.10) : 0;
  return vertical*edge;
}

function addFallbackSkeleton(p:Paths,x:number,y:number,s:number):void {
  for(let i=0;i<10;i++){
    const y0=(24.2+i*2.35)*s;
    const drop=(1.25+i*0.055)*s;
    for(const side of[-1,1] as const){
      const sx=side;
      p.bone += softCapsule(x,y,sx*1.4*s,y0,sx*6.4*s,y0+0.42*drop,0.13*s,0.34)*0.034;
      p.bone += softCapsule(x,y,sx*6.4*s,y0+0.42*drop,sx*12.0*s,y0+1.02*drop,0.13*s,0.34)*0.030;
    }
  }
  p.bone += softCapsule(x,y,-11.3*s,24.2*s,-2.0*s,27.0*s,0.22*s,0.30)*0.15;
  p.bone += softCapsule(x,y,11.3*s,24.2*s,2.0*s,27.0*s,0.22*s,0.30)*0.15;
  for(let i=0;i<11;i++){
    const vy=(26.6+i*1.90)*s;
    p.bone += gauss(x,y,0,vy,0.62*s,0.43*s)*0.030;
  }
}

/** Continuous normal PA chest attenuation field. Atlas owns the skeleton when valid. */
export function samplePaChest(x:number,y:number,patient:Patient,pose:SimPose,seed:number):Paths {
  const p=emptyPaths();
  const s=patient.heightCm/170;
  const w=patient.morph.torsoWidth;
  const depth=patient.thickness.chest;
  const insp=pose.breath==="inspiration"?1:0;

  // A chest wall built from overlapping sections avoids the previous egg-shaped torso.
  const upper=softEllipse(x,y,0,30.0*s,16.0*w*s,11.0*s,0,0.05);
  const mid=softEllipse(x,y,0,39.0*s,16.2*w*s,13.8*s,0,0.05);
  const lower=softEllipse(x,y,0,48.0*s,14.9*w*s,10.6*s,0,0.05);
  const shoulderL=gauss(x,y,-13.0*w*s,24.2*s,5.7*s,3.4*s);
  const shoulderR=gauss(x,y,13.0*w*s,24.2*s,5.7*s,3.4*s);
  const envelope=Math.max(upper,mid*0.98,lower*0.90,Math.min(0.58,shoulderL+shoulderR));
  if(envelope<0.002){p.air=36;return p;}

  const habitus=patient.habitus==="hypersthenic"?1.14:patient.habitus==="asthenic"?0.84:1;
  p.soft=envelope*1.60*habitus;
  p.fat=envelope*(patient.habitus==="hypersthenic"?0.52:patient.habitus==="asthenic"?0.22:0.32);

  const diaphragmBase=(50.0-insp*2.75)*s;
  const rightDia=diaphragmBase-0.95*s;
  const leftDia=diaphragmBase+0.35*s;

  let rightLung=lungField(x,y,-1,s,rightDia);
  let leftLung=lungField(x,y,1,s,leftDia);

  // Cardiac contour: right border subtle, left ventricle dominant, narrow waist superiorly.
  const lv=gauss(x,y,3.65*s,43.1*s,4.15*s,6.45*s);
  const rv=gauss(x,y,0.65*s,41.7*s,2.85*s,5.4*s);
  const la=gauss(x,y,2.35*s,37.5*s,2.45*s,2.9*s);
  const root=gauss(x,y,0.55*s,34.6*s,1.65*s,3.0*s);
  const heart=clamp01(Math.max(lv,rv*0.72,la*0.44,root*0.34));
  leftLung*=Math.max(0.10,1-heart*0.93);
  rightLung*=Math.max(0.68,1-heart*0.10);

  const lungMask=Math.max(rightLung,leftLung);
  p.soft*=Math.max(0.085,1-lungMask*0.925);
  p.fat*=Math.max(0.18,1-lungMask*0.82);
  p.lung+=(rightLung+leftLung)*(0.80+depth*0.020);

  const upperMediastinum=gauss(x,y,0,28.0*s,1.45*s,4.7*s);
  const midMediastinum=gauss(x,y,0.10*s,34.2*s,1.70*s,6.6*s);
  const aorticArch=gauss(x,y,2.05*s,30.4*s,0.95*s,1.20*s);
  p.soft+=heart*0.91+upperMediastinum*0.16+midMediastinum*0.24+aorticArch*0.12;

  // Trachea and main bronchi.
  p.air+=softCapsule(x,y,0,20.0*s,0,30.0*s,0.34*s,0.30)*3.0;
  p.air+=softCapsule(x,y,0,30.0*s,-2.2*s,33.2*s,0.20*s,0.32)*0.95;
  p.air+=softCapsule(x,y,0,30.0*s,2.0*s,33.0*s,0.20*s,0.32)*0.95;

  // Hila and tapering vessel tree, with a few secondary branches for realistic texture.
  for(const side of[-1,1] as const){
    const hx=side*3.0*s;
    const hy=(side<0?35.6:34.9)*s;
    p.soft+=gauss(x,y,hx,hy,1.10*s,1.45*s)*0.14;
    const branches=[
      [4.6,31.5,0.13,0.090],[5.0,33.2,0.12,0.095],[5.6,35.2,0.11,0.100],
      [6.3,37.6,0.10,0.095],[7.0,39.7,0.09,0.085],[7.8,42.0,0.08,0.074],
      [8.3,44.1,0.07,0.062],[7.9,46.0,0.06,0.050],[5.4,44.8,0.065,0.055]
    ];
    for(const [tx,ty,r,g] of branches){
      const ex=side*tx*s,ey=ty*s;
      p.soft+=softCapsule(x,y,hx,hy,ex,ey,r*s,0.36)*g;
      const mx=(hx+ex)*0.52,my=(hy+ey)*0.52;
      const twigX=ex+side*(0.7+0.12*tx)*s;
      const twigY=ey+((ty>hy/s)?0.7:-0.6)*s;
      p.soft+=softCapsule(x,y,mx,my,twigX,twigY,r*s*0.55,0.34)*g*0.34;
    }
  }

  // Diaphragms and sharp costophrenic taper.
  const rDomeY=rightDia+0.034*((x+5.7*s)*(x+5.7*s))/s;
  const lDomeY=leftDia+0.038*((x-5.4*s)*(x-5.4*s))/s;
  const rGate=smooth01((x/s+13.2)/3.0)*(1-smooth01((x/s-0.1)/2.8));
  const lGate=smooth01((x/s-0.1)/2.8)*(1-smooth01((x/s-13.2)/3.0));
  const rNorm=(y-rDomeY)/(0.62*s);
  const lNorm=(y-lDomeY)/(0.64*s);
  p.soft+=Math.exp(-(rNorm*rNorm))*0.19*rGate;
  p.soft+=Math.exp(-(lNorm*lNorm))*0.18*lGate;

  p.gas+=gauss(x,y,5.2*s,leftDia+2.8*s,2.65*s,1.35*s)*1.45;

  // Very low amplitude parenchymal variation so lung fields do not look flat.
  const coarse=(fbm(x*0.18,y*0.18,seed+19)-0.5)*0.024;
  const fine=(fbm(x*0.72,y*0.72,seed+29)-0.5)*0.010;
  p.soft+=lungMask*Math.max(0,coarse+fine)*0.050;

  addFallbackSkeleton(p,x,y,s);
  return p;
}
