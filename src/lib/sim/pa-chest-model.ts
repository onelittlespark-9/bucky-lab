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

function lungField(x: number, y: number, side: -1 | 1, scale: number, base: number): number {
  const yy = y / scale;
  const t = clamp01((yy - 18.7) / (base / scale - 18.7));
  const apexGate = smooth01((yy - 18.7) / 1.0);
  const inferiorGate = 1 - smooth01((yy - base / scale + 0.05) / 0.38);
  const centre = side * (2.15 + 1.75 * t) * scale;
  const width = (0.65 + 8.55 * Math.pow(Math.sin(Math.PI * Math.min(0.999, t)), 0.4) - 0.45 * t) * scale;
  const q = Math.abs(x - centre) / Math.max(0.25, width);
  if (q >= 1.02) return 0;
  return apexGate * inferiorGate * Math.exp(-Math.pow(q / 0.94, 8)) * smooth01((1.02 - q) / 0.035);
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
  paths.soft += softCapsule(
    x,
    y,
    side * a[0] * scale,
    a[1] * scale,
    side * b[0] * scale,
    b[1] * scale,
    radius * scale,
    0.42,
  ) * weight;
}

type VesselPath = {
  points: Array<[number, number]>;
  radius: number;
  weight: number;
};

function addVascularTree(paths: Paths, x: number, y: number, scale: number, side: -1 | 1): void {
  const hilum: [number, number] = [2.55, 34.0];
  const tree: VesselPath[] = [
    {
      points: [hilum, [3.6, 32.8], [4.9, 31.5], [6.3, 30.4], [7.7, 29.7]],
      radius: 0.16,
      weight: 0.095,
    },
    {
      points: [hilum, [3.7, 34.7], [5.0, 35.5], [6.4, 36.6], [7.8, 38.0]],
      radius: 0.17,
      weight: 0.105,
    },
    {
      points: [hilum, [3.5, 35.2], [4.5, 37.2], [5.4, 39.5], [6.3, 42.0], [7.0, 44.0]],
      radius: 0.18,
      weight: 0.11,
    },
    {
      points: [[4.5, 37.2], [4.6, 39.7], [4.5, 42.1]],
      radius: 0.085,
      weight: 0.045,
    },
    {
      points: [[5.4, 39.5], [6.7, 40.1], [8.0, 40.2]],
      radius: 0.075,
      weight: 0.04,
    },
    {
      points: [[4.9, 31.5], [6.0, 30.0], [7.2, 29.0]],
      radius: 0.07,
      weight: 0.036,
    },
  ];

  for (const vessel of tree) {
    for (let i = 0; i < vessel.points.length - 1; i++) {
      const t = i / Math.max(1, vessel.points.length - 1);
      addSegment(
        paths,
        x,
        y,
        scale,
        side,
        vessel.points[i]!,
        vessel.points[i + 1]!,
        vessel.radius * (1 - 0.7 * t),
        vessel.weight * (1 - 0.7 * t),
      );
    }
  }
}

function addFallbackSkeleton(paths: Paths, x: number, y: number, scale: number): void {
  for (let i = 0; i < 10; i++) {
    const yy = (23.0 + i * 2.35) * scale;
    for (const side of [-1, 1] as const) {
      paths.bone += softCapsule(
        x,
        y,
        side * 1.4 * scale,
        yy,
        side * 6.0 * scale,
        yy + 0.45 * scale,
        0.09 * scale,
        0.28,
      ) * 0.014;
      paths.bone += softCapsule(
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

  const upper = softEllipse(x, y, 0, 27.2 * scale, 13.9 * widthMorph * scale, 7.7 * scale, 0, 0.018);
  const middle = softEllipse(x, y, 0, 36.2 * scale, 14.7 * widthMorph * scale, 10.5 * scale, 0, 0.018);
  const lower = softEllipse(x, y, 0, 43.5 * scale, 13.4 * widthMorph * scale, 5.4 * scale, 0, 0.018);
  const shoulders = Math.max(
    gauss(x, y, -11.3 * widthMorph * scale, 22.8 * scale, 3.8 * scale, 1.8 * scale) * 0.08,
    gauss(x, y, 11.3 * widthMorph * scale, 22.8 * scale, 3.8 * scale, 1.8 * scale) * 0.08,
  );
  const wall = Math.max(upper * 0.48, middle * 0.54, lower * 0.24, shoulders);
  if (wall < 0.001) {
    paths.air = 40;
    return paths;
  }
  paths.soft = wall * 0.64;
  paths.fat = wall * (patient.habitus === "hypersthenic" ? 0.15 : 0.065);

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
  const heartMask = clamp01(Math.max(
    rightAtrium * 0.58,
    rightVentricle * 0.48,
    leftVentricle,
    leftAtrium * 0.38,
    pulmonaryArtery * 0.27,
  ));

  leftLung *= Math.max(0.02, 1 - heartMask * 0.992);
  rightLung *= Math.max(0.86, 1 - heartMask * 0.018);
  const lungMask = Math.max(rightLung, leftLung);
  paths.soft *= Math.max(0.012, 1 - lungMask * 0.988);
  paths.fat *= Math.max(0.04, 1 - lungMask * 0.96);
  paths.lung += (rightLung + leftLung) * (1.38 + chestDepth * 0.025);
  paths.soft +=
    svc * 0.23 +
    rightAtrium * 0.62 +
    rightVentricle * 0.48 +
    leftVentricle * 1.28 +
    leftAtrium * 0.43 +
    pulmonaryArtery * 0.31 +
    aorticKnuckle * 0.27;

  paths.air += softCapsule(x, y, 0, 18.6 * scale, 0, 29.0 * scale, 0.25 * scale, 0.20) * 3.6;
  paths.air += softCapsule(x, y, 0, 28.8 * scale, -2.2 * scale, 32.0 * scale, 0.13 * scale, 0.22) * 1.45;
  paths.air += softCapsule(x, y, 0, 28.8 * scale, 2.0 * scale, 31.8 * scale, 0.13 * scale, 0.22) * 1.45;

  // Soft asymmetric hila and rapidly tapering pulmonary vascular markings.
  paths.soft += gauss(x, y, -2.55 * scale, 34.5 * scale, 0.9 * scale, 1.35 * scale) * 0.25;
  paths.soft += gauss(x, y, 2.55 * scale, 33.9 * scale, 0.92 * scale, 1.28 * scale) * 0.27;
  addVascularTree(paths, x, y, scale, -1);
  addVascularTree(paths, x, y, scale, 1);

  // Broad low-amplitude pleural interfaces rather than bright drawn arcs.
  const rightCurve = rightDiaphragm + 0.014 * ((x + 4.0 * scale) ** 2) / scale;
  const leftCurve = leftDiaphragm + 0.017 * ((x - 3.8 * scale) ** 2) / scale;
  const rightGate = smooth01((x / scale + 12.7) / 0.55) * (1 - smooth01((x / scale + 0.1) / 1.0));
  const leftGate = smooth01((x / scale - 0.1) / 1.0) * (1 - smooth01((x / scale - 12.7) / 0.55));
  const rightNorm = (y - rightCurve) / (0.34 * scale);
  const leftNorm = (y - leftCurve) / (0.36 * scale);
  paths.soft += Math.exp(-(rightNorm * rightNorm)) * 0.24 * rightGate;
  paths.soft += Math.exp(-(leftNorm * leftNorm)) * 0.21 * leftGate;

  paths.soft += gauss(x, y, -5.2 * scale, rightDiaphragm + 2.1 * scale, 5.7 * scale, 1.8 * scale) * 0.31;
  paths.gas += gauss(x, y, 5.1 * scale, leftDiaphragm + 1.9 * scale, 2.15 * scale, 0.78 * scale) * 2.6;

  const coarse = fbm(x * 0.24, y * 0.24, seed + 19) - 0.5;
  const fine = fbm(x * 1.15, y * 1.15, seed + 29) - 0.5;
  const vertical = fbm(x * 0.62, y * 1.85, seed + 41) - 0.5;
  const central = Math.exp(-Math.abs(x) / (10 * scale));
  paths.soft += lungMask * Math.max(0, coarse * 0.07 + fine * 0.035 + vertical * 0.022) * (0.28 + 0.22 * central);

  addFallbackSkeleton(paths, x, y, scale);
  return paths;
}
