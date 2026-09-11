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

/** 1 inside, 0 outside, soft rim. */
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
  const d = dx * dx + dy * dy;
  if (d >= 1) return 0;
  const inner = (1 - edge) * (1 - edge);
  if (d <= inner) return 1;
  return 1 - smoothstep(inner, 1, d);
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
  const inner = r * (1 - edge);
  if (d <= inner) return 1;
  return 1 - smoothstep(inner, r, d);
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
  const outer = softEllipse(x, y, cx, cy, rx, ry, rot, 0.2);
  const inner = softEllipse(x, y, cx, cy, rx - thickness, ry - thickness, rot, 0.25);
  return Math.max(0, outer - inner * 0.92);
}
