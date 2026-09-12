import type { Patient, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule, softEllipse } from "./geometry";

const emptyPaths = (): Paths => ({ air: 0, lung: 0, fat: 0, soft: 0, bone: 0, cortical: 0, gas: 0, metal: 0 });
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth01 = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };

/**
 * Purpose-built normal PA chest attenuation model.
 * Coordinates are cm on the detector plane, with y measured inferiorly from the
 * vertex convention used by the simulator. The model deliberately avoids the
 * generic torso sampler so chest anatomy is formed in one coordinate system.
 */
export function samplePaChest(x: number, y: number, patient: Patient, pose: SimPose, seed: number): Paths {
  const p = emptyPaths();
  const s = patient.heightCm / 170;
  const torsoW = 15.8 * patient.morph.torsoWidth * s;
  const chestDepth = patient.thickness.chest;
  const centreY = 39.5 * s;
  const torsoH = 24.8 * s;

  const body = softEllipse(x, y, 0, centreY, torsoW, torsoH, 0, 0.075);
  if (body < 0.006) {
    p.air = 40;
    return p;
  }

  // Thin PA chest wall/background attenuation.
  const habitusFat = patient.habitus === "hypersthenic" ? 1.25 : patient.habitus === "asthenic" ? 0.45 : 0.78;
  p.fat = body * habitusFat;
  p.soft = body * chestDepth * 0.030;

  const inspiration = pose.breath === "inspiration" ? 1 : 0;
  const diaBase = (49.0 - inspiration * 3.0) * s;
  const rightDia = diaBase - 0.9 * s;
  const leftDia = diaBase + 0.35 * s;

  // Lung fields: apices narrow, bases wider, heart notch on the left.
  const rUpper = softEllipse(x, y, -6.7 * s, 32.8 * s, 8.7 * s, 18.0 * s, -0.02, 0.07);
  const rLower = softEllipse(x, y, -7.0 * s, 40.2 * s, 9.8 * s, 13.0 * s, 0.01, 0.07);
  let rightLung = Math.max(rUpper, rLower);
  const lUpper = softEllipse(x, y, 6.5 * s, 33.0 * s, 8.2 * s, 17.8 * s, 0.02, 0.07);
  const lLower = softEllipse(x, y, 6.8 * s, 39.8 * s, 8.7 * s, 12.6 * s, -0.01, 0.07);
  let leftLung = Math.max(lUpper, lLower);

  const rFade = smooth01((rightDia + 1.2 * s - y) / (2.4 * s));
  const lFade = smooth01((leftDia + 1.2 * s - y) / (2.4 * s));
  rightLung *= rFade;
  leftLung *= lFade;

  // Cardiomediastinal silhouette, mostly on the patient's left (image right).
  const heartMain = softEllipse(x, y, 2.8 * s, 42.7 * s, 5.7 * s, 7.3 * s, 0.18, 0.08);
  const heartInferior = softEllipse(x, y, 2.1 * s, 46.0 * s, 6.3 * s, 4.1 * s, 0.08, 0.08);
  const heart = Math.max(heartMain, heartInferior);
  leftLung *= Math.max(0.10, 1 - heart * 0.88);
  rightLung *= Math.max(0.45, 1 - heart * 0.24);

  const mediastinum = softEllipse(x, y, 0.3 * s, 34.0 * s, 2.5 * s, 11.0 * s, 0, 0.09);
  const upperMediastinum = softEllipse(x, y, 0.1 * s, 27.0 * s, 2.0 * s, 5.7 * s, 0, 0.10);
  const aorticKnuckle = softEllipse(x, y, 2.1 * s, 30.6 * s, 1.35 * s, 1.7 * s, -0.1, 0.10);

  const lungShape = Math.max(rightLung, leftLung);
  p.soft *= Math.max(0.12, 1 - lungShape * 0.88);
  p.fat *= Math.max(0.24, 1 - lungShape * 0.72);
  p.lung += (rightLung + leftLung) * chestDepth * 0.34;
  p.soft += heart * 2.25 + mediastinum * 0.78 + upperMediastinum * 0.58 + aorticKnuckle * 0.34;

  // Trachea and main bronchi remain lucent through the upper mediastinum.
  p.air += softCapsule(x, y, 0, 20.0 * s, 0, 31.2 * s, 0.48 * s, 0.22) * 5.2;
  p.air += softCapsule(x, y, 0, 31.0 * s, -2.2 * s, 34.0 * s, 0.34 * s, 0.24) * 2.2;
  p.air += softCapsule(x, y, 0, 31.0 * s, 2.2 * s, 34.0 * s, 0.34 * s, 0.24) * 2.2;

  // Hila and branching pulmonary vessels. These are attenuation paths, not line overlays.
  for (const side of [-1, 1] as const) {
    const hx = side * 3.2 * s;
    const hy = (side < 0 ? 35.7 : 34.8) * s;
    p.soft += softEllipse(x, y, hx, hy, 1.55 * s, 2.0 * s, 0, 0.16) * 0.34;
    const branches: Array<[number, number, number, number, number, number]> = side < 0 ? [
      [hx, hy, -6.0*s, 39.0*s, 0.20*s, 0.26],
      [hx, hy, -8.1*s, 42.0*s, 0.15*s, 0.25],
      [hx, hy, -9.2*s, 45.0*s, 0.11*s, 0.22],
      [hx, hy, -5.3*s, 31.0*s, 0.13*s, 0.22],
    ] : [
      [hx, hy, 5.6*s, 38.5*s, 0.20*s, 0.26],
      [hx, hy, 7.3*s, 41.3*s, 0.14*s, 0.25],
      [hx, hy, 8.2*s, 44.2*s, 0.10*s, 0.22],
      [hx, hy, 5.0*s, 30.6*s, 0.13*s, 0.22],
    ];
    for (const [x1,y1,x2,y2,r,soft] of branches) p.soft += softCapsule(x, y, x1, y1, x2, y2, r, 0.30) * soft;
  }

  // Thoracic vertebral bodies: visible but not a solid central column.
  for (let i = 0; i < 11; i++) {
    const vy = (24.5 + i * 2.55) * s;
    const bodyV = softEllipse(x, y, 0, vy, 0.92 * s, 0.74 * s, 0, 0.16);
    p.bone += bodyV * 0.72;
    p.cortical += bodyV * 0.08;
  }

  // Posterior ribs: smooth inferiorly sloping arcs. The anterior portions are
  // deliberately lower contrast so the image reads like a PA radiograph.
  for (let i = 0; i < 10; i++) {
    const y0 = (27.0 + i * 2.55) * s;
    const lateralX = (12.6 - i * 0.12) * patient.morph.torsoWidth * s;
    const drop = (1.0 + i * 0.18) * s;
    for (const side of [-1, 1] as const) {
      const x0 = side * 1.5 * s;
      const x1 = side * 5.8 * s;
      const x2 = side * lateralX;
      const x3 = side * (9.8 - i * 0.10) * patient.morph.torsoWidth * s;
      const seg1 = softCapsule(x, y, x0, y0, x1, y0 + drop * 0.35, 0.16 * s, 0.26);
      const seg2 = softCapsule(x, y, x1, y0 + drop * 0.35, x2, y0 + drop, 0.15 * s, 0.27);
      const seg3 = softCapsule(x, y, x2, y0 + drop, x3, y0 + drop * 1.15, 0.12 * s, 0.30);
      p.bone += (seg1 * 0.50 + seg2 * 0.44 + seg3 * 0.22);
      p.cortical += (seg1 * 0.05 + seg2 * 0.045 + seg3 * 0.02);
    }
  }

  // Clavicles, gently curved and symmetric about the spine.
  for (const side of [-1, 1] as const) {
    p.bone += softCapsule(x, y, side * 1.3 * s, 25.8 * s, side * 7.2 * s, 24.6 * s, 0.28 * s, 0.23) * 0.52;
    p.bone += softCapsule(x, y, side * 7.2 * s, 24.6 * s, side * 11.0 * s, 26.0 * s, 0.24 * s, 0.23) * 0.42;
  }

  // Hemidiaphragms: broad shallow domes with side-specific height.
  p.soft += softCapsule(x, y, -13.0*s, leftDia+1.3*s, -6.0*s, leftDia-0.2*s, 0.26*s, 0.34) * 0.36;
  p.soft += softCapsule(x, y, -6.0*s, leftDia-0.2*s, -1.0*s, leftDia-0.8*s, 0.24*s, 0.34) * 0.42;
  p.soft += softCapsule(x, y, 1.0*s, rightDia-0.9*s, 6.0*s, rightDia-0.2*s, 0.24*s, 0.34) * 0.44;
  p.soft += softCapsule(x, y, 6.0*s, rightDia-0.2*s, 13.0*s, rightDia+1.1*s, 0.26*s, 0.34) * 0.38;

  // Subtle heterogeneous lung texture only; no broad synthetic blobs.
  const coarse = (fbm(x * 0.42, y * 0.42, seed + 19) - 0.5) * 0.026;
  const fine = (fbm(x * 1.35, y * 1.35, seed + 29) - 0.5) * 0.014;
  p.soft += Math.max(0, p.lung) * Math.max(0, coarse + fine) * 0.10;

  return p;
}
