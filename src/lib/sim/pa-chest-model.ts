import type { Patient, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule, softEllipse } from "./geometry";

const emptyPaths = (): Paths => ({ air: 0, lung: 0, fat: 0, soft: 0, bone: 0, cortical: 0, gas: 0, metal: 0 });
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth01 = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };

/**
 * Normal PA chest attenuation model.
 *
 * Important: lung attenuation replaces thoracic soft tissue rather than being
 * added on top of it. This is what gives a PA chest its characteristic dark
 * aerated lungs with a softer mediastinum and subtle overlying ribs.
 */
export function samplePaChest(x: number, y: number, patient: Patient, pose: SimPose, seed: number): Paths {
  const p = emptyPaths();
  const s = patient.heightCm / 170;
  const widthScale = patient.morph.torsoWidth;
  const chestDepth = patient.thickness.chest;
  const insp = pose.breath === "inspiration" ? 1 : 0;

  // Broad thoracic soft-tissue envelope. Keep this smooth and deliberately
  // low contrast: a real PA radiograph does not look like a body-outline mask.
  const body = softEllipse(x, y, 0, 39.0 * s, 16.0 * widthScale * s, 24.0 * s, 0, 0.055);
  if (body < 0.003) {
    p.air = 36;
    return p;
  }

  const habitus = patient.habitus === "hypersthenic" ? 1.15 : patient.habitus === "asthenic" ? 0.78 : 1.0;
  p.soft = body * (2.55 * habitus);
  p.fat = body * (patient.habitus === "hypersthenic" ? 0.72 : patient.habitus === "asthenic" ? 0.30 : 0.46);

  // Diaphragm levels: right slightly higher than left on a normal PA chest.
  const base = (50.0 - insp * 2.7) * s;
  const rightDia = base - 0.75 * s;
  const leftDia = base + 0.45 * s;

  // Anatomical lung fields. Two overlapping ellipses per side make the apices
  // narrow and the lower zones broader without producing obvious geometric edges.
  let rightLung = Math.max(
    softEllipse(x, y, -6.7*s, 31.5*s, 7.6*s, 15.8*s, -0.015, 0.055),
    softEllipse(x, y, -7.0*s, 39.5*s, 9.0*s, 13.0*s, 0.01, 0.055),
  );
  let leftLung = Math.max(
    softEllipse(x, y, 6.4*s, 31.7*s, 7.2*s, 15.5*s, 0.015, 0.055),
    softEllipse(x, y, 6.8*s, 39.2*s, 8.4*s, 12.7*s, -0.01, 0.055),
  );

  // Smooth fade into the hemidiaphragms, avoiding a horizontal cut-off.
  rightLung *= smooth01((rightDia + 1.7*s - y) / (3.4*s));
  leftLung *= smooth01((leftDia + 1.7*s - y) / (3.4*s));

  // Cardiac notch and mediastinal overlap. The heart remains mostly on the
  // patient's left (image right) and should not become a circular blob.
  const heartUpper = softEllipse(x, y, 2.7*s, 41.3*s, 5.0*s, 7.0*s, 0.12, 0.055);
  const heartLower = softEllipse(x, y, 3.3*s, 45.0*s, 6.0*s, 5.1*s, 0.10, 0.055);
  const heart = Math.max(heartUpper, heartLower);
  leftLung *= Math.max(0.08, 1 - heart * 0.92);
  rightLung *= Math.max(0.55, 1 - heart * 0.18);

  const lungMask = Math.max(rightLung, leftLung);
  // Carve lung from the chest wall; retain a thin anterior/posterior wall.
  p.soft *= Math.max(0.16, 1 - lungMask * 0.84);
  p.fat *= Math.max(0.26, 1 - lungMask * 0.70);
  // Aerated lung has some attenuation, but far less than soft tissue.
  p.lung += (rightLung + leftLung) * (0.85 + chestDepth * 0.020);

  // Cardiomediastinum. Use several overlapping low-amplitude shapes so there is
  // no single hard-edged white central column.
  const mediastinum = softEllipse(x, y, 0.35*s, 35.5*s, 2.2*s, 10.4*s, 0, 0.065);
  const upperMediastinum = softEllipse(x, y, 0.15*s, 28.0*s, 1.75*s, 5.0*s, 0, 0.07);
  const aorticKnuckle = softEllipse(x, y, 2.15*s, 30.6*s, 1.15*s, 1.35*s, -0.10, 0.08);
  p.soft += heart * 1.25 + mediastinum * 0.44 + upperMediastinum * 0.30 + aorticKnuckle * 0.20;

  // Tracheal air column and main bronchi.
  p.air += softCapsule(x, y, 0, 21.0*s, 0, 31.0*s, 0.40*s, 0.28) * 3.8;
  p.air += softCapsule(x, y, 0, 31.0*s, -2.1*s, 34.1*s, 0.25*s, 0.30) * 1.4;
  p.air += softCapsule(x, y, 0, 31.0*s, 2.0*s, 34.0*s, 0.25*s, 0.30) * 1.4;

  // Hila and tapering pulmonary vessels. Keep these deliberately subtle and
  // numerous enough to read as vascular markings rather than a few drawn lines.
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

  // Thoracic spine: subtle continuous density with faint segmental modulation.
  const spineStrip = softCapsule(x, y, 0, 24.0*s, 0, 50.0*s, 0.62*s, 0.34);
  p.bone += spineStrip * 0.11;
  for (let i = 0; i < 10; i++) {
    const vy = (25.5 + i * 2.55) * s;
    const vb = softEllipse(x, y, 0, vy, 0.78*s, 0.58*s, 0, 0.22);
    p.bone += vb * 0.075;
  }

  // Posterior ribs. Approximate each rib as a shallow curve using short segments,
  // but keep attenuation low enough that they remain background anatomy.
  for (let i = 0; i < 10; i++) {
    const y0 = (27.0 + i * 2.55) * s;
    const drop = (0.7 + i * 0.15) * s;
    const outer = (12.0 - i * 0.10) * widthScale * s;
    for (const side of [-1, 1] as const) {
      const pts: Array<[number, number]> = [
        [side*1.2*s, y0],
        [side*4.3*s, y0 + drop*0.18],
        [side*7.7*s, y0 + drop*0.52],
        [side*outer, y0 + drop],
      ];
      for (let j = 0; j < pts.length - 1; j++) {
        const [x1,y1] = pts[j]!, [x2,y2] = pts[j+1]!;
        const rib = softCapsule(x, y, x1, y1, x2, y2, 0.115*s, 0.38);
        p.bone += rib * (j === 0 ? 0.11 : j === 1 ? 0.095 : 0.075);
      }
    }
  }

  // Clavicles: slightly more conspicuous than ribs, but still soft-edged.
  for (const side of [-1, 1] as const) {
    const c1 = softCapsule(x, y, side*1.2*s, 25.8*s, side*5.5*s, 24.7*s, 0.20*s, 0.34);
    const c2 = softCapsule(x, y, side*5.5*s, 24.7*s, side*10.2*s, 26.0*s, 0.18*s, 0.34);
    p.bone += c1 * 0.16 + c2 * 0.12;
  }

  // Broad shallow hemidiaphragmatic domes. Four short segments per side avoid
  // the straight-bar appearance seen in previous renders.
  const addDome = (side: -1|1, centre: number, level: number) => {
    const xs = [1.0, 4.0, 7.0, 10.0, 13.0].map(v => side * v * s);
    const ys = [level-0.45*s, level-0.95*s, level-0.70*s, level+0.05*s, level+0.75*s];
    for (let i=0;i<4;i++) p.soft += softCapsule(x,y,xs[i]!,ys[i]!,xs[i+1]!,ys[i+1]!,0.20*s,0.42)*0.20;
  };
  addDome(-1, -6*s, leftDia);
  addDome(1, 6*s, rightDia);

  // Low-frequency lung texture only. No obvious synthetic speckle or blobs.
  const coarse = (fbm(x * 0.26, y * 0.26, seed + 19) - 0.5) * 0.020;
  const fine = (fbm(x * 0.90, y * 0.90, seed + 29) - 0.5) * 0.010;
  p.soft += Math.max(0, lungMask) * Math.max(0, coarse + fine) * 0.055;

  return p;
}
