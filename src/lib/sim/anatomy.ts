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

export function hashPatient(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function bodyScale(patient: Patient) {
  return {
    h: patient.heightCm / 170,
    w: patient.morph.torsoWidth,
    d: patient.morph.torsoDepth,
  };
}

function sy(cm: number, patient: Patient) {
  return (cm / 170) * patient.heightCm;
}

function diaphragmY(patient: Patient, pose: SimPose) {
  const base = sy(48, patient);
  return base + (pose.breath === "inspiration" ? -2.5 : 1.5);
}

function inTorsoEnvelope(x: number, y: number, patient: Patient) {
  const s = bodyScale(patient);
  const top = sy(14, patient);
  const bot = sy(92, patient);
  if (y < top - 4 || y > bot + 2) return 0;
  const mid = (top + bot) * 0.5;
  const halfH = (bot - top) * 0.55;
  const nx = x / (16 * s.w);
  const ny = (y - mid) / halfH;
  const r = Math.sqrt(nx * nx + ny * ny * 0.7);
  return Math.max(0, 1 - r * 0.92);
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
  // Full PA chest FOV: apices (above clavicles) down to costophrenic angles
  const lungH = 22 * s.h + (pose.breath === "inspiration" ? 4 : 0);
  const lungY = dia - lungH * 0.48;
  const rot = (pose.rotationY * Math.PI) / 180;
  const xL = x * Math.cos(rot) - 0.15 * pose.rotationY;

  const rLung = softEllipse(xL, y, -8.2 * s.w, lungY, 10.2 * s.w, lungH * 1.05, 0.04, 0.12);
  const lLung = softEllipse(xL, y, 7.4 * s.w, lungY + 0.6, 9.2 * s.w, lungH, -0.05, 0.12);
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

  // Spine
  const spineX = 0.15 * pose.rotationY;
  for (let i = 0; i < 12; i++) {
    const vy = sy(22 + i * 4.2, patient);
    const isLumbar = i >= 7;
    const rx = isLumbar ? 1.6 : 1.15;
    const ry = isLumbar ? 1.4 : 1.1;
    const body = softEllipse(x, y, spineX, vy, rx, ry, 0, 0.2);
    p.bone += body * (isLumbar ? 5.5 : 4.2);
    p.cortical += rimEllipse(x, y, spineX, vy, rx, ry, 0.35) * 2;
  }
  p.bone += softCapsule(x, y, spineX, sy(16, patient), spineX, sy(88, patient), 0.7, 0.4) * 2.2;

  // Clavicles / scapulae / ribs simplified
  const clav = softCapsule(x, y, -12 * s.w, sy(26, patient), 12 * s.w, sy(26, patient), 0.55, 0.25);
  p.bone += clav * 4.5;
  p.cortical += clav * 1.4;
  for (const side of [-1, 1]) {
    const scap = softEllipse(x, y, side * 11 * s.w, sy(32, patient), 5.5, 8, side * 0.3, 0.2);
    const scapClear = Math.min(1, pose.shoulderRoll * 1.2);
    p.bone += scap * (1 - scapClear) * 2.8;
  }
  for (let i = 0; i < 8; i++) {
    const ry = sy(28 + i * 3.2, patient);
    for (const side of [-1, 1]) {
      const rib = softCapsule(x, y, side * 3, ry, side * 14 * s.w, ry + 2.5, 0.35, 0.15);
      p.bone += rib * 3.1;
      p.cortical += rib * 0.8;
    }
  }

  // Pelvis
  const iliumL = softEllipse(x, y, -10 * s.w, sy(70, patient), 7, 9, 0.2, 0.15);
  const iliumR = softEllipse(x, y, 10 * s.w, sy(70, patient), 7, 9, -0.2, 0.15);
  p.bone += Math.max(iliumL, iliumR) * 4.8;
  p.cortical += Math.max(
    rimEllipse(x, y, -10 * s.w, sy(70, patient), 7, 9, 0.4),
    rimEllipse(x, y, 10 * s.w, sy(70, patient), 7, 9, 0.4),
  ) * 2;
  const sacrum = softEllipse(x, y, 0, sy(76, patient), 4, 6, 0, 0.2);
  p.bone += sacrum * 5;
  const obtL = softEllipse(x, y, -4.5 * s.w, sy(82, patient), 3.2, 4, 0, 0.25);
  const obtR = softEllipse(x, y, 4.5 * s.w, sy(82, patient), 3.2, 4, 0, 0.25);
  if (Math.max(obtL, obtR) > 0.2) {
    p.bone *= 1 - Math.max(obtL, obtR) * 0.55;
    p.soft += Math.max(obtL, obtR) * 2;
  }

  // Proximal femora
  for (const side of [-1, 1]) {
    const femur = softCapsule(
      x,
      y,
      side * 8 * s.w,
      sy(84, patient),
      side * 9 * s.w,
      sy(100, patient),
      1.3,
      0.2,
    );
    p.bone += femur * 6;
    p.cortical += femur * 1.6;
    const head = softEllipse(x, y, side * 8 * s.w, sy(82, patient), 2.4, 2.4, 0, 0.25);
    p.bone += head * 5;
  }

  const skull = softEllipse(x, y, 0, sy(8, patient), 8.5, 9.5, 0, 0.15);
  p.bone += skull * 3.5;
  p.cortical += rimEllipse(x, y, 0, sy(9, patient), 8, 9.5, 0.7) * 3;
  const sinus = softEllipse(x, y, 0, sy(11, patient), 4, 3, 0, 0.3);
  if (sinus > 0.2) {
    p.bone *= 1 - sinus * 0.3;
    p.air += sinus * 8;
  }
  const jaw = softEllipse(x, y, 0, sy(16, patient), 6, 3.5, 0, 0.2);
  if (jaw > 0.1) {
    p.bone += jaw * (1 - pose.chinUp) * 3;
  }

  p.air += Math.max(0, 8 * (1 - env));
  return p;
}

export function sampleTorsoLat(x: number, y: number, ctx: SampleCtx): Paths {
  const p: Paths = { ...EMPTY };
  const { patient, pose, seed } = ctx;
  const s = bodyScale(patient);
  const depth = patient.thickness.chest * 0.9;
  const env = softEllipse(x, y, 0, sy(50, patient), 14 * s.d, 38 * s.h, 0, 0.1);
  if (env < 0.02) {
    p.air = 40;
    return p;
  }
  p.soft = depth * env * 0.55;
  p.fat = env * 2;
  const dia = diaphragmY(patient, pose);
  const lung = softEllipse(x, y, -2, dia - 12, 11, 16 + (pose.breath === "inspiration" ? 3 : 0), 0.1, 0.12);
  if (lung > 0.05) {
    p.lung += lung * patient.thickness.chest * 0.5;
    p.soft *= 1 - lung * 0.5;
  }
  const sternum = softCapsule(x, y, 6, sy(28, patient), 6.5, sy(48, patient), 0.6, 0.2);
  p.bone += sternum * 4;
  for (let i = 0; i < 10; i++) {
    const vy = sy(24 + i * 4.5, patient);
    const body = softEllipse(x, y, -1.5, vy, 1.4, 1.2, 0, 0.2);
    p.bone += body * 6;
    const sp = softEllipse(x, y, -4.5, vy, 1.2, 1.5, 0, 0.25);
    p.bone += sp * 3;
  }
  const skull = softEllipse(x, y, 1, sy(9, patient), 10, 9.5, 0.1, 0.15);
  p.bone += skull * 4;
  p.cortical += rimEllipse(x, y, 1, sy(9, patient), 10, 9.5, 0.8, 0.05) * 3.5;
  const sella = softEllipse(x, y, 2, sy(11, patient), 1.2, 0.8, 0, 0.3);
  p.bone += sella * 2;
  p.air += Math.max(0, 10 * (1 - env));
  return p;
}

export function sampleCspineLat(x: number, y: number, ctx: SampleCtx): Paths {
  const p: Paths = { ...EMPTY };
  const { patient } = ctx;
  p.soft = 4;
  for (let i = 0; i < 7; i++) {
    const vy = sy(14 + i * 2.2, patient);
    const body = softEllipse(x, y, 0, vy, 1.1, 0.95, 0, 0.25);
    p.bone += body * 5;
    const sp = softEllipse(x, y, -2.2, vy, 0.9, 1.1, 0, 0.3);
    p.bone += sp * 2.5;
  }
  const mand = softEllipse(x, y, 2.5, sy(14, patient), 4, 2.5, 0.2, 0.2);
  p.bone += mand * 3.5;
  p.air += softCapsule(x, y, 1.5, sy(12, patient), 1.5, sy(22, patient), 0.7, 0.3) * 6;
  return p;
}

export function sampleSkullLat(x: number, y: number, ctx: SampleCtx): Paths {
  const p: Paths = { ...EMPTY };
  const { patient } = ctx;
  p.soft = 3;
  const cal = softEllipse(x, y, 0, -1, 11.5, 10.5, 0, 0.12);
  p.bone += cal * 4.2;
  p.cortical += rimEllipse(x, y, 0, -1, 11.5, 10.5, 0.85, 0.05) * 4;
  p.cortical += rimEllipse(x, y, 0.3, -0.8, 9.6, 8.8, 0.4, 0.05) * 2;
  p.bone += softEllipse(x, y, 1.6, 1.4, 1.3, 0.7, 0, 0.25) * 3;
  p.bone += softEllipse(x, y, 4.5, 5.5, 5, 3.2, 0.4, 0.15) * 3.5;
  const sinus = softEllipse(x, y, 3, 2, 3.5, 2.5, 0, 0.25);
  if (sinus > 0.15) {
    p.air += sinus * 10;
    p.bone *= 1 - sinus * 0.25;
  }
  return p;
}

export function sampleHandPA(x: number, y: number, ctx: SampleCtx): Paths {
  const p: Paths = { ...EMPTY };
  const { seed } = ctx;
  p.soft = 1.2;
  p.fat = 0.4;
  const metacarpals = [ -3.2, -1.6, 0, 1.6, 3.0 ];
  for (const mx of metacarpals) {
    p.bone += softCapsule(x, y, mx, -2, mx * 0.9, 5.5, 0.35, 0.2) * 4;
    p.cortical += softCapsule(x, y, mx, -2, mx * 0.9, 5.5, 0.2, 0.15) * 1.5;
  }
  for (let f = 0; f < 5; f++) {
    const fx = -3.2 + f * 1.55;
    for (let ph = 0; ph < 3; ph++) {
      const y0 = 5.5 + ph * 2.1;
      p.bone += softCapsule(x, y, fx, y0, fx, y0 + 1.8, 0.28, 0.25) * 3.5;
    }
  }
  for (let c = 0; c < 4; c++) {
    p.bone += softEllipse(x, y, -2.5 + c * 1.6, -4.2, 0.9, 0.8, 0, 0.3) * 4;
  }
  p.bone += softEllipse(x, y, 0, -5.5, 4.5, 1.4, 0, 0.2) * 3;
  p.soft += fbm(x * 2, y * 2, seed) * 0.3;
  return p;
}

export function sampleWristPA(x: number, y: number, ctx: SampleCtx): Paths {
  return sampleHandPA(x, y + 3.2, ctx);
}

export function sampleElbowAP(x: number, y: number, ctx: SampleCtx): Paths {
  const p: Paths = { ...EMPTY };
  p.soft = 2.5;
  p.bone += softCapsule(x, y, 0, -6, 0, 2, 1.3, 0.2) * 6;
  p.cortical += softCapsule(x, y, 0, -6, 0, 2, 0.7, 0.15) * 2;
  p.bone += softEllipse(x, y, -1.8, 0.5, 1.4, 1.1, 0, 0.25) * 5;
  p.bone += softEllipse(x, y, 1.8, 0.5, 1.4, 1.1, 0, 0.25) * 5;
  p.bone += softCapsule(x, y, -0.8, 1.5, -0.8, 7, 0.7, 0.2) * 5;
  p.bone += softCapsule(x, y, 0.9, 1.5, 0.9, 7, 0.65, 0.2) * 5;
  return p;
}

export function sampleShoulderAP(x: number, y: number, ctx: SampleCtx): Paths {
  const p: Paths = { ...EMPTY };
  const { patient } = ctx;
  p.soft = patient.thickness.shoulder * 0.5;
  p.bone += softEllipse(x, y, 0, 0, 3.2, 3.2, 0, 0.2) * 6;
  p.bone += softCapsule(x, y, 0, 2, 0, 10, 1.4, 0.2) * 5;
  p.bone += softCapsule(x, y, -6, -1, 6, -1.5, 0.55, 0.2) * 4;
  p.bone += softEllipse(x, y, -2, -3, 5, 6, 0.3, 0.15) * 3;
  p.cortical += rimEllipse(x, y, 0, 0, 3.2, 3.2, 0.5) * 2;
  return p;
}

export function sampleKneeAP(x: number, y: number, ctx: SampleCtx): Paths {
  const p: Paths = { ...EMPTY };
  p.soft = 3;
  p.bone += softCapsule(x, y, 0, -8, 0, -0.5, 2.2, 0.2) * 6;
  p.bone += softEllipse(x, y, -1.6, 0, 1.8, 1.5, 0, 0.25) * 5;
  p.bone += softEllipse(x, y, 1.6, 0, 1.8, 1.5, 0, 0.25) * 5;
  p.bone += softCapsule(x, y, 0, 1, 0, 9, 2.0, 0.2) * 5.5;
  p.bone += softEllipse(x, y, -2.2, 1.5, 1.1, 1.4, 0, 0.3) * 3;
  p.cortical += softCapsule(x, y, 0, -8, 0, -0.5, 1.0, 0.15) * 2;
  return p;
}

export function sampleKneeLat(x: number, y: number, ctx: SampleCtx): Paths {
  const p: Paths = { ...EMPTY };
  p.soft = 3;
  p.bone += softCapsule(x, y, 1, -8, 1, 0, 2.0, 0.2) * 6;
  p.bone += softEllipse(x, y, 0, 0, 2.4, 2.2, 0, 0.25) * 5;
  p.bone += softCapsule(x, y, 0.5, 1, 0.5, 9, 1.9, 0.2) * 5;
  p.bone += softEllipse(x, y, -2.5, 1, 1.5, 2.2, 0.2, 0.25) * 4;
  return p;
}

export function sampleFootDP(x: number, y: number, ctx: SampleCtx): Paths {
  const p: Paths = { ...EMPTY };
  p.soft = 1.5;
  p.fat = 0.5;
  for (let i = 0; i < 5; i++) {
    const mx = -3 + i * 1.5;
    p.bone += softCapsule(x, y, mx, -2, mx * 0.85, 6, 0.35, 0.2) * 4;
  }
  p.bone += softEllipse(x, y, 0, -5, 5, 2.5, 0, 0.2) * 4;
  p.bone += softEllipse(x, y, 2.5, -7, 2.5, 2, 0.3, 0.25) * 3.5;
  return p;
}

export function sampleAnkleAP(x: number, y: number, ctx: SampleCtx): Paths {
  const p: Paths = { ...EMPTY };
  p.soft = 2;
  p.bone += softCapsule(x, y, -0.8, -8, -0.8, 1, 1.1, 0.2) * 5;
  p.bone += softCapsule(x, y, 1.2, -8, 1.2, 0.5, 0.7, 0.2) * 4;
  p.bone += softEllipse(x, y, 0, 1.5, 2.8, 1.6, 0, 0.25) * 5;
  p.bone += softEllipse(x, y, -2.2, 1.2, 1.0, 1.5, 0, 0.3) * 4;
  p.bone += softEllipse(x, y, 2.0, 1.0, 0.9, 1.3, 0, 0.3) * 4;
  return p;
}

export function sampleAnatomy(x: number, y: number, ctx: SampleCtx): Paths {
  switch (ctx.projection.anatomy) {
    case "torso-ap":
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
    case "shoulder-ap":
      return sampleShoulderAP(x, y, ctx);
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
