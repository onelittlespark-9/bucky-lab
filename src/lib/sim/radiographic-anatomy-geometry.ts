import type { Paths, SampleCtx } from "./anatomy";
import { rimEllipse, softCapsule, softEllipse } from "./geometry";

/**
 * Projection-specific radiographic anatomy.  This is deliberately separate from
 * the 3D teaching model: the detector sees superimposed projected anatomy, not
 * a collection of generic 2D blobs.  The layer adds named bones, joint spaces,
 * cortical rims and clinically recognisable landmarks to every projection.
 */
const addBone = (p: Paths, v: number) => { p.bone += v; };
const addCortical = (p: Paths, v: number) => { p.cortical += v; };
const gap = (p: Paths, v: number) => { p.air += v; };

function curvedRib(p: Paths, x: number, y: number, side: number, level: number, scale: number) {
  const yy = 27 + level * 3.05;
  const posterior = side * 2.0;
  const lateral = side * (7.5 + level * 0.42) * scale;
  const anterior = side * (14.0 - Math.max(0, level - 7) * 0.65) * scale;
  addBone(p, softCapsule(x, y, posterior, yy, side * 7.0 * scale, yy + 0.9, 0.43, 0.2) * 2.4);
  addBone(p, softCapsule(x, y, side * 6.7 * scale, yy + 0.9, lateral, yy + 2.15, 0.40, 0.2) * 2.6);
  addBone(p, softCapsule(x, y, lateral, yy + 2.15, anterior, yy + 1.45, 0.36, 0.22) * 2.4);
  addCortical(p, softCapsule(x, y, posterior, yy, anterior, yy + 1.45, 0.12, 0.2) * 0.75);
}

function chest(p: Paths, c: SampleCtx, lateral: boolean) {
  const { patient, pose } = c;
  const tw = patient.morph.torsoWidth;
  if (lateral) {
    for (let i = 0; i < 10; i++) {
      const yy = 27 + i * 3.3;
      addBone(p, softCapsule(0, 0, -7, yy, 7, yy + 1.2, 0.52, 0.2) * 2.8);
      addCortical(p, softCapsule(0, 0, -7, yy, 7, yy + 1.2, 0.14, 0.2) * 0.8);
    }
    addBone(p, softCapsule(0, 0, -1.2, 23, 1.8, 28, 1.05, 0.15) * 4);
    addBone(p, softCapsule(0, 0, -5.5, 25, 5.5, 25.5, 0.55, 0.18) * 3.5);
    addBone(p, softCapsule(0, 0, 0, 17, 0, 56, 0.8, 0.25) * 1.8);
    return;
  }
  for (let i = 0; i < 12; i++) curvedRib(p, 0, 0, -1, i, tw);
  for (let i = 0; i < 12; i++) curvedRib(p, 0, 0, 1, i, tw);
  for (let i = 0; i < 12; i++) {
    const yy = 22 + i * 3.45;
    const body = softEllipse(0, 0, pose.rotationY * 0.035, yy, 1.25, 0.95, 0, 0.16);
    addBone(p, body * 4.5);
    addCortical(p, rimEllipse(0, 0, pose.rotationY * 0.035, yy, 1.22, 0.92, 0.18) * 1.1);
    addBone(p, softEllipse(0, 0, -1.9, yy, 0.65, 0.55, 0, 0.18) * 1.4);
    addBone(p, softEllipse(0, 0, 1.9, yy, 0.65, 0.55, 0, 0.18) * 1.4);
  }
  addBone(p, softCapsule(0, 0, -12 * tw, 26, 12 * tw, 26.7, 0.62, 0.2) * 4.2);
  addCortical(p, softCapsule(0, 0, -12 * tw, 26, 12 * tw, 26.7, 0.15, 0.2) * 1.1);
  for (const side of [-1, 1]) {
    const scap = softEllipse(0, 0, side * 11.5 * tw, 32, 5.1, 8.3, side * 0.28, 0.14);
    addBone(p, scap * 2.5);
    addCortical(p, rimEllipse(0, 0, side * 11.5 * tw, 32, 5.0, 8.2, 0.5, side * 0.28) * 0.8);
  }
  addBone(p, softEllipse(0, 0, 0, 25.5, 1.1, 7.5, 0, 0.14) * 2.4);
}

function lumbar(p: Paths, c: SampleCtx, lateral: boolean) {
  const rot = (c.pose.rotationY * Math.PI) / 180;
  for (let i = 0; i < 5; i++) {
    const yy = 52 + i * 3.65;
    const w = lateral ? 3.1 : 2.6;
    const body = softEllipse(0, 0, 0, yy, w, 1.45, lateral ? 0 : rot * 0.08, 0.12);
    addBone(p, body * 4.8);
    addCortical(p, rimEllipse(0, 0, 0, yy, w - 0.05, 1.4, 0.22) * 1.15);
    const disc = softEllipse(0, 0, 0, yy + 1.85, lateral ? 2.8 : 2.3, 0.32, 0, 0.18);
    gap(p, disc * 1.1);
    p.bone *= 1 - disc * 0.12;
    if (!lateral) {
      addBone(p, softCapsule(0, 0, -3.0, yy, -4.4, yy + 0.6, 0.48, 0.18) * 1.8);
      addBone(p, softCapsule(0, 0, 3.0, yy, 4.4, yy + 0.6, 0.48, 0.18) * 1.8);
      addBone(p, softEllipse(0, 0, -1.9, yy, 0.6, 0.62, 0, 0.16) * 1.8);
      addBone(p, softEllipse(0, 0, 1.9, yy, 0.6, 0.62, 0, 0.16) * 1.8);
    }
  }
  if (!lateral) {
    addBone(p, softEllipse(0, 0, -5.1, 59, 1.5, 10.5, 0, 0.2) * 1.5);
    addBone(p, softEllipse(0, 0, 5.1, 59, 1.5, 10.5, 0, 0.2) * 1.5);
  }
}

function abdomen(p: Paths, c: SampleCtx) {
  const { patient } = c;
  const scale = patient.morph.torsoWidth;
  addBone(p, softEllipse(0, 0, 0, 77, 4.2, 10, 0, 0.14) * 2.8);
  addCortical(p, rimEllipse(0, 0, 0, 77, 4.1, 9.8, 0.5) * 1.3);
  for (const side of [-1, 1]) {
    const psoas = softEllipse(0, 0, side * 4.7 * scale, 62, 2.1, 13, 0, 0.2);
    p.soft += psoas * 1.8;
    const kidney = softEllipse(0, 0, side * 6.4 * scale, 61, 2.8, 5.5, side * 0.12, 0.16);
    p.soft += kidney * 1.6;
    p.fat += kidney * 0.5;
  }
  for (let i = 0; i < 5; i++) {
    const yy = 51 + i * 3.8;
    p.gas += softEllipse(0, 0, -5.5 + i * 0.8, yy + 1.1, 1.7, 1.0, 0.1, 0.2) * 1.2;
    p.gas += softEllipse(0, 0, 5.8 - i * 0.65, yy + 2.0, 1.5, 0.9, -0.1, 0.2) * 1.0;
  }
}

function pelvis(p: Paths, c: SampleCtx, hipOnly: boolean) {
  const h = c.patient.morph.hip;
  const side = c.projection.laterality === "right" ? -1 : 1;
  if (!hipOnly) {
    for (const s of [-1, 1]) {
      const wingX = s * 8.5 * h;
      addBone(p, softEllipse(0, 0, wingX, 70.5, 8.8 * h, 8.5, s * 0.1, 0.1) * 1.8);
      addCortical(p, rimEllipse(0, 0, wingX, 70.5, 8.6 * h, 8.3, 0.55, s * 0.1) * 1.4);
      const si = softEllipse(0, 0, s * 2.9, 73.5, 0.5, 4.0, 0, 0.18);
      gap(p, si * 2.2);
      const acet = softEllipse(0, 0, s * 6.2 * h, 79.2, 4.5 * h, 4.4, 0, 0.12);
      addCortical(p, rimEllipse(0, 0, s * 6.2 * h, 79.2, 4.45 * h, 4.35, 0.72) * 2.0);
      gap(p, softEllipse(0, 0, s * 6.2 * h, 80.1, 2.7 * h, 2.55, 0, 0.12) * 1.8);
      addBone(p, softCapsule(0, 0, s * 1.4, 84.3, s * 6.4, 82.9, 1.0, 0.14) * 2.5);
      addBone(p, softCapsule(0, 0, s * 1.5, 86.5, s * 6.6, 89.0, 0.9, 0.14) * 2.2);
    }
    addBone(p, softEllipse(0, 0, 0, 77.4, 4.2, 9.2, 0, 0.12) * 2.5);
    gap(p, softEllipse(0, 0, 0, 84.7, 0.55, 4.8, 0, 0.18) * 2.0);
  }
  const hx = side * 6.3 * h;
  const head = softEllipse(0, 0, hx, 79.7, 3.1 * h, 3.0, 0, 0.1);
  addBone(p, head * 2.5); addCortical(p, rimEllipse(0, 0, hx, 79.7, 3.0 * h, 2.92, 0.58) * 1.5);
  const neck = softCapsule(0, 0, hx, 80, hx + side * 4.9 * h, 83.3, 1.2, 0.12);
  addBone(p, neck * 2.4); addCortical(p, neck * 0.65);
  const gt = softEllipse(0, 0, hx + side * 3.2 * h, 85.2, 2.5 * h, 2.7, 0, 0.12);
  addBone(p, gt * 2.3); addCortical(p, rimEllipse(0, 0, hx + side * 3.2 * h, 85.2, 2.42 * h, 2.62, 0.55) * 1.1);
}

function cspine(p: Paths) {
  for (let i = 0; i < 7; i++) {
    const yy = 14 + i * 2.2;
    addBone(p, softEllipse(0, 0, 0, yy, 1.2, 0.82, 0, 0.12) * 3.8);
    addCortical(p, rimEllipse(0, 0, 0, yy, 1.15, 0.78, 0.25) * 0.9);
    gap(p, softEllipse(0, 0, 0, yy + 1.08, 1.0, 0.2, 0, 0.15) * 1.2);
    addBone(p, softCapsule(0, 0, -1.9, yy, -2.8, yy + 0.4, 0.45, 0.18) * 1.2);
    addBone(p, softCapsule(0, 0, 1.9, yy, 2.8, yy + 0.4, 0.45, 0.18) * 1.2);
  }
  p.air += softCapsule(0, 0, 2.4, 13, 2.4, 28, 0.7, 0.2) * 3;
}

function shoulder(p: Paths) {
  addBone(p, softEllipse(0, 0, 0, 0.5, 3.4, 3.4, 0, 0.12) * 3.8);
  addCortical(p, rimEllipse(0, 0, 0, 0.5, 3.3, 3.3, 0.6) * 1.2);
  addBone(p, softCapsule(0, 0, 0, 2.5, 0, 10.5, 1.2, 0.14) * 3.2);
  addBone(p, softCapsule(0, 0, -6.5, -1.2, 6.5, -1.2, 0.5, 0.16) * 2.8);
  addBone(p, softEllipse(0, 0, -4.0, 3.2, 2.0, 5.2, -0.25, 0.14) * 1.5);
  gap(p, softEllipse(0, 0, 0, 0.5, 2.2, 2.1, 0, 0.16) * 0.7);
}

function elbow(p: Paths) {
  addBone(p, softEllipse(0, 0, -1.7, -1.2, 1.8, 2.3, 0, 0.12) * 2.8);
  addBone(p, softEllipse(0, 0, 1.7, -1.2, 1.8, 2.3, 0, 0.12) * 2.8);
  addCortical(p, rimEllipse(0, 0, -1.7, -1.2, 1.75, 2.2, 0.45) * 0.9);
  addCortical(p, rimEllipse(0, 0, 1.7, -1.2, 1.75, 2.2, 0.45) * 0.9);
  gap(p, softEllipse(0, 0, 0, 0.6, 2.8, 0.42, 0, 0.18) * 1.4);
}

function hand(p: Paths) {
  for (let i = 0; i < 8; i++) {
    const cx = -3.2 + (i % 4) * 2.1;
    const cy = -4.8 + Math.floor(i / 4) * 1.7;
    addBone(p, softEllipse(0, 0, cx, cy, 0.72, 0.65, 0, 0.15) * 2.8);
  }
  for (let i = 0; i < 5; i++) {
    const x0 = -3.4 + i * 1.7;
    addBone(p, softCapsule(0, 0, x0, -3.2, x0 + (i - 2) * 0.12, 4.8, 0.45, 0.14) * 2.8);
    addCortical(p, softCapsule(0, 0, x0, -3.2, x0 + (i - 2) * 0.12, 4.8, 0.12, 0.16) * 0.8);
    const ph = i === 0 ? 2 : 3;
    for (let j = 0; j < ph; j++) {
      const yy = 5.2 + j * 2.0;
      addBone(p, softCapsule(0, 0, x0 + (i - 2) * 0.12, yy, x0 + (i - 2) * 0.12, yy + 1.45, 0.31, 0.13) * 2.0);
      gap(p, softEllipse(0, 0, x0, yy - 0.1, 0.28, 0.16, 0, 0.18) * 0.25);
    }
  }
}

function wrist(p: Paths) {
  for (let r = 0; r < 2; r++) for (let col = 0; col < 4; col++) {
    const cx = -2.5 + col * 1.65 + (r ? 0.2 : 0);
    const cy = -1.3 + r * 1.5;
    addBone(p, softEllipse(0, 0, cx, cy, 0.72, 0.66, 0, 0.14) * 2.8);
  }
  addBone(p, softEllipse(0, 0, -2.2, -5.2, 1.35, 3.0, 0, 0.14) * 2.4);
  addBone(p, softEllipse(0, 0, 2.0, -5.0, 1.15, 3.2, 0, 0.14) * 2.2);
  gap(p, softEllipse(0, 0, 0, 0.1, 2.7, 0.3, 0, 0.18) * 1.0);
}

function knee(p: Paths, lateral: boolean) {
  if (lateral) {
    addBone(p, softEllipse(0, 0, 0, -1.2, 4.0, 2.5, 0, 0.12) * 3.5);
    addBone(p, softEllipse(0, 0, 0, 2.0, 3.5, 2.5, 0, 0.12) * 3.2);
    addBone(p, softEllipse(0, 0, 0, 0.2, 2.2, 2.3, 0, 0.12) * 1.8);
  } else {
    addBone(p, softEllipse(0, 0, -1.7, -1.0, 2.2, 2.2, 0, 0.12) * 3.5);
    addBone(p, softEllipse(0, 0, 1.7, -1.0, 2.2, 2.2, 0, 0.12) * 3.5);
    addBone(p, softEllipse(0, 0, 0, 2.0, 2.8, 1.9, 0, 0.12) * 3.2);
    addBone(p, softEllipse(0, 0, -4.2, 2.4, 1.25, 1.45, 0, 0.12) * 1.8);
  }
  gap(p, softEllipse(0, 0, 0, 0.6, lateral ? 2.5 : 3.1, 0.42, 0, 0.18) * 1.5);
  addBone(p, softEllipse(0, 0, 0, -0.4, 1.15, 1.4, 0, 0.14) * 2.0);
}

function foot(p: Paths) {
  const tarsals: Array<[number, number, number, number]> = [
    [0, -4.4, 2.1, 2.0], [-2.6, -3.9, 1.2, 1.6], [2.5, -3.8, 1.25, 1.6], [-1.0, -2.1, 1.2, 1.2], [1.0, -2.1, 1.2, 1.2],
  ];
  for (const [x, y, rx, ry] of tarsals) addBone(p, softEllipse(0, 0, x, y, rx, ry, 0, 0.14) * 2.4);
  for (let i = 0; i < 5; i++) {
    const x0 = -3.2 + i * 1.6;
    addBone(p, softCapsule(0, 0, x0, -1.8, x0 + (i - 2) * 0.16, 4.6, 0.42, 0.14) * 2.6);
    for (let j = 0; j < 2; j++) addBone(p, softCapsule(0, 0, x0 + (i - 2) * 0.16, 5.1 + j * 1.65, x0 + (i - 2) * 0.2, 6.35 + j * 1.65, 0.27, 0.13) * 2.0);
  }
  gap(p, softEllipse(0, 0, 0, -0.1, 3.8, 0.32, 0, 0.18) * 0.7);
}

function ankle(p: Paths) {
  addBone(p, softEllipse(0, 0, -1.8, -1.8, 1.1, 2.4, 0, 0.12) * 2.6);
  addBone(p, softEllipse(0, 0, 1.8, -1.8, 1.1, 2.4, 0, 0.12) * 2.6);
  addBone(p, softEllipse(0, 0, 0, 1.0, 2.7, 1.5, 0, 0.12) * 3.0);
  addCortical(p, rimEllipse(0, 0, 0, 1.0, 2.65, 1.45, 0.45) * 1.1);
  gap(p, softEllipse(0, 0, 0, 0.2, 2.0, 0.42, 0, 0.18) * 1.3);
}

function skull(p: Paths) {
  addBone(p, softEllipse(0, 0, 0, -1.0, 11.6, 10.6, 0, 0.08) * 2.0);
  addCortical(p, rimEllipse(0, 0, 0, -1.0, 11.5, 10.5, 0.75) * 2.0);
  addBone(p, softEllipse(0, 0, 3.0, 3.5, 4.3, 3.0, 0.2, 0.12) * 1.7);
  addBone(p, softCapsule(0, 0, 1.8, 7.0, 7.0, 7.0, 1.0, 0.15) * 1.8);
  addBone(p, softEllipse(0, 0, 3.0, 0.7, 1.3, 1.0, 0, 0.12) * 1.5);
  gap(p, softEllipse(0, 0, 3.0, 0.8, 0.7, 0.45, 0, 0.18) * 1.2);
}

export function augmentRadiographicAnatomy(paths: Paths, ctx: SampleCtx) {
  switch (ctx.projection.id) {
    case "pa-chest": chest(paths, ctx, false); break;
    case "lat-chest": chest(paths, ctx, true); break;
    case "ap-abdomen": abdomen(paths, ctx); lumbar(paths, ctx, false); break;
    case "ap-pelvis": pelvis(paths, ctx, false); break;
    case "ap-hip": pelvis(paths, ctx, true); break;
    case "lat-cspine": cspine(paths); break;
    case "ap-cspine": cspine(paths); break;
    case "ap-lumbar": lumbar(paths, ctx, false); break;
    case "lat-lumbar": lumbar(paths, ctx, true); break;
    case "pa-hand": hand(paths); break;
    case "pa-wrist": wrist(paths); break;
    case "ap-elbow": elbow(paths); break;
    case "ap-shoulder": shoulder(paths); break;
    case "ap-knee": knee(paths, false); break;
    case "lat-knee": knee(paths, true); break;
    case "dp-foot": foot(paths); break;
    case "ap-ankle": ankle(paths); break;
    case "lat-skull": skull(paths); break;
  }
}
