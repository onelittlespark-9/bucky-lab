import type { Patient, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { fbm, rimEllipse, softCapsule, softEllipse } from "./geometry";

const emptyPaths = (): Paths => ({ air: 0, lung: 0, fat: 0, soft: 0, bone: 0, cortical: 0, gas: 0, metal: 0 });
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth01 = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };

/**
 * Normal PA chest attenuation model.
 *
 * Lung attenuation replaces thoracic soft tissue rather than being added on top
 * of it. Skeletal detail is anatomically shaped but deliberately low-amplitude:
 * at PA chest technique ribs and thoracic vertebrae are background anatomy, not
 * white line art.
 */
export function samplePaChest(x: number, y: number, patient: Patient, pose: SimPose, seed: number): Paths {
  const p = emptyPaths();
  const s = patient.heightCm / 170;
  const widthScale = patient.morph.torsoWidth;
  const chestDepth = patient.thickness.chest;
  const insp = pose.breath === "inspiration" ? 1 : 0;

  const body = softEllipse(x, y, 0, 39.0 * s, 16.0 * widthScale * s, 24.0 * s, 0, 0.055);
  if (body < 0.003) {
    p.air = 36;
    return p;
  }

  const habitus = patient.habitus === "hypersthenic" ? 1.15 : patient.habitus === "asthenic" ? 0.78 : 1.0;
  p.soft = body * (2.55 * habitus);
  p.fat = body * (patient.habitus === "hypersthenic" ? 0.72 : patient.habitus === "asthenic" ? 0.30 : 0.46);

  const base = (50.0 - insp * 2.7) * s;
  const rightDia = base - 0.75 * s;
  const leftDia = base + 0.45 * s;

  let rightLung = Math.max(
    softEllipse(x, y, -6.7*s, 31.5*s, 7.6*s, 15.8*s, -0.015, 0.055),
    softEllipse(x, y, -7.0*s, 39.5*s, 9.0*s, 13.0*s, 0.01, 0.055),
  );
  let leftLung = Math.max(
    softEllipse(x, y, 6.4*s, 31.7*s, 7.2*s, 15.5*s, 0.015, 0.055),
    softEllipse(x, y, 6.8*s, 39.2*s, 8.4*s, 12.7*s, -0.01, 0.055),
  );

  rightLung *= smooth01((rightDia + 1.7*s - y) / (3.4*s));
  leftLung *= smooth01((leftDia + 1.7*s - y) / (3.4*s));

  const heartUpper = softEllipse(x, y, 2.7*s, 41.3*s, 5.0*s, 7.0*s, 0.12, 0.055);
  const heartLower = softEllipse(x, y, 3.3*s, 45.0*s, 6.0*s, 5.1*s, 0.10, 0.055);
  const heart = Math.max(heartUpper, heartLower);
  leftLung *= Math.max(0.08, 1 - heart * 0.92);
  rightLung *= Math.max(0.55, 1 - heart * 0.18);

  const lungMask = Math.max(rightLung, leftLung);
  p.soft *= Math.max(0.16, 1 - lungMask * 0.84);
  p.fat *= Math.max(0.26, 1 - lungMask * 0.70);
  p.lung += (rightLung + leftLung) * (0.85 + chestDepth * 0.020);

  const mediastinum = softEllipse(x, y, 0.35*s, 35.5*s, 2.2*s, 10.4*s, 0, 0.065);
  const upperMediastinum = softEllipse(x, y, 0.15*s, 28.0*s, 1.75*s, 5.0*s, 0, 0.07);
  const aorticKnuckle = softEllipse(x, y, 2.15*s, 30.6*s, 1.15*s, 1.35*s, -0.10, 0.08);
  p.soft += heart * 1.25 + mediastinum * 0.44 + upperMediastinum * 0.30 + aorticKnuckle * 0.20;

  p.air += softCapsule(x, y, 0, 21.0*s, 0, 31.0*s, 0.40*s, 0.28) * 3.8;
  p.air += softCapsule(x, y, 0, 31.0*s, -2.1*s, 34.1*s, 0.25*s, 0.30) * 1.4;
  p.air += softCapsule(x, y, 0, 31.0*s, 2.0*s, 34.0*s, 0.25*s, 0.30) * 1.4;

  for (const side of [-1, 1] as const) {
    const hx = side * 3.0 * s;
    const hy = (side < 0 ? 35.7 : 34.9) * s;
    p.soft += softEllipse(x, y, hx, hy, 1.35*s, 1.75*s, 0, 0.18) * 0.22;

    const targets = side < 0 ? [
      [-5.2, 31.0, .11], [-6.2, 37.8, .13], [-7.6, 40.5, .10], [-8.8, 43.0, .075], [-9.0, 46.0, .055], [-5.7, 45.5, .065]
    ] : [
      [5.0, 30.8, .11], [5.8, 37.4, .13], [7.1, 40.0, .10], [8.1, 42.8, .075], [8.2, 45.7, .055], [5.6, 45.2, .065]
    ];
    for (const [tx, ty, r] of targets) {
      const vessel = softCapsule(x, y, hx, hy, tx*s, ty*s, r*s, 0.34);
      p.soft += vessel * 0.12;
    }
  }

  // Improved thoracic spine geometry. The geometry follows vertebral bodies,
  // pedicles and posterior elements, but PA-chest weighting is kept low so the
  // spine is seen through the mediastinum rather than appearing as white beads.
  const sx = 0.15 * pose.rotationY;
  for (let i = 0; i < 11; i++) {
    const yy = (24.2 + i * 2.55) * s;
    const bodyRx = 0.88 * s;
    const bodyRy = 0.64 * s;
    const bodyV = softEllipse(x, y, sx, yy, bodyRx, bodyRy, 0, 0.20);
    p.bone += bodyV * 0.10;

    const endPlateTop = rimEllipse(x, y, sx, yy - bodyRy * 0.66, bodyRx * 0.93, 0.10*s, 0.50);
    const endPlateBottom = rimEllipse(x, y, sx, yy + bodyRy * 0.66, bodyRx * 0.93, 0.10*s, 0.50);
    p.cortical += (endPlateTop + endPlateBottom) * 0.010;

    const pedOffset = bodyRx * 0.76;
    const pedL = softEllipse(x, y, sx - pedOffset, yy, 0.24*s, 0.32*s, 0, 0.24);
    const pedR = softEllipse(x, y, sx + pedOffset, yy, 0.24*s, 0.32*s, 0, 0.24);
    p.bone += (pedL + pedR) * 0.045;

    const spinous = softCapsule(x, y, sx, yy + bodyRy*0.12, sx, yy + bodyRy*0.92, 0.10*s, 0.30);
    p.bone += spinous * 0.030;
  }
  const posteriorSpine = softCapsule(x, y, sx, 23.5*s, sx, 50.5*s, 0.38*s, 0.40);
  p.bone += posteriorSpine * 0.045;

  // Clavicles use a shallow S-shape instead of one straight bar.
  for (const side of [-1, 1] as const) {
    const medial = softCapsule(x, y, side*1.15*s, 25.9*s, side*5.1*s, 24.7*s, 0.18*s, 0.34);
    const lateral = softCapsule(x, y, side*5.1*s, 24.7*s, side*9.8*s, 25.9*s, 0.17*s, 0.34);
    const acromial = softCapsule(x, y, side*9.8*s, 25.9*s, side*11.4*s, 26.5*s, 0.15*s, 0.36);
    p.bone += medial * 0.12 + lateral * 0.10 + acromial * 0.07;
    p.cortical += medial * 0.010 + lateral * 0.008;
  }

  // Scapulae should mostly be rotated clear of the lungs in a correct PA chest.
  // Retain only a faint peripheral trace so positioning still has an anatomical cue.
  for (const side of [-1, 1] as const) {
    const scap = softEllipse(x, y, side*12.3*widthScale*s, 33.0*s, 3.4*s, 6.0*s, side*0.22, 0.14);
    p.bone += scap * Math.max(0.012, 0.040 * (1 - Math.min(1, pose.shoulderRoll * 1.25)));
  }

  // Ribs use posterior -> lateral -> anterior arcs. The supplied geometry is
  // useful, but its original weights were extremity-like. These much lower
  // weights keep rib cortices visible without turning them into drawn rods.
  for (let i = 0; i < 10; i++) {
    const yy = (26.7 + i * 2.65) * s;
    const drop = (0.9 + i * 0.18) * s;
    const lateralX = (10.0 + i * 0.10) * widthScale * s;
    const anteriorX = (12.8 - i * 0.08) * widthScale * s;
    for (const side of [-1, 1] as const) {
      const post1 = softCapsule(x, y, side*1.5*s, yy, side*4.8*s, yy + drop*0.18, 0.11*s, 0.38);
      const post2 = softCapsule(x, y, side*4.8*s, yy + drop*0.18, side*lateralX, yy + drop*0.68, 0.105*s, 0.40);
      const ant = softCapsule(x, y, side*lateralX, yy + drop*0.68, side*anteriorX, yy + drop*1.18, 0.085*s, 0.42);
      const rib = post1 + post2 + ant * 0.58;
      p.bone += rib * 0.075;
      p.cortical += rib * 0.006;
      const trab = 0.88 + 0.12 * fbm(x * 1.8, y * 1.8, seed + i * 7);
      p.bone += rib * 0.010 * trab;
    }
  }

  const addDome = (side: -1|1, level: number) => {
    const xs = [1.0, 4.0, 7.0, 10.0, 13.0].map(v => side * v * s);
    const ys = [level-0.45*s, level-0.95*s, level-0.70*s, level+0.05*s, level+0.75*s];
    for (let i=0;i<4;i++) p.soft += softCapsule(x,y,xs[i]!,ys[i]!,xs[i+1]!,ys[i+1]!,0.20*s,0.42)*0.20;
  };
  addDome(-1, leftDia);
  addDome(1, rightDia);

  const coarse = (fbm(x * 0.26, y * 0.26, seed + 19) - 0.5) * 0.020;
  const fine = (fbm(x * 0.90, y * 0.90, seed + 29) - 0.5) * 0.010;
  p.soft += Math.max(0, lungMask) * Math.max(0, coarse + fine) * 0.055;

  return p;
}
