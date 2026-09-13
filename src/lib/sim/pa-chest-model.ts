import type { Patient, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule, softEllipse } from "./geometry";

const emptyPaths = (): Paths => ({
  air: 0,
  lung: 0,
  fat: 0,
  soft: 0,
  bone: 0,
  cortical: 0,
  gas: 0,
  metal: 0,
});

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth01 = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const gauss = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  k = 1.55,
) => Math.exp(-(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2) * k);

function lungField(
  x: number,
  y: number,
  side: -1 | 1,
  scale: number,
  base: number,
): number {
  const yy = y / scale;
  const t = clamp01((yy - 18.7) / (base / scale - 18.7));
  const apexGate = smooth01((yy - 18.7) / 1.0);
  const inferiorGate = 1 - smooth01((yy - base / scale + 0.05) / 0.38);
  const centre = side * (2.15 + 1.75 * t) * scale;
  const width =
    (0.65 +
      8.55 * Math.pow(Math.sin(Math.PI * Math.min(0.999, t)), 0.4) -
      0.45 * t) *
    scale;
  const q = Math.abs(x - centre) / Math.max(0.25, width);
  if (q >= 1.02) return 0;
  return (
    apexGate *
    inferiorGate *
    Math.exp(-Math.pow(q / 0.94, 8)) *
    smooth01((1.02 - q) / 0.035)
  );
}

function addSegment(
  paths: Paths,
  x: number,
  y: number,
  scale: number,
  side: -1 | 1,
  a: [number, number],
  b: [number, number],
  radius: number,
  weight: number,
): void {
  paths.soft +=
    softCapsule(
      x,
      y,
      side * a[0] * scale,
      a[1] * scale,
      side * b[0] * scale,
      b[1] * scale,
      radius * scale,
      0.24,
    ) * weight;
}

type VesselPath = [Array<[number, number]>, number, number];

function addVascularTree(
  paths: Paths,
  x: number,
  y: number,
  scale: number,
  side: -1 | 1,
): void {
  const hilum: [number, number] = [2.55, 34.0];
  const trees: VesselPath[] = [
    [[hilum, [3.7, 32.6], [5.0, 31.1], [6.5, 29.9], [8.0, 29.1], [9.4, 28.7]], 0.19, 0.34],
    [[hilum, [3.8, 34.6], [5.2, 35.1], [6.8, 36.0], [8.3, 37.2], [9.5, 38.4]], 0.21, 0.38],
    [[hilum, [3.6, 35.2], [4.7, 37.0], [5.7, 39.2], [6.7, 41.5], [7.7, 43.6], [8.5, 45.2]], 0.22, 0.40],
    [[[4.7, 37.0], [4.8, 39.6], [4.8, 42.0], [4.7, 44.4]], 0.11, 0.18],
    [[[5.7, 39.2], [6.8, 39.9], [8.0, 40.2], [9.2, 40.0]], 0.10, 0.17],
    [[[6.7, 41.5], [7.8, 42.3], [8.8, 43.0]], 0.08, 0.13],
    [[[5.2, 35.1], [6.2, 34.0], [7.4, 33.4], [8.6, 33.2]], 0.10, 0.16],
    [[[5.0, 31.1], [6.0, 29.8], [7.2, 28.9]], 0.09, 0.14],
  ];

  for (const [points, baseRadius, baseWeight] of trees) {
    for (let i = 0; i < points.length - 1; i++) {
      const t = i / Math.max(1, points.length - 1);
      addSegment(
        paths,
        x,
        y,
        scale,
        side,
        points[i]!,
        points[i + 1]!,
        baseRadius * (1 - 0.65 * t),
        baseWeight * (1 - 0.55 * t),
      );
    }
  }
}

function addFallbackSkeleton(paths: Paths, x: number, y: number, scale: number): void {
  for (let i = 0; i < 10; i++) {
    const yy = (23.0 + i * 2.35) * scale;
    for (const side of [-1, 1] as const) {
      paths.bone +=
        softCapsule(
          x,
          y,
          side * 1.4 * scale,
          yy,
          side * 6.0 * scale,
          yy + 0.45 * scale,
          0.09 * scale,
          0.28,
        ) * 0.014;
      paths.bone +=
        softCapsule(
          x,
          y,
          side * 6.0 * scale,
          yy + 0.45 * scale,
          side * 11.6 * scale,
          yy + 1.05 * scale,
          0.09 * scale,
          0.28,
        ) * 0.012;
    }
  }
}

export function samplePaChest(
  x: number,
  y: number,
  patient: Patient,
  pose: SimPose,
  seed: number,
): Paths {
  const paths = emptyPaths();
  const scale = patient.heightCm / 170;
  const widthMorph = patient.morph.torsoWidth;
  const chestDepth = patient.thickness.chest;
  const inspiration = pose.breath === "inspiration" ? 1 : 0;

  // Keep the chest wall subordinate to internal anatomy so it does not read as one large oval.
  const upper = softEllipse(x, y, 0, 27.2 * scale, 13.9 * widthMorph * scale, 7.7 * scale, 0, 0.018);
  const middle = softEllipse(x, y, 0, 36.2 * scale, 14.7 * widthMorph * scale, 10.5 * scale, 0, 0.018);
  const lower = softEllipse(x, y, 0, 43.5 * scale, 13.4 * widthMorph * scale, 5.4 * scale, 0, 0.018);
  const shoulders = Math.max(
    gauss(x, y, -11.3 * widthMorph * scale, 22.8 * scale, 3.8 * scale, 1.8 * scale) * 0.10,
    gauss(x, y, 11.3 * widthMorph * scale, 22.8 * scale, 3.8 * scale, 1.8 * scale) * 0.10,
  );
  const wall = Math.max(upper * 0.56, middle * 0.62, lower * 0.30, shoulders);
  if (wall < 0.001) {
    paths.air = 40;
    return paths;
  }
  paths.soft = wall * 0.72;
  paths.fat = wall * (patient.habitus === "hypersthenic" ? 0.18 : 0.08);

  const base = (48.0 - inspiration * 3.0) * scale;
  const rightDiaphragm = base - 1.05 * scale;
  const leftDiaphragm = base + 0.35 * scale;
  let rightLung = lungField(x, y, -1, scale, rightDiaphragm);
  let leftLung = lungField(x, y, 1, scale, leftDiaphragm);

  const svc = gauss(x, y, -0.35 * scale, 31.3 * scale, 0.72 * scale, 3.4 * scale);
  const rightAtrium = gauss(x, y, -1.15 * scale, 39.3 * scale, 1.65 * scale, 4.25 * scale);
  const rightVentricle = gauss(x, y, 0.55 * scale, 40.0 * scale, 2.0 * scale, 3.9 * scale);
  const leftVentricle = gauss(x, y, 3.65 * scale, 41.2 * scale, 3.0 * scale, 5.15 * scale);
  const leftAtrium = gauss(x, y, 1.65 * scale, 35.7 * scale, 1.45 * scale, 1.8 * scale);
  const pulmonaryArtery = gauss(x, y, 1.15 * scale, 33.3 * scale, 0.85 * scale, 1.25 * scale);
  const aorticKnuckle = gauss(x, y, 1.55 * scale, 28.8 * scale, 0.65 * scale, 0.78 * scale);
  const heartMask = clamp01(
    Math.max(
      rightAtrium * 0.58,
      rightVentricle * 0.48,
      leftVentricle,
      leftAtrium * 0.38,
      pulmonaryArtery * 0.27,
    ),
  );
  leftLung *= Math.max(0.02, 1 - heartMask * 0.992);
  rightLung *= Math.max(0.86, 1 - heartMask * 0.018);
  const lungMask = Math.max(rightLung, leftLung);
  paths.soft *= Math.max(0.012, 1 - lungMask * 0.988);
  paths.fat *= Math.max(0.04, 1 - lungMask * 0.96);
  paths.lung += (rightLung + leftLung) * (1.30 + chestDepth * 0.024);
  paths.soft +=
    svc * 0.25 +
    rightAtrium * 0.65 +
    rightVentricle * 0.50 +
    leftVentricle * 1.36 +
    leftAtrium * 0.48 +
    pulmonaryArtery * 0.36 +
    aorticKnuckle * 0.31;

  paths.air += softCapsule(x, y, 0, 18.6 * scale, 0, 29.0 * scale, 0.25 * scale, 0.20) * 3.6;
  paths.air += softCapsule(x, y, 0, 28.8 * scale, -2.2 * scale, 32.0 * scale, 0.13 * scale, 0.22) * 1.45;
  paths.air += softCapsule(x, y, 0, 28.8 * scale, 2.0 * scale, 31.8 * scale, 0.13 * scale, 0.22) * 1.45;

  // Asymmetric normal hilar densities and multi-generation vascular trees.
  paths.soft += gauss(x, y, -2.55 * scale, 34.5 * scale, 0.72 * scale, 1.18 * scale) * 0.48;
  paths.soft += gauss(x, y, 2.55 * scale, 33.9 * scale, 0.75 * scale, 1.10 * scale) * 0.52;
  addVascularTree(paths, x, y, scale, -1);
  addVascularTree(paths, x, y, scale, 1);

  // Thin, strongly defined domes with rapid lateral descent into acute costophrenic angles.
  const rightCurve = rightDiaphragm + 0.014 * ((x + 4.0 * scale) ** 2) / scale;
  const leftCurve = leftDiaphragm + 0.017 * ((x - 3.8 * scale) ** 2) / scale;
  const rightGate = smooth01((x / scale + 12.7) / 0.22) * (1 - smooth01((x / scale + 0.15) / 0.58));
  const leftGate = smooth01((x / scale - 0.15) / 0.58) * (1 - smooth01((x / scale - 12.7) / 0.22));
  const rightNorm = (y - rightCurve) / (0.115 * scale);
  const leftNorm = (y - leftCurve) / (0.125 * scale);
  paths.soft += Math.exp(-(rightNorm * rightNorm)) * 1.10 * rightGate;
  paths.soft += Math.exp(-(leftNorm * leftNorm)) * 0.96 * leftGate;

  paths.soft += gauss(x, y, -5.2 * scale, rightDiaphragm + 2.0 * scale, 5.4 * scale, 1.55 * scale) * 0.34;
  paths.gas += gauss(x, y, 5.1 * scale, leftDiaphragm + 1.8 * scale, 2.1 * scale, 0.72 * scale) * 2.8;

  const coarse = fbm(x * 0.24, y * 0.24, seed + 19) - 0.5;
  const fine = fbm(x * 1.15, y * 1.15, seed + 29) - 0.5;
  const vertical = fbm(x * 0.62, y * 1.85, seed + 41) - 0.5;
  paths.soft += lungMask * Math.max(0, coarse * 0.055 + fine * 0.024 + vertical * 0.018) * 0.22;

  addFallbackSkeleton(paths, x, y, scale);
  return paths;
}
