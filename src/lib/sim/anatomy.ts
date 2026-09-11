import type { Patient, Projection, SimPose } from "./types";
import { fbm, rimEllipse, softCapsule, softEllipse } from "./geometry";

export interface Paths {
  air: number;
  lung: number;
  fat: number;
  soft: number;
  bone: number;
  cortical: number;
  gas: number;
  metal: number;
}

export interface SampleCtx {
  patient: Patient;
  projection: Projection;
  pose: SimPose;
  seed: number;
}

const EMPTY: Paths = { air: 0, lung: 0, fat: 0, soft: 0, bone: 0, cortical: 0, gas: 0, metal: 0 };

function bodyScale(patient: Patient) {
  const h = patient.heightCm / 170;
  return {
    h,
    w: patient.morph.torsoWidth,
    d: patient.morph.torsoDepth,
    abd: patient.morph.abdomen,
    kyph: patient.morph.kyphosis,
  };
}

function sy(y: number, patient: Patient) {
  return y * (patient.heightCm / 170);
}

function widthAt(y: number, patient: Patient): number {
  const s = bodyScale(patient);
  const keys: [number, number][] = [
    [0, 7.5],
    [11, 8],
    [16, 5.5],
    [22, 18 * s.w * patient.morph.shoulder],
    [36, 16 * s.w],
    [50, 14 * s.w],
    [58, 13.5 * s.w * (0.6 + 0.4 * s.abd)],
    [68, 17 * s.w * patient.morph.hip],
    [82, 16 * s.w * patient.morph.hip],
    [95, 9 * patient.morph.limb],
    [125, 7 * patient.morph.limb],
    [155, 5.5 * patient.morph.limb],
    [170, 4.5],
  ];
  const yy = y / s.h;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (yy <= b[0]) {
      const t = (yy - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return 4;
}

function inTorsoEnvelope(x: number, y: number, patient: Patient): number {
  const hw = widthAt(y, patient);
  const s = bodyScale(patient);
  if (y > sy(84, patient)) {
    const hipY = sy(82, patient);
    const left = softCapsule(x, y, -8 * s.w, hipY, -6 * s.w, sy(170, patient), 6.2 * patient.morph.limb, 0.2);
    const right = softCapsule(x, y, 8 * s.w, hipY, 6 * s.w, sy(170, patient), 6.2 * patient.morph.limb, 0.2);
    return Math.max(left, right);
  }
  return softEllipse(x, y, 0, y, hw, 8, 0, 0.12);
}

function diaphragmY(patient: Patient, pose: SimPose): number {
  let y = sy(48, patient);
  if (patient.habitus === "hypersthenic") y -= 6;
  if (patient.habitus === "asthenic") y += 5;
  if (pose.breath === "inspiration") y += 4;
  if (pose.breath === "expiration") y -= 3;
  y += patient.morph.kyphosis * 2;
  return y;
}

export function sampleTorsoAP(x: number, y: number, ctx: SampleCtx): Paths {
  const p: Paths = { ...EMPTY };
  const { patient, pose, seed } = ctx;
  const s = bodyScale(patient);
  const env = inTorsoEnvelope(x, y, patient);
  if (env < 0.02) {
    p.air = 40;
    return p;
  }

  const depth = 0.55 * (patient.thickness.chest + patient.thickness.abdomen);
  const fatLayer = (patient.habitus === "hypersthenic" ? 4.5 : patient.habitus === "asthenic" ? 0.8 : 2) * env;
  p.fat = fatLayer;
  p.soft = Math.max(0.4, depth * env - fatLayer);

  const dia = diaphragmY(patient, pose);
  const lungH = 15 * s.h + (pose.breath === "inspiration" ? 3 : 0);
  const lungY = dia - lungH * 0.42;
  const rot = (pose.rotationY * Math.PI) / 180;
  const xL = x * Math.cos(rot) - 0.15 * pose.rotationY;

  const rLung = softEllipse(xL, y, -8.2 * s.w, lungY, 10.2 * s.w, lungH, 0.04, 0.12);
  const lLung = softEllipse(xL, y, 7.4 * s.w, lungY + 0.6, 9.2 * s.w, lungH * 0.95, -0.05, 0.12);
  let lung = Math.max(rLung, lLung);
  if (y > dia + 1) lung = 0;

  const heart = softEllipse(xL, y, 2.6 * s.w, dia - 6, 6.4 * s.w, 7.2 * s.h, 0.45, 0.15);
  if (heart > 0.05) {
    lung *= 1 - heart * 0.85;
    p.soft += heart * 7;
  }

  if (lung > 0.04) {
    const replace = lung * 0.82;
    p.soft *= 1 - replace * 0.75;
    p.lung += lung * (patient.thickness.chest * 0.45);
    const vessels = fbm(x * 0.45, y * 0.45, seed + 3);
    p.soft += lung * vessels * 1.1;
  }

  const trachea = softCapsule(xL, y, 0, sy(20, patient), 0.4, dia - 10, 0.85, 0.3);
  if (trachea > 0.2) {
    p.lung += trachea * 4;
    p.soft *= 1 - trachea * 0.4;
  }

  const gastric = softEllipse(xL, y, 7.5 * s.w, dia + 3.5, 4.2, 3.2, 0.2, 0.2);
  if (gastric > 0.1 && y > dia) {
    p.gas += gastric * 6;
    p.soft *= 1 - gastric * 0.55;
  }

  if (y > dia + 2 && y < sy(82, patient)) {
    const gasN = fbm(x * 0.16 + seed, y * 0.16, seed + 9);
    if (gasN > 0.58) {
      const g = (gasN - 0.58) * 2.2 * env;
      p.gas += g * 5;
      p.soft *= 1 - g * 0.35;
    }
    const psoasL = softCapsule(x, y, -4.2, sy(52, patient), -5.5, sy(78, patient), 2.4 * s.w, 0.4);
    const psoasR = softCapsule(x, y, 4.2, sy(52, patient), 5.5, sy(78, patient), 2.4 * s.w, 0.4);
    p.soft += Math.max(psoasL, psoasR) * 3.2;
    const kidneyL = softEllipse(x, y, -6.5 * s.w, sy(56, patient), 3.2, 6.2, 0.15, 0.25);
    const kidneyR = softEllipse(x, y, 6.2 * s.w, sy(55, patient), 3.1, 6, -0.12, 0.25);
    p.soft += Math.max(kidneyL, kidneyR) * 2.4;
  }

  const spineX = pose.rotationY * 0.12;
  for (let i = 1; i <= 24; i++) {
    const vy = sy(14 + i * 2.85, patient);
    const isLumbar = i > 12;
    const rx = isLumbar ? 2.1 : 1.55;
    const ry = isLumbar ? 1.35 : 1.05;
    const body = softEllipse(x, y, spineX, vy, rx, ry, 0, 0.2);
    p.bone += body * (isLumbar ? 5.5 : 4.2);
    p.cortical += rimEllipse(x, y, spineX, vy, rx, ry, 0.35) * 2;
  }
  p.bone += softCapsule(x, y, spineX, sy(16, patient), spineX, sy(88, patient), 0.7, 0.4) * 2.2;

  const scapClear = pose.shoulderRoll;
  for (let side of [-1, 1]) {
    const sx = side * 16 * s.w * patient.morph.shoulder;
    const clav = softCapsule(x, y, side * 1.5, sy(26, patient), sx, sy(25, patient), 0.7, 0.3);
    p.bone += clav * 4.5;
    p.cortical += clav * 1.4;
    if (scapClear < 0.55) {
      const scap = softEllipse(x, y, side * 12 * s.w, sy(34, patient), 6.5, 8.5, side * 0.35, 0.2);
      p.bone += scap * (1 - scapClear) * 2.8;
    }
  }

  for (let i = 1; i <= 12; i++) {
    const y0 = sy(26 + i * 2.15, patient);
    if (y0 > dia + 8) continue;
    const drop = 2.2 + i * 0.55;
    const len = (11 + i * 0.35) * s.w;
    for (const side of [-1, 1]) {
      const rib = softCapsule(x, y, side * 2.2, y0, side * len, y0 + drop, 0.42 + i * 0.02, 0.35);
      p.bone += rib * 3.1;
      p.cortical += rib * 0.8;
    }
  }

  const crestY = sy(66, patient);
  const iliumL = softEllipse(x, y, -10 * s.w * patient.morph.hip, crestY + 6, 8.5 * s.w, 10, 0.35, 0.15);
  const iliumR = softEllipse(x, y, 10 * s.w * patient.morph.hip, crestY + 6, 8.5 * s.w, 10, -0.35, 0.15);
  p.bone += Math.max(iliumL, iliumR) * 4.8;
  p.cortical += Math.max(
    rimEllipse(x, y, -10 * s.w * patient.morph.hip, crestY + 6, 8.5 * s.w, 10, 0.7, 0.35),
    rimEllipse(x, y, 10 * s.w * patient.morph.hip, crestY + 6, 8.5 * s.w, 10, 0.7, -0.35),
  ) * 2;
  const sacrum = softEllipse(x, y, 0, sy(74, patient), 4.2, 7.5, 0, 0.2);
  p.bone += sacrum * 5;
  const obtL = softEllipse(x, y, -4.6, sy(82, patient), 2.6, 3.4, 0.2, 0.2);
  const obtR = softEllipse(x, y, 4.6, sy(82, patient), 2.6, 3.4, -0.2, 0.2);
  if (Math.max(obtL, obtR) > 0.3) {
    p.bone *= 1 - Math.max(obtL, obtR) * 0.55;
    p.soft += Math.max(obtL, obtR) * 2;
  }
  for (const side of [-1, 1]) {
    const femur = softCapsule(
      x,
      y,
      side * 8.2,
      sy(82, patient),
      side * 6.5,
      sy(125, patient),
      2.4 * patient.morph.limb,
      0.18,
    );
    p.bone += femur * 6;
    p.cortical += femur * 1.6;
    const head = softEllipse(x, y, side * 8, sy(81, patient), 2.6, 2.6, 0, 0.2);
    p.bone += head * 5;
  }

  const skull = softEllipse(x, y, 0, sy(9, patient), 8, 9.5, 0, 0.12);
  p.bone += skull * 3.5;
  p.cortical += rimEllipse(x, y, 0, sy(9, patient), 8, 9.5, 0.7) * 3;
  const sinus = softEllipse(x, y, 0, sy(11, patient), 2.4, 2.2, 0, 0.3);
  if (sinus > 0.2) {
    p.gas += sinus * 3;
    p.bone *= 1 - sinus * 0.3;
  }

  const mand = pose.chinUp < 0.4 && y < sy(22, patient);
  if (mand) {
    const jaw = softEllipse(x, y, 0, sy(16, patient), 6, 3.2, 0, 0.2);
    p.bone += jaw * (1 - pose.chinUp) * 3;
  }

  p.soft += fbm(x * 0.08, y * 0.08, seed) * 0.6;
  return p;
}

export function sampleTorsoLat(x: number, y: number, ctx: SampleCtx): Paths {
  const p: Paths = { ...EMPTY };
  const { patient, pose, seed } = ctx;
  const s = bodyScale(patient);
  const ant = 14 * s.d * (0.7 + 0.3 * s.abd);
  const post = -12 * s.d;
  const mid = (ant + post) / 2;
  const env = softEllipse(x, y, mid, y, (ant - post) * 0.55, 10, 0, 0.1);
  if (y < sy(0, patient) - 4 || y > sy(175, patient) || env < 0.02) {
    p.air = 40;
    return p;
  }
  const depth = patient.thickness.chest * 0.9;
  p.fat = (patient.habitus === "hypersthenic" ? 5 : 1.6) * env;
  p.soft = depth * env;

  const dia = diaphragmY(patient, pose);
  const lung = softEllipse(x, y, 2, dia - 14, 11 * s.d, 16 * s.h, 0, 0.12);
  if (lung > 0.05 && y < dia + 2) {
    p.soft *= 1 - lung * 0.7;
    p.lung += lung * 14;
  }
  const heart = softEllipse(x, y, 6, dia - 7, 5.5, 7, 0.2, 0.2);
  p.soft += heart * 8;
  const sternum = softCapsule(x, y, ant - 1, sy(24, patient), ant - 1.2, sy(46, patient), 0.7, 0.3);
  p.bone += sternum * 4;
  const spineX = post + 3 + patient.morph.kyphosis * 4;
  for (let i = 1; i <= 24; i++) {
    const vy = sy(14 + i * 2.85, patient);
    const kyphOff = Math.sin((i / 24) * Math.PI) * patient.morph.kyphosis * 6;
    const body = softEllipse(x, y, spineX + kyphOff, vy, 1.8, 1.2, 0, 0.2);
    p.bone += body * 6;
    const sp = softCapsule(x, y, spineX + kyphOff - 1.6, vy, spineX + kyphOff - 4.5, vy, 0.45, 0.3);
    p.bone += sp * 3;
  }
  p.gas += softEllipse(x, y, 8, dia + 4, 3.5, 2.8, 0, 0.25) * 5;
  const skull = softEllipse(x, y, 1, sy(9, patient), 10, 9.5, 0.05, 0.1);
  p.bone += skull * 4;
  p.cortical += rimEllipse(x, y, 1, sy(9, patient), 10, 9.5, 0.8, 0.05) * 3.5;
  const sella = softEllipse(x, y, 2.2, sy(11, patient), 1.1, 0.7, 0, 0.3);
  p.bone += sella * 2;
  const nasoph = softCapsule(x, y, 6, sy(14, patient), 5, sy(22, patient), 1.3, 0.3);
  p.gas += nasoph * 6;
  p.soft += fbm(x * 0.1, y * 0.1, seed) * 0.5;
  return p;
}

export function sampleCspineLat(x: number, y: number, ctx: SampleCtx): Paths {
  const p = sampleTorsoLat(x, y + 4, ctx);
  const { patient, pose } = ctx;
  const bodies = 7;
  for (let i = 0; i < bodies; i++) {
    const cy = sy(12 + i * 1.7, patient);
    const body = softEllipse(x, y, -1.2, cy, 1.5, 0.85, 0, 0.18);
    p.bone += body * 5;
    const sp = softCapsule(x, y, -2.4, cy, -5.2, cy + 0.4, 0.35, 0.3);
    p.bone += sp * 2.5;
  }
  const mand = softEllipse(x, y, 4.5 - pose.chinUp * 2, sy(14, patient), 4.2, 2.2, 0.3, 0.2);
  p.bone += mand * 3.5;
  const pharynx = softCapsule(x, y, 2.8, sy(12, patient), 2.2, sy(24, patient), 1.1, 0.25);
  p.gas += pharynx * 7;
  p.soft *= 0.92;
  return p;
}

export function sampleSkullLat(x: number, y: number, ctx: SampleCtx): Paths {
  const p: Paths = { ...EMPTY };
  const { seed } = ctx;
  const cal = softEllipse(x, y, 0, -1, 11.5, 10.5, 0.05, 0.08);
  if (cal < 0.02 && Math.hypot(x, y + 6) > 14) {
    p.air = 40;
    return p;
  }
  p.soft = 8 * Math.max(cal, softEllipse(x, y, 2, 6, 7, 6, 0, 0.2));
  p.bone += cal * 4.2;
  p.cortical += rimEllipse(x, y, 0, -1, 11.5, 10.5, 0.85, 0.05) * 4;
  p.cortical += rimEllipse(x, y, 0.3, -0.8, 9.6, 8.8, 0.4, 0.05) * 2;
  p.gas += softEllipse(x, y, 3.2, -3.4, 2.4, 1.6, 0.2, 0.3) * 5;
  p.gas += softEllipse(x, y, 1.4, 1.1, 1.5, 0.9, 0, 0.3) * 4;
  p.bone += softEllipse(x, y, 1.6, 1.4, 1.3, 0.7, 0, 0.25) * 3;
  p.bone += softEllipse(x, y, 4.5, 5.5, 5, 3.2, 0.4, 0.15) * 3.5;
  p.gas += softCapsule(x, y, 5, 3, 3.5, 8, 1.4, 0.25) * 6;
  p.bone += fbm(x * 0.3, y * 0.3, seed) * cal * 1.2;
  for (let i = 0; i < 6; i++) {
    p.bone += softEllipse(x, y, -1.2, 8 + i * 1.6, 1.4, 0.75, 0, 0.2) * 4;
  }
  return p;
}

export function sampleHandPA(x: number, y: number, ctx: SampleCtx): Paths {
  const p: Paths = { ...EMPTY };
  const { patient, seed } = ctx;
  const t = patient.morph.limb;
  const digits = [
    { x: -3.4, a: -0.18, l: 8.2 },
    { x: -1.6, a: -0.06, l: 9.4 },
    { x: 0.1, a: 0.02, l: 10.1 },
    { x: 1.8, a: 0.08, l: 9.2 },
    { x: 3.3, a: 0.22, l: 7.1 },
  ];
  let env = softEllipse(x, y, 0, 2.2, 4.6 * t, 4.2, 0, 0.15);
  for (const d of digits) {
    env = Math.max(env, softCapsule(x, y, d.x, 4, d.x + Math.sin(d.a) * d.l, 4 + Math.cos(d.a) * d.l, 0.85 * t, 0.2));
  }
  env = Math.max(env, softCapsule(x, y, 0, 2, 0, -5.5, 3.2 * t, 0.2));
  if (env < 0.04) {
    p.air = 20;
    return p;
  }
  p.soft = 2.8 * t * env;
  p.fat = 0.6 * env;

  for (let i = 0; i < 5; i++) {
    const d = digits[i]!;
    const baseX = d.x;
    const baseY = 4.2;
    const segs = i === 0 ? 3 : 4;
    let px = baseX;
    let py = baseY;
    const total = d.l;
    const lens = i === 0 ? [2.6, 2.2, 1.6] : [3.3, 2.4, 2.0, 1.4];
    for (let s = 0; s < segs; s++) {
      const len = (lens[s] ?? 1.5) * (total / 9);
      const nx = px + Math.sin(d.a) * len;
      const ny = py + Math.cos(d.a) * len;
      const r = (0.42 - s * 0.06) * t;
      const bone = softCapsule(x, y, px, py, nx, ny, r, 0.22);
      p.bone += bone * 5.5;
      p.cortical += bone * 1.5;
      px = nx;
      py = ny;
    }
  }
  const carpals = [
    [-1.6, 2.4, 0.7],
    [-0.4, 2.6, 0.75],
    [0.9, 2.5, 0.7],
    [2.0, 2.1, 0.6],
    [-1.4, 1.1, 0.65],
    [-0.2, 1.2, 0.8],
    [1.1, 1.15, 0.7],
    [2.0, 1.0, 0.55],
  ] as const;
  for (const c of carpals) {
    const b = softEllipse(x, y, c[0], c[1], c[2], c[2] * 0.85, 0, 0.25);
    p.bone += b * 5;
  }
  p.bone += softCapsule(x, y, -1.1, 0.2, -1.4, -5.2, 0.85 * t, 0.2) * 6;
  p.bone += softCapsule(x, y, 1.2, 0.2, 1.6, -5.2, 0.7 * t, 0.2) * 6;
  p.bone += fbm(x * 0.9, y * 0.9, seed) * 0.4 * env;
  return p;
}

export function sampleWristPA(x: number, y: number, ctx: SampleCtx): Paths {
  return sampleHandPA(x, y + 3.2, ctx);
}

export function sampleElbowAP(x: number, y: number, ctx: SampleCtx): Paths {
  const p: Paths = { ...EMPTY };
  const t = ctx.patient.morph.limb;
  const env = Math.max(
    softCapsule(x, y, 0, -8, 0, 8, 3.4 * t, 0.18),
    softEllipse(x, y, 0, 0, 3.8 * t, 3.2, 0, 0.15),
  );
  if (env < 0.04) {
    p.air = 20;
    return p;
  }
  p.soft = 6 * t * env;
  p.bone += softCapsule(x, y, 0, -1, 0, -9, 1.5 * t, 0.18) * 7;
  p.bone += softCapsule(x, y, -0.9, 1.2, -1.2, 9, 0.85 * t, 0.2) * 6;
  p.bone += softCapsule(x, y, 1.1, 1.4, 1.5, 9, 0.7 * t, 0.2) * 6;
  p.bone += softEllipse(x, y, 0, 0, 2.4 * t, 1.8, 0, 0.2) * 5;
  p.cortical += rimEllipse(x, y, 0, 0, 2.4 * t, 1.8, 0.4) * 2;
  p.bone += softEllipse(x, y, 2.2 * t, 0.2, 0.7, 1.1, 0, 0.25) * 4;
  p.bone += softEllipse(x, y, -2.2 * t, 0.2, 0.7, 1.1, 0, 0.25) * 4;
  return p;
}

export function sampleShoulderAP(x: number, y: number, ctx: SampleCtx): Paths {
  const p = sampleTorsoAP(x + 14, y + 30, ctx);
  const t = ctx.patient.morph.limb;
  p.bone += softEllipse(x, y, 0, 0, 2.8 * t, 2.8 * t, 0, 0.15) * 7;
  p.bone += softCapsule(x, y, 0.6, 1, 1.2, 10, 1.4 * t, 0.18) * 6;
  p.bone += softCapsule(x, y, -1, -1.5, -8, -2.2, 0.7, 0.25) * 5;
  p.cortical += rimEllipse(x, y, 0, 0, 2.8 * t, 2.8 * t, 0.4) * 2;
  p.lung += softEllipse(x, y, -6, 2, 7, 8, 0, 0.2) * 8;
  return p;
}

export function sampleKneeAP(x: number, y: number, ctx: SampleCtx): Paths {
  const p: Paths = { ...EMPTY };
  const t = ctx.patient.morph.limb;
  const env = softCapsule(x, y, 0, -10, 0, 10, 5.2 * t, 0.15);
  if (env < 0.04) {
    p.air = 20;
    return p;
  }
  p.soft = 9 * t * env;
  p.fat = 1.4 * env;
  p.bone += softCapsule(x, y, 0, -1.2, 0, -11, 2.5 * t, 0.16) * 7;
  p.bone += softCapsule(x, y, -0.3, 1.3, -0.2, 11, 2.2 * t, 0.16) * 7;
  p.bone += softCapsule(x, y, 2.4 * t, 2, 2.8 * t, 11, 0.7 * t, 0.22) * 5;
  p.bone += softEllipse(x, y, -1.5 * t, -0.2, 1.4, 1.6, 0, 0.2) * 4;
  p.bone += softEllipse(x, y, 1.5 * t, -0.2, 1.4, 1.6, 0, 0.2) * 4;
  p.cortical += rimEllipse(x, y, 0, 1.2, 2.4 * t, 1.3, 0.35) * 2;
  const pat = softEllipse(x, y, 0, -1.6, 1.8 * t, 2.2, 0, 0.2);
  p.bone += pat * 3.2;
  return p;
}

export function sampleKneeLat(x: number, y: number, ctx: SampleCtx): Paths {
  const p: Paths = { ...EMPTY };
  const t = ctx.patient.morph.limb;
  const flex = (ctx.pose.kneeFlex * Math.PI) / 180;
  const env = Math.max(
    softCapsule(x, y, -1, -10, 0, 0, 5.4 * t, 0.15),
    softCapsule(x, y, 0, 0, Math.sin(flex) * 10, Math.cos(flex) * 10, 5 * t, 0.15),
  );
  if (env < 0.04) {
    p.air = 20;
    return p;
  }
  p.soft = 8 * t * env;
  p.bone += softCapsule(x, y, -0.5, -1, -0.8, -11, 2.3 * t, 0.16) * 7;
  p.bone += softCapsule(x, y, 0.4, 1.2, Math.sin(flex) * 10, Math.cos(flex) * 10, 2.1 * t, 0.16) * 7;
  p.bone += softEllipse(x, y, 3.4 * t, -0.6, 1.3, 2.1, 0.2, 0.2) * 5;
  p.cortical += rimEllipse(x, y, 0, 0, 2.6 * t, 2.2, 0.4) * 1.5;
  p.gas += 0;
  return p;
}

export function sampleFootDP(x: number, y: number, ctx: SampleCtx): Paths {
  const p: Paths = { ...EMPTY };
  const t = ctx.patient.morph.limb;
  const env = Math.max(
    softEllipse(x, y, 0, 2, 4.4 * t, 8.5, 0, 0.12),
    softEllipse(x, y, 0, 9, 4.8 * t, 3.2, 0, 0.15),
  );
  if (env < 0.04) {
    p.air = 20;
    return p;
  }
  p.soft = 3.2 * t * env;
  const toes = [-2.4, -1.2, 0, 1.2, 2.3];
  for (let i = 0; i < 5; i++) {
    const tx = toes[i]!;
    p.bone += softCapsule(x, y, tx * 0.7, 3.4, tx, 12.5 - Math.abs(i - 2) * 0.6, 0.38 * t, 0.22) * 5;
    p.bone += softCapsule(x, y, tx, 12, tx, 14.2 - Math.abs(i - 2) * 0.5, 0.28 * t, 0.25) * 4;
  }
  p.bone += softEllipse(x, y, 0, 1.2, 2.4, 2.8, 0, 0.2) * 5;
  p.bone += softEllipse(x, y, -1.6, 2.4, 1.4, 1.6, 0.2, 0.25) * 4;
  p.bone += softEllipse(x, y, 1.5, 2.6, 1.3, 1.5, -0.15, 0.25) * 4;
  p.bone += softEllipse(x, y, 0, -3.4, 2.8, 3.4, 0, 0.18) * 6;
  return p;
}

export function sampleAnkleAP(x: number, y: number, ctx: SampleCtx): Paths {
  const p: Paths = { ...EMPTY };
  const t = ctx.patient.morph.limb;
  const env = softCapsule(x, y, 0, -8, 0, 6, 4.2 * t, 0.15);
  if (env < 0.04) {
    p.air = 20;
    return p;
  }
  p.soft = 5 * t * env;
  p.bone += softCapsule(x, y, -0.3, -1, -0.2, -9, 1.6 * t, 0.18) * 7;
  p.bone += softCapsule(x, y, 2.2 * t, -2, 2.5 * t, -9, 0.55 * t, 0.22) * 5;
  p.bone += softEllipse(x, y, 0, 1.4, 2.2 * t, 1.6, 0, 0.2) * 5;
  p.bone += softEllipse(x, y, -2.2 * t, 0.2, 0.7, 1.4, 0, 0.25) * 4;
  p.bone += softEllipse(x, y, 2.4 * t, 0.4, 0.6, 1.3, 0, 0.25) * 4;
  return p;
}

export function sampleAnatomy(x: number, y: number, ctx: SampleCtx): Paths {
  switch (ctx.projection.anatomy) {
    case "torso-ap":
    case "shoulder-ap":
      if (ctx.projection.anatomy === "shoulder-ap") return sampleShoulderAP(x, y, ctx);
      return sampleTorsoAP(x, y, ctx);
    case "torso-lat":
      return sampleTorsoLat(x, y, ctx);
    case "cspine-lat":
      return sampleCspineLat(x, y, ctx);
    case "skull-lat":
      return sampleSkullLat(x, y, ctx);
    case "hand-pa":
      return sampleHandPA(x, y, ctx);
    case "wrist-pa":
      return sampleWristPA(x, y, ctx);
    case "elbow-ap":
      return sampleElbowAP(x, y, ctx);
    case "knee-ap":
      return sampleKneeAP(x, y, ctx);
    case "knee-lat":
      return sampleKneeLat(x, y, ctx);
    case "foot-dp":
      return sampleFootDP(x, y, ctx);
    case "ankle-ap":
      return sampleAnkleAP(x, y, ctx);
    default:
      return sampleTorsoAP(x, y, ctx);
  }
}

export function hashPatient(id: string): number {
  let h = 7;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}
