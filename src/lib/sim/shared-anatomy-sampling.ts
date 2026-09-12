import type { Patient, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule, softEllipse } from "./geometry";
import { SHARED_ORGANS, scaleAnatomyCm } from "./anatomy-structures";

/**
 * Projection-specific attenuation anatomy shared with the 3D patient model.
 * Soft-tissue and organ attenuation is always added here. Synthetic bone is a
 * fallback only: when the Human Atlas projection is available, ribs and spine
 * must come from that single 3D source of truth rather than being painted over
 * it a second time in detector space.
 */
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
  // localCoords already maps a lateral detector's horizontal axis to the
  // patient's AP direction. Rotating X a second time collapses the lungs and
  // mediastinum, so lateral attenuation uses detector X directly.
  const xr = lateral ? x : x * Math.cos(rotation) - y * 0.002 * Math.sin(rotation);
  const seed = patient.id.split("").reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);

  for (const organ of SHARED_ORGANS) {
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
      const diaphragm = scaleAnatomyCm(49, patient.heightCm) + (pose.breath === "inspiration" ? -3.0 : 1.0);
      if (y < diaphragm) {
        const texture = 0.92 + (fbm(x * 0.7, y * 0.7, seed + 31) - 0.5) * 0.16;
        paths.lung += shape * patient.thickness.chest * (lateral ? 0.46 : 0.34) * texture;
        paths.soft *= Math.max(0.20, 1 - shape * 0.50);
      }
    } else if (organ.id === "heart") {
      const heartWeight = lateral ? 4.2 : 4.8;
      paths.soft += shape * heartWeight;
      paths.lung *= Math.max(0.12, 1 - shape * 0.84);
    } else {
      paths.soft += shape * (organ.id === "liver" ? 5.5 : 3.4);
      if (organ.id === "stomach") paths.gas += shape * 2.5;
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
    // Lateral chest: trachea/mediastinum occupy the AP detector axis rather than
    // being duplicated as left/right PA structures.
    paths.air += softCapsule(xr, y, -1.2 * scale, scaleAnatomyCm(18, patient.heightCm), -1.0 * scale, scaleAnatomyCm(31, patient.heightCm), 0.60, 0.3) * 6.5;
    paths.soft += softEllipse(xr, y, -1.0 * scale, scaleAnatomyCm(33, patient.heightCm), 4.4 * scale, 8.4 * scale, 0, 0.2) * 1.15;
    paths.soft += softEllipse(xr, y, 1.7 * scale, scaleAnatomyCm(40, patient.heightCm), 5.2 * scale, 7.2 * scale, -0.10, 0.2) * 1.25;
  } else {
    paths.air += softCapsule(x, y, 0, scaleAnatomyCm(18, patient.heightCm), 0.05, scaleAnatomyCm(31, patient.heightCm), 0.55, 0.3) * 6.5;
    paths.soft += softEllipse(x, y, -0.4, scaleAnatomyCm(31, patient.heightCm), 3.5 * scale, 7.8 * scale, 0, 0.2) * 1.25;
    paths.soft += softEllipse(x, y, -4.6 * patient.morph.torsoWidth, scaleAnatomyCm(27.5, patient.heightCm), 2.7 * scale, 3.0 * scale, 0.12, 0.2) * 0.9;

    const hilumY = scaleAnatomyCm(35, patient.heightCm);
    for (const side of [-1, 1] as const) {
      const hx = side * 3.5 * patient.morph.torsoWidth;
      const yOffset = side < 0 ? scale * 0.65 : -scale * 0.35;
      paths.soft += softEllipse(x, y, hx, hilumY + yOffset, 2.15 * scale, 2.6 * scale, 0, 0.18) * 0.72;
      paths.soft += softCapsule(x, y, hx, hilumY + yOffset, side * 7.0, scaleAnatomyCm(39.5, patient.heightCm), 0.42, 0.32) * 0.58;
      paths.soft += softCapsule(x, y, side * 6.2, scaleAnatomyCm(39, patient.heightCm), side * 9.4, scaleAnatomyCm(43.5, patient.heightCm), 0.28, 0.34) * 0.48;
      paths.soft += softCapsule(x, y, side * 6.5, scaleAnatomyCm(40.5, patient.heightCm), side * 10.4, scaleAnatomyCm(47.5, patient.heightCm), 0.22, 0.36) * 0.34;
      paths.soft += softCapsule(x, y, side * 6.0, scaleAnatomyCm(41.5, patient.heightCm), side * 9.0, scaleAnatomyCm(52, patient.heightCm), 0.18, 0.38) * 0.25;
    }
  }

  const diaphragmBase = scaleAnatomyCm(49, patient.heightCm) + (pose.breath === "inspiration" ? -3.0 : 1.0);
  if (lateral) {
    paths.soft += softCapsule(xr, y, -10.0 * scale, diaphragmBase + 0.9, -2.5 * scale, diaphragmBase - 0.3, 0.50, 0.36) * 0.78;
    paths.soft += softCapsule(xr, y, -2.5 * scale, diaphragmBase - 0.3, 8.5 * scale, diaphragmBase + 0.8, 0.50, 0.36) * 0.78;
  } else {
    const right = diaphragmBase - scale * 0.9;
    const left = diaphragmBase + scale * 0.3;
    paths.soft += softCapsule(x, y, -12.5 * patient.morph.torsoWidth, left + 1.1, -8.0 * patient.morph.torsoWidth, left, 0.52, 0.36) * 0.74;
    paths.soft += softCapsule(x, y, -8.0 * patient.morph.torsoWidth, left, -2.0 * patient.morph.torsoWidth, left - 0.8, 0.48, 0.36) * 0.80;
    paths.soft += softCapsule(x, y, -2.0 * patient.morph.torsoWidth, left - 0.8, 3.0 * patient.morph.torsoWidth, right - 0.5, 0.46, 0.36) * 0.82;
    paths.soft += softCapsule(x, y, 3.0 * patient.morph.torsoWidth, right - 0.5, 8.0 * patient.morph.torsoWidth, right, 0.48, 0.36) * 0.84;
    paths.soft += softCapsule(x, y, 8.0 * patient.morph.torsoWidth, right, 12.5 * patient.morph.torsoWidth, right + 1.2, 0.52, 0.36) * 0.70;
  }

  const lungTexture = (fbm(x * 1.55, y * 1.55, seed + 47) - 0.5) * 0.10;
  const fineTexture = (fbm(x * 6.4, y * 6.4, seed + 53) - 0.5) * 0.035;
  paths.soft += Math.max(0, paths.lung) * Math.max(0, lungTexture);
  paths.lung += Math.max(0, paths.lung) * Math.max(0, fineTexture) * 0.12;
}
