export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function hash2(ix: number, iy: number, seed = 1): number {
  let n = (ix * 374761393 + iy * 668265263 + seed * 1274126177) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise(x: number, y: number, seed = 1): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const v00 = hash2(x0, y0, seed);
  const v10 = hash2(x0 + 1, y0, seed);
  const v01 = hash2(x0, y0 + 1, seed);
  const v11 = hash2(x0 + 1, y0 + 1, seed);
  const hx = fx * fx * (3 - 2 * fx);
  const hy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(v00, v10, hx), lerp(v01, v11, hx), hy);
}

export function fbm(x: number, y: number, seed = 1): number {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < 4; i++) {
    s += a * valueNoise(x * f, y * f, seed + i * 17);
    a *= 0.5;
    f *= 2.03;
  }
  return s;
}

/**
 * Approximate the relative ray path through an ellipsoidal structure.
 *
 * The old anatomy primitives returned a broad flat value of 1 across most of
 * every structure. That was convenient for masks, but produced the segmented
 * / CG appearance seen when an individual test area was compared with the
 * atlas whole-body radiograph. A radiograph records integrated path length:
 * rays through the centre of a rounded structure travel farther than tangential
 * rays. The chord term below preserves the existing footprint and peak value
 * while introducing that physically useful depth gradient.
 */
function chordProfile(q: number): number {
  return 0.58 + 0.42 * Math.sqrt(Math.max(0, 1 - q));
}

/** 1 at the deepest centre, 0 outside, with a depth-dependent soft rim. */
export function softEllipse(
  x: number,
  y: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rot = 0,
  edge = 0.18,
): number {
  const dx0 = x - cx;
  const dy0 = y - cy;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const dx = (c * dx0 + s * dy0) / Math.max(0.01, rx);
  const dy = (-s * dx0 + c * dy0) / Math.max(0.01, ry);
  const q = dx * dx + dy * dy;
  if (q >= 1) return 0;

  const inner = (1 - edge) * (1 - edge);
  const depth = chordProfile(q);
  if (q <= inner) return depth;
  return depth * (1 - smoothstep(inner, 1, q));
}

export function softCapsule(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: number,
  edge = 0.25,
): number {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const l2 = vx * vx + vy * vy;
  const t = l2 < 1e-8 ? 0 : clamp(((x - x1) * vx + (y - y1) * vy) / l2, 0, 1);
  const px = x1 + vx * t;
  const py = y1 + vy * t;
  const d = Math.hypot(x - px, y - py);
  if (d >= r) return 0;

  const q = (d / Math.max(0.01, r)) ** 2;
  const inner = (1 - edge) * (1 - edge);
  const radialDepth = chordProfile(q);
  // A small longitudinal depth change prevents long bones and vessels from
  // becoming perfectly uniform translucent columns without changing geometry.
  const axialDepth = l2 < 1e-8 ? 1 : 0.94 + 0.06 * (1 - Math.abs(t * 2 - 1));
  const depth = radialDepth * axialDepth;
  if (q <= inner) return depth;
  return depth * (1 - smoothstep(inner, 1, q));
}

export function rimEllipse(
  x: number,
  y: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  thickness: number,
  rot = 0,
): number {
  const outer = softEllipse(x, y, cx, cy, rx, ry, rot, 0.16);
  const innerRx = Math.max(0.02, rx - thickness);
  const innerRy = Math.max(0.02, ry - thickness);
  const inner = softEllipse(x, y, cx, cy, innerRx, innerRy, rot, 0.20);
  // Retain a little central shell contribution to mimic superimposed cortices,
  // but keep the strongest response at tangential cortical margins.
  return Math.max(0, outer - inner * 0.86);
}
