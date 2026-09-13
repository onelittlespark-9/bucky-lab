import type { Patient, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule, softEllipse } from "./geometry";

const emptyPaths = (): Paths => ({ air: 0, lung: 0, fat: 0, soft: 0, bone: 0, cortical: 0, gas: 0, metal: 0 });
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth01 = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
const gauss = (x:number,y:number,cx:number,cy:number,rx:number,ry:number) => Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2)*1.65);

function lungField(x:number,y:number,side:-1|1,s:number,bottom:number):number {
  const yy = y / s;
  const apex = 20.5;
  const base = bottom / s;
  const t = clamp01((yy-apex)/Math.max(1,base-apex));

  // Smooth cranio-caudal taper. The superior gate creates a narrow apex and the
  // inferior gate fades into the diaphragmatic dome instead of ending abruptly.
  const superior = smooth01((yy-apex)/2.6);
  const inferior = 1-smooth01((yy-base+1.6)/2.9);
  const vertical = superior*inferior;

  // Normal PA lungs widen rapidly below the clavicles, remain broad through the
  // mid zones, then taper slightly towards the costophrenic angles.
  const centre = side*(3.05+2.55*t-0.32*t*t)*s;
  const bulge = Math.pow(Math.sin(Math.PI*Math.min(0.995,t)),0.62);
  const width = (1.55+7.85*bulge-0.72*t)*s;
  const q = Math.abs(x-centre)/Math.max(0.45,width);

  // A soft super-elliptic boundary avoids the artificial hard oval seen in the
  // previous renderer while still containing attenuation within the thorax.
  const lateral = q < 1.18 ? Math.exp(-Math.pow(q/0.78,4.2))*smooth01((1.18-q)/0.22) : 0;
  return vertical*lateral;
}

function addFallbackSkeleton(p:Paths,x:number,y:number,s:number):void {
  // Kept deliberately subtle. The Human Atlas is primary; this only prevents a
  // completely boneless radiograph if WebGL projection fails at runtime.
  for(let i=0;i<10;i++){
    const y0=(24.2+i*2.35)*s;
    const drop=(1.20+i*0.050)*s;
    for(const side of[-1,1] as const){
      const sx=side;
      p.bone += softCapsule(x,y,sx*1.5*s,y0,sx*6.3*s,y0+0.40*drop,0.12*s,0.34)*0.030;
      p.bone += softCapsule(x,y,sx*6.3*s,y0+0.40*drop,sx*11.8*s,y0+1.00*drop,0.12*s,0.34)*0.026;
    }
  }
  p.bone += softCapsule(x,y,-11.2*s,24.2*s,-2.0*s,27.0*s,0.21*s,0.30)*0.12;
  p.bone += softCapsule(x,y,11.2*s,24.2*s,2.0*s,27.0*s,0.21*s,0.30)*0.12;
  for(let i=0;i<11;i++){
    const vy=(26.5+i*1.90)*s;
    p.bone += gauss(x,y,0,vy,0.58*s,0.38*s)*0.018;
  }
}

/** Continuous normal PA chest attenuation field. Atlas owns the skeleton when valid. */
export function samplePaChest(x:number,y:number,patient:Patient,pose:SimPose,seed:number):Paths {
  const p=emptyPaths();
  const s=patient.heightCm/170;
  const w=patient.morph.torsoWidth;
  const depth=patient.thickness.chest;
  const insp=pose.breath==="inspiration"?1:0;

  // Sectional thoracic envelope, closer to a real chest silhouette than a single
  // ellipse and without the broad lower abdominal oval from the previous pass.
  const upper=softEllipse(x,y,0,29.4*s,15.7*w*s,10.4*s,0,0.06);
  const mid=softEllipse(x,y,0,38.6*s,16.0*w*s,12.8*s,0,0.06);
  const lower=softEllipse(x,y,0,47.0*s,14.4*w*s,8.8*s,0,0.06);
  const shoulderL=gauss(x,y,-12.8*w*s,24.0*s,5.4*s,3.1*s);
  const shoulderR=gauss(x,y,12.8*w*s,24.0*s,5.4*s,3.1*s);
  const envelope=Math.max(upper,mid*0.98,lower*0.82,Math.min(0.50,shoulderL+shoulderR));
  if(envelope<0.002){p.air=36;return p;}

  const habitus=patient.habitus==="hypersthenic"?1.12:patient.habitus==="asthenic"?0.86:1;
  p.soft=envelope*1.44*habitus;
  p.fat=envelope*(patient.habitus==="hypersthenic"?0.46:patient.habitus==="asthenic"?0.20:0.28);

  const diaphragmBase=(49.8-insp*2.8)*s;
  const rightDia=diaphragmBase-0.95*s;
  const leftDia=diaphragmBase+0.35*s;

  let rightLung=lungField(x,y,-1,s,rightDia);
  let leftLung=lungField(x,y,1,s,leftDia);

  // Cardiomediastinal contour: narrow superior mediastinum, small right heart
  // border, and dominant left ventricle without the previous central blob.
  const lv=gauss(x,y,3.55*s,42.9*s,3.95*s,6.15*s);
  const rv=gauss(x,y,0.65*s,41.6*s,2.55*s,5.1*s);
  const la=gauss(x,y,2.10*s,37.4*s,2.30*s,2.7*s);
  const root=gauss(x,y,0.45*s,34.4*s,1.45*s,2.8*s);
  const heart=clamp01(Math.max(lv,rv*0.68,la*0.40,root*0.28));
  leftLung*=Math.max(0.08,1-heart*0.94);
  rightLung*=Math.max(0.72,1-heart*0.08);

  const lungMask=Math.max(rightLung,leftLung);
  p.soft*=Math.max(0.075,1-lungMask*0.935);
  p.fat*=Math.max(0.16,1-lungMask*0.84);
  p.lung+=(rightLung+leftLung)*(0.82+depth*0.019);

  const upperMediastinum=gauss(x,y,0,27.8*s,1.30*s,4.4*s);
  const midMediastinum=gauss(x,y,0.10*s,34.0*s,1.55*s,6.1*s);
  const aorticArch=gauss(x,y,1.95*s,30.2*s,0.88*s,1.10*s);
  p.soft+=heart*0.88+upperMediastinum*0.14+midMediastinum*0.21+aorticArch*0.11;

  // Trachea and main bronchi.
  p.air+=softCapsule(x,y,0,20.0*s,0,30.0*s,0.34*s,0.30)*2.8;
  p.air+=softCapsule(x,y,0,30.0*s,-2.2*s,33.2*s,0.19*s,0.32)*0.90;
  p.air+=softCapsule(x,y,0,30.0*s,2.0*s,33.0*s,0.19*s,0.32)*0.90;

  // Hila and pulmonary vascular tree. Branches taper and diverge rather than
  // radiating as straight spokes from one point.
  for(const side of[-1,1] as const){
    const hx=side*2.9*s;
    const hy=(side<0?35.5:34.8)*s;
    p.soft+=gauss(x,y,hx,hy,1.00*s,1.30*s)*0.12;
    const branches=[
      [4.3,31.7,0.12,0.075],[4.9,33.4,0.11,0.082],[5.5,35.4,0.10,0.088],
      [6.2,37.6,0.095,0.082],[6.9,39.7,0.085,0.074],[7.6,41.8,0.075,0.064],
      [8.1,43.9,0.065,0.052],[7.7,45.7,0.055,0.042],[5.3,44.7,0.060,0.048]
    ];
    for(const [tx,ty,r,g] of branches){
      const ex=side*tx*s,ey=ty*s;
      p.soft+=softCapsule(x,y,hx,hy,ex,ey,r*s,0.38)*g;
      const mx=hx+(ex-hx)*0.58;
      const my=hy+(ey-hy)*0.58;
      const twigX=ex+side*(0.55+0.08*tx)*s;
      const twigY=ey+((ty>hy/s)?0.55:-0.48)*s;
      p.soft+=softCapsule(x,y,mx,my,twigX,twigY,r*s*0.50,0.36)*g*0.27;
    }
  }

  // Smooth diaphragmatic domes with a steeper lateral fall-off into the
  // costophrenic angles. Right hemidiaphragm remains slightly higher.
  const rDomeY=rightDia+0.031*((x+5.7*s)*(x+5.7*s))/s;
  const lDomeY=leftDia+0.035*((x-5.4*s)*(x-5.4*s))/s;
  const rGate=smooth01((x/s+13.0)/2.8)*(1-smooth01((x/s-0.2)/2.6));
  const lGate=smooth01((x/s-0.2)/2.6)*(1-smooth01((x/s-13.0)/2.8));
  const rNorm=(y-rDomeY)/(0.56*s);
  const lNorm=(y-lDomeY)/(0.58*s);
  p.soft+=Math.exp(-(rNorm*rNorm))*0.17*rGate;
  p.soft+=Math.exp(-(lNorm*lNorm))*0.16*lGate;

  p.gas+=gauss(x,y,5.1*s,leftDia+2.7*s,2.45*s,1.25*s)*1.35;

  // Fine parenchymal variation only; no artificial reticular pattern.
  const coarse=(fbm(x*0.18,y*0.18,seed+19)-0.5)*0.022;
  const fine=(fbm(x*0.72,y*0.72,seed+29)-0.5)*0.009;
  p.soft+=lungMask*Math.max(0,coarse+fine)*0.045;

  addFallbackSkeleton(p,x,y,s);
  return p;
}
