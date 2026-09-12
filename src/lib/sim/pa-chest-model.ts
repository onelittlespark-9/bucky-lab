import type { Patient, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule, softEllipse } from "./geometry";

const emptyPaths = (): Paths => ({ air: 0, lung: 0, fat: 0, soft: 0, bone: 0, cortical: 0, gas: 0, metal: 0 });
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth01 = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
const gauss = (x:number,y:number,cx:number,cy:number,rx:number,ry:number) => Math.exp(-(((x-cx)/rx)**2+((y-cy)/ry)**2)*1.65);

/**
 * Soft-tissue component for a normal PA chest.
 *
 * Skeletal attenuation is intentionally absent here: ribs, clavicles and spine
 * come from the Human Atlas projection in render-radiograph.ts. This model only
 * supplies the continuous attenuation field of the chest wall, lungs,
 * mediastinum, heart, hila, vessels and diaphragms.
 */
export function samplePaChest(x: number, y: number, patient: Patient, pose: SimPose, seed: number): Paths {
  const p = emptyPaths();
  const s = patient.heightCm / 170;
  const w = patient.morph.torsoWidth;
  const depth = patient.thickness.chest;
  const insp = pose.breath === "inspiration" ? 1 : 0;

  // Smooth thoracic envelope with subtle shoulder soft tissue. Keep the chest
  // wall thin so the lungs remain genuinely radiolucent at chest technique.
  const body = softEllipse(x, y, 0, 39.5*s, 16.3*w*s, 24.6*s, 0, 0.045);
  const shoulderL = gauss(x,y,-13.5*w*s,24.8*s,6.8*s,4.2*s);
  const shoulderR = gauss(x,y,13.5*w*s,24.8*s,6.8*s,4.2*s);
  const envelope = Math.max(body, Math.min(0.72, shoulderL + shoulderR));
  if (envelope < 0.0025) { p.air = 36; return p; }

  const habitus = patient.habitus === "hypersthenic" ? 1.15 : patient.habitus === "asthenic" ? 0.80 : 1.0;
  p.soft = envelope * (2.15 * habitus);
  p.fat = envelope * (patient.habitus === "hypersthenic" ? 0.70 : patient.habitus === "asthenic" ? 0.28 : 0.43);

  const base = (50.0 - insp * 2.8) * s;
  const rightDia = base - 0.85*s;
  const leftDia = base + 0.45*s;

  // Lung masks are deliberately smooth and slightly asymmetric. The lower
  // zones are broader than the apices, matching a normal erect PA chest.
  let rightLung = Math.max(
    softEllipse(x,y,-6.7*s,31.7*s,7.4*s,15.6*s,-0.02,0.045),
    softEllipse(x,y,-7.1*s,40.0*s,9.3*s,13.5*s,0.01,0.045),
  );
  let leftLung = Math.max(
    softEllipse(x,y,6.4*s,31.9*s,7.0*s,15.4*s,0.02,0.045),
    softEllipse(x,y,6.8*s,39.6*s,8.8*s,13.2*s,-0.01,0.045),
  );
  rightLung *= smooth01((rightDia + 1.9*s - y)/(3.6*s));
  leftLung *= smooth01((leftDia + 1.9*s - y)/(3.6*s));

  // Smooth cardiac silhouette. Use overlapping low-frequency fields rather than
  // a single ellipse so the contour is not circular or diagram-like.
  const lv = gauss(x,y,3.9*s,43.5*s,5.1*s,7.3*s);
  const rv = gauss(x,y,0.6*s,42.4*s,3.5*s,6.2*s);
  const leftAtrium = gauss(x,y,2.2*s,38.8*s,3.6*s,4.2*s);
  const heart = clamp01(Math.max(lv, rv*0.78, leftAtrium*0.52));
  leftLung *= Math.max(0.08,1-heart*0.88);
  rightLung *= Math.max(0.58,1-heart*0.15);

  const lungMask = Math.max(rightLung,leftLung);
  p.soft *= Math.max(0.12,1-lungMask*0.88);
  p.fat *= Math.max(0.24,1-lungMask*0.74);
  p.lung += (rightLung+leftLung) * (0.72 + depth*0.018);

  // Cardiomediastinal attenuation. This is intentionally gentle at high kVp.
  const upperMediastinum = gauss(x,y,0.0,28.8*s,1.8*s,5.4*s);
  const midMediastinum = gauss(x,y,0.25*s,35.0*s,2.15*s,8.7*s);
  const aorticArch = gauss(x,y,2.1*s,30.4*s,1.15*s,1.45*s);
  p.soft += heart*0.90 + upperMediastinum*0.22 + midMediastinum*0.32 + aorticArch*0.14;

  // Trachea and main bronchi remain lucent through the mediastinum.
  p.air += softCapsule(x,y,0,20.8*s,0,30.8*s,0.38*s,0.30)*3.5;
  p.air += softCapsule(x,y,0,30.8*s,-2.1*s,33.8*s,0.23*s,0.32)*1.2;
  p.air += softCapsule(x,y,0,30.8*s,2.0*s,33.8*s,0.23*s,0.32)*1.2;

  // Hila and pulmonary vascular markings. Use several faint tapering branches,
  // with more basal than apical vessels, to avoid the previous spoke/line look.
  for (const side of [-1,1] as const) {
    const hx = side*3.0*s;
    const hy = (side<0?35.8:35.0)*s;
    p.soft += gauss(x,y,hx,hy,1.45*s,1.85*s)*0.15;
    const targets = side<0 ? [
      [-4.8,31.5,.11,.075],[-5.6,34.2,.12,.085],[-6.3,37.6,.12,.10],[-7.2,40.0,.10,.095],[-8.4,42.4,.085,.085],[-9.0,44.8,.065,.072],[-8.3,47.0,.05,.06],[-5.4,45.8,.06,.065]
    ] : [
      [4.6,31.4,.11,.075],[5.3,34.0,.12,.085],[6.0,37.4,.12,.10],[6.9,39.8,.10,.095],[7.8,42.2,.085,.085],[8.3,44.5,.065,.072],[7.8,46.8,.05,.06],[5.2,45.4,.06,.065]
    ];
    for (const [tx,ty,r,gain] of targets) p.soft += softCapsule(x,y,hx,hy,tx*s,ty*s,r*s,0.38)*gain;
  }

  // Broad hemidiaphragmatic domes formed as low-frequency attenuation fields,
  // not bright line segments. Right remains slightly higher than left.
  const rDomeY = rightDia + 0.040*((x-6.2*s)*(x-6.2*s))/s;
  const lDomeY = leftDia + 0.044*((x+5.8*s)*(x+5.8*s))/s;
  const rGate = smooth01((x/s+13.0)/4.0) * (1-smooth01((x/s-0.5)/3.0));
  const lGate = smooth01((x/s-0.5)/3.0) * (1-smooth01((x/s-13.0)/4.0));
  p.soft += Math.exp(-((y-rDomeY)/(0.75*s))**2)*0.24*rGate;
  p.soft += Math.exp(-((y-lDomeY)/(0.78*s))**2)*0.22*lGate;

  // Left gastric bubble beneath the diaphragm.
  p.gas += gauss(x,y,5.8*s,(leftDia+3.0*s),3.0*s,1.7*s)*1.8;

  // Gentle parenchymal texture: enough to avoid flat grey lungs without
  // synthesising obvious blobs or fake reticulation.
  const coarse = (fbm(x*0.22,y*0.22,seed+19)-0.5)*0.016;
  const fine = (fbm(x*0.78,y*0.78,seed+29)-0.5)*0.008;
  p.soft += lungMask * Math.max(0,coarse+fine)*0.045;

  // Bone fields are deliberately zero here; the Human Atlas owns skeletal
  // geometry for PA chest so the two systems cannot double-render the skeleton.
  p.bone = 0;
  p.cortical = 0;
  return p;
}
