import type { Patient, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule, softEllipse } from "./geometry";
import { SHARED_ORGANS, scaleAnatomyCm } from "./anatomy-structures";

export function addSharedOrganPaths(
  paths: Paths,
  x: number,
  y: number,
  patient: Patient,
  pose: SimPose,
  includeSyntheticBone = false,
) {
  const scale = patient.heightCm / 170;
  const rotation = (pose.rotationY * Math.PI) / 180;
  const lateral = Math.abs(pose.rotationY) >= 45;
  const chestView = pose.breath === "inspiration";
  const xr = lateral ? x : x * Math.cos(rotation) - y * 0.002 * Math.sin(rotation);
  const seed = patient.id.split("").reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
  const smooth01 = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };

  for (const organ of SHARED_ORGANS) {
    if (chestView && organ.id !== "lung-right" && organ.id !== "lung-left" && organ.id !== "heart") continue;

    const ox = lateral ? 0 : scaleAnatomyCm(organ.xCm, patient.heightCm);
    const oy = scaleAnatomyCm(organ.yCm, patient.heightCm);
    const owBase = scaleAnatomyCm(organ.widthCm, patient.heightCm);
    const ow = lateral
      ? organ.density === "lung" ? Math.min(11.5 * scale, owBase * 0.88) : Math.min(8.5 * scale, owBase * 0.82)
      : owBase;
    const oh = scaleAnatomyCm(organ.heightCm, patient.heightCm);
    const shape = softEllipse(xr, y, ox, oy, ow, oh, lateral ? 0 : organ.id === "heart" ? 0.35 : 0, 0.12);
    if (shape < 0.03) continue;

    if (organ.density === "lung") {
      const base = scaleAnatomyCm(49, patient.heightCm) + (pose.breath === "inspiration" ? -3.0 : 1.0);
      const diaphragm = lateral ? base : organ.id === "lung-right" ? base - 0.9 * scale : base + 0.35 * scale;
      const fade = smooth01((diaphragm + 1.4 * scale - y) / (2.8 * scale));
      if (fade > 0) {
        const texture = 0.94 + (fbm(x * 0.7, y * 0.7, seed + 31) - 0.5) * 0.10;
        paths.lung += shape * fade * patient.thickness.chest * (lateral ? 0.44 : 0.32) * texture;
        paths.soft *= Math.max(0.24, 1 - shape * fade * 0.46);
      }
    } else if (organ.id === "heart") {
      const heartWeight = lateral ? 2.45 : 2.15;
      paths.soft += shape * heartWeight;
      paths.lung *= Math.max(0.24, 1 - shape * 0.66);
    } else if (organ.id === "liver") {
      // Focused abdomen/lumbar/pelvis views now inherit the same broad organ
      // superimposition principle as the whole-body renderer instead of a
      // homogeneous abdominal soft-tissue block.
      paths.soft += shape * organ.depthCm * scale * (lateral ? 0.105 : 0.082);
    } else if (organ.id === "stomach") {
      paths.soft += shape * organ.depthCm * scale * (lateral ? 0.050 : 0.038);
      const gas = softEllipse(
        xr,
        y,
        ox + (lateral ? -0.35 : -0.55) * scale,
        oy - 0.35 * scale,
        Math.max(0.45, ow * 0.40),
        Math.max(0.35, oh * 0.27),
        0.08,
        0.20,
      );
      paths.gas += gas * (lateral ? 1.10 : 0.82);
    } else if (organ.id === "kidney-right" || organ.id === "kidney-left") {
      paths.soft += shape * organ.depthCm * scale * (lateral ? 0.070 : 0.055);
    }
  }

  if (includeSyntheticBone) {
    for (let i = 0; i < 17; i++) {
      const level = 22 + i * 3.7;
      const vy = scaleAnatomyCm(level, patient.heightCm);
      const body = softEllipse(x, y, 0, vy, scale * 1.15, scale * 1.05, 0, 0.18);
      paths.bone += body * 3.4;
      paths.cortical += body * 0.34;
      const pedicle = softEllipse(x, y, -1.65 * scale, vy + 0.05, scale * 0.28, scale * 0.34, 0, 0.2);
      paths.bone += pedicle * 1.15;
    }
    for (let i = 0; i < 12; i++) {
      const ry = scaleAnatomyCm(27 + i * 2.55, patient.heightCm);
      const length = (13.2 - i * 0.42) * patient.morph.torsoWidth;
      const rise = scale * (1.15 + i * 0.045);
      for (const side of [-1, 1] as const) {
        const posteriorX = side * 2.35 * scale;
        const lateralX = side * length;
        const anteriorX = side * (length * 0.70);
        const posteriorY = ry - rise * 0.15;
        const lateralY = ry + rise;
        const anteriorY = ry + rise * 0.58;
        const rib =
          softCapsule(x, y, posteriorX, posteriorY, side * (length * 0.42), ry + rise * 0.68, 0.19, 0.30) * 0.50 +
          softCapsule(x, y, side * (length * 0.42), ry + rise * 0.68, lateralX, lateralY, 0.17, 0.31) * 0.46 +
          softCapsule(x, y, lateralX, lateralY, side * (length * 0.88), ry + rise * 0.80, 0.15, 0.32) * 0.34 +
          softCapsule(x, y, side * (length * 0.88), ry + rise * 0.80, anteriorX, anteriorY, 0.13, 0.34) * 0.24;
        paths.cortical += rib;
        paths.bone += rib * 0.28;
      }
    }
  }

  if (lateral) {
    paths.air += softCapsule(xr, y, -1.2 * scale, scaleAnatomyCm(18, patient.heightCm), -1.0 * scale, scaleAnatomyCm(31, patient.heightCm), 0.60, 0.3) * 6.2;
    paths.soft += softEllipse(xr, y, -1.0 * scale, scaleAnatomyCm(33, patient.heightCm), 4.0 * scale, 7.7 * scale, 0, 0.2) * 0.85;
    paths.soft += softEllipse(xr, y, 1.7 * scale, scaleAnatomyCm(40, patient.heightCm), 4.8 * scale, 6.7 * scale, -0.10, 0.2) * 1.0;
  } else {
    paths.air += softCapsule(x, y, 0, scaleAnatomyCm(18, patient.heightCm), 0.05, scaleAnatomyCm(31, patient.heightCm), 0.52, 0.3) * 6.2;
    paths.soft += softEllipse(x, y, -0.15, scaleAnatomyCm(31.5, patient.heightCm), 2.2 * scale, 7.2 * scale, 0, 0.2) * 0.66;
    paths.soft += softEllipse(x, y, 3.6 * patient.morph.torsoWidth, scaleAnatomyCm(28.8, patient.heightCm), 1.8 * scale, 2.3 * scale, -0.10, 0.2) * 0.34;

    const hilumY = scaleAnatomyCm(35, patient.heightCm);
    for (const side of [-1, 1] as const) {
      const hx = side * 3.5 * patient.morph.torsoWidth;
      const yOffset = side < 0 ? scale * 0.55 : -scale * 0.25;
      paths.soft += softEllipse(x, y, hx, hilumY + yOffset, 1.85 * scale, 2.25 * scale, 0, 0.18) * 0.42;
      paths.soft += softCapsule(x, y, hx, hilumY + yOffset, side * 6.8, scaleAnatomyCm(39.5, patient.heightCm), 0.27, 0.32) * 0.34;
      paths.soft += softCapsule(x, y, side * 6.0, scaleAnatomyCm(39, patient.heightCm), side * 9.0, scaleAnatomyCm(43.5, patient.heightCm), 0.18, 0.34) * 0.26;
      paths.soft += softCapsule(x, y, side * 6.3, scaleAnatomyCm(40.5, patient.heightCm), side * 9.8, scaleAnatomyCm(47.0, patient.heightCm), 0.15, 0.36) * 0.18;
    }
  }

  const diaphragmBase = scaleAnatomyCm(49, patient.heightCm) + (pose.breath === "inspiration" ? -3.0 : 1.0);
  if (lateral) {
    paths.soft += softCapsule(xr, y, -10.0 * scale, diaphragmBase + 0.9, -2.5 * scale, diaphragmBase - 0.3, 0.32, 0.36) * 0.46;
    paths.soft += softCapsule(xr, y, -2.5 * scale, diaphragmBase - 0.3, 8.5 * scale, diaphragmBase + 0.8, 0.32, 0.36) * 0.46;
  } else {
    const right = diaphragmBase - scale * 0.9;
    const left = diaphragmBase + scale * 0.3;
    paths.soft += softCapsule(x, y, -12.5 * patient.morph.torsoWidth, left + 1.1, -8.0 * patient.morph.torsoWidth, left, 0.28, 0.36) * 0.42;
    paths.soft += softCapsule(x, y, -8.0 * patient.morph.torsoWidth, left, -2.0 * patient.morph.torsoWidth, left - 0.8, 0.26, 0.36) * 0.46;
    paths.soft += softCapsule(x, y, 2.0 * patient.morph.torsoWidth, right - 0.8, 8.0 * patient.morph.torsoWidth, right, 0.26, 0.36) * 0.48;
    paths.soft += softCapsule(x, y, 8.0 * patient.morph.torsoWidth, right, 12.5 * patient.morph.torsoWidth, right + 1.2, 0.28, 0.36) * 0.40;
  }

  const lungTexture = (fbm(x * 1.55, y * 1.55, seed + 47) - 0.5) * 0.035;
  const fineTexture = (fbm(x * 6.4, y * 6.4, seed + 53) - 0.5) * 0.012;
  paths.soft += Math.max(0, paths.lung) * Math.max(0, lungTexture);
  paths.lung += Math.max(0, paths.lung) * Math.max(0, fineTexture) * 0.05;
}
