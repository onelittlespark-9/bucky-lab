import type { Patient, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule, softEllipse } from "./geometry";
import { SHARED_ORGANS, scaleAnatomyCm } from "./anatomy-structures";

/**
 * Projection-specific attenuation anatomy shared with the 3D patient model.
 * The goal is a radiographic appearance: broad tissue gradients, superimposed
 * organs, fine vascular/parenchymal variation and thin cortical structures,
 * rather than isolated geometric shapes.
 */
export function addSharedOrganPaths(paths: Paths, x: number, y: number, patient: Patient, pose: SimPose) {
  const scale = patient.heightCm / 170;
  const rotation = (pose.rotationY * Math.PI) / 180;
  const xr = x * Math.cos(rotation) - y * 0.002 * Math.sin(rotation);
  const seed = patient.id.split("").reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);

  for (const organ of SHARED_ORGANS) {
    const ox = scaleAnatomyCm(organ.xCm, patient.heightCm);
    const oy = scaleAnatomyCm(organ.yCm, patient.heightCm);
    const ow = scaleAnatomyCm(organ.widthCm, patient.heightCm);
    const oh = scaleAnatomyCm(organ.heightCm, patient.heightCm);
    const shape = softEllipse(xr, y, ox, oy, ow, oh, organ.id === "heart" ? 0.35 : 0, 0.12);
    if (shape < 0.03) continue;

    if (organ.density === "lung") {
      const diaphragm = scaleAnatomyCm(48, patient.heightCm) + (pose.breath === "inspiration" ? -2.5 : 1.5);
      if (y < diaphragm) {
        const texture = 0.90 + (fbm(x * 0.7, y * 0.7, seed + 31) - 0.5) * 0.24;
        paths.lung += shape * patient.thickness.chest * 0.34 * texture;
        paths.soft *= Math.max(0.20, 1 - shape * 0.50);
      }
    } else if (organ.id === "heart") {
      paths.soft += shape * 4.8;
      paths.lung *= Math.max(0.12, 1 - shape * 0.84);
    } else {
      paths.soft += shape * (organ.id === "liver" ? 5.5 : 3.4);
      if (organ.id === "stomach") paths.gas += shape * 2.5;
    }
  }

  // Vertebral bodies and posterior elements. The individual levels are kept
  // visible through the mediastinum without becoming a stack of obvious discs.
  for (let i = 0; i < 17; i++) {
    const level = 22 + i * 3.7;
    const vy = scaleAnatomyCm(level, patient.heightCm);
    const body = softEllipse(x, y, 0, vy, scale * 1.15, scale * 1.05, 0, 0.18);
    paths.bone += body * 3.4;
    paths.cortical += body * 0.34;
    const pedicle = softEllipse(x, y, -1.65 * scale, vy + 0.05, scale * 0.28, scale * 0.34, 0, 0.2);
    paths.bone += pedicle * 1.15;
  }

  // Rib arcs are thin and progressively shorter inferiorly. Their attenuation
  // is intentionally subtle so the CXR remains a radiograph rather than rods.
  for (let i = 0; i < 12; i++) {
    const ry = scaleAnatomyCm(27 + i * 2.55, patient.heightCm);
    const length = (13.2 - i * 0.42) * patient.morph.torsoWidth;
    for (const side of [-1, 1] as const) {
      const posterior = side * 2.7 * scale;
      const lateral = side * length;
      const anterior = side * (length * 0.72);
      const rib =
        softCapsule(x, y, posterior, ry, lateral, ry + 1.35 + i * 0.035, 0.22, 0.32) * 0.44 +
        softCapsule(x, y, lateral, ry + 1.35 + i * 0.035, anterior, ry + 0.4, 0.18, 0.34) * 0.34;
      paths.cortical += rib;
      paths.bone += rib * 0.36;
    }
  }

  // Central airway and mediastinal interfaces.
  paths.air += softCapsule(x, y, 0, scaleAnatomyCm(18, patient.heightCm), 0.05, scaleAnatomyCm(31, patient.heightCm), 0.55, 0.3) * 6.5;
  paths.soft += softEllipse(x, y, -0.4, scaleAnatomyCm(31, patient.heightCm), 3.5 * scale, 7.8 * scale, 0, 0.2) * 1.25;
  paths.soft += softEllipse(x, y, -4.6 * patient.morph.torsoWidth, scaleAnatomyCm(27.5, patient.heightCm), 2.7 * scale, 3.0 * scale, 0.12, 0.2) * 0.9;

  // Hilar vascular trunks and peripheral branching. These create the fine
  // grey-white lung markings expected on a PA CXR, but remain low contrast.
  const hilumY = scaleAnatomyCm(35, patient.heightCm);
  for (const side of [-1, 1] as const) {
    const hx = side * 4.0 * patient.morph.torsoWidth;
    paths.soft += softCapsule(x, y, hx, hilumY, side * 7.0, scaleAnatomyCm(40.5, patient.heightCm), 0.46, 0.34) * 0.82;
    paths.soft += softCapsule(x, y, side * 6.7, scaleAnatomyCm(39, patient.heightCm), side * 9.8, scaleAnatomyCm(45, patient.heightCm), 0.30, 0.35) * 0.62;
    paths.soft += softCapsule(x, y, side * 7.2, scaleAnatomyCm(41, patient.heightCm), side * 11.4, scaleAnatomyCm(38, patient.heightCm), 0.25, 0.36) * 0.50;
    paths.soft += softCapsule(x, y, side * 7.0, scaleAnatomyCm(43, patient.heightCm), side * 10.7, scaleAnatomyCm(51, patient.heightCm), 0.22, 0.38) * 0.43;
    paths.soft += softCapsule(x, y, side * 6.5, scaleAnatomyCm(44, patient.heightCm), side * 5.3, scaleAnatomyCm(54, patient.heightCm), 0.20, 0.40) * 0.38;
  }

  // Diaphragmatic contours and subtle basal density transition.
  const diaphragm = scaleAnatomyCm(48, patient.heightCm) + (pose.breath === "inspiration" ? -2.5 : 1.5);
  paths.soft += softCapsule(x, y, -11 * patient.morph.torsoWidth, diaphragm, -4, diaphragm + 1.4, 0.65, 0.34) * 0.7;
  paths.soft += softCapsule(x, y, 4, diaphragm + 1.4, 11 * patient.morph.torsoWidth, diaphragm, 0.68, 0.34) * 0.72;

  // Fine parenchymal variation is strongest in the lung field and fades through
  // the mediastinum. This breaks up the uniform synthetic grey seen previously.
  const lungTexture = (fbm(x * 1.55, y * 1.55, seed + 47) - 0.5) * 0.18;
  const fineTexture = (fbm(x * 6.4, y * 6.4, seed + 53) - 0.5) * 0.08;
  paths.soft += Math.max(0, paths.lung) * Math.max(0, lungTexture);
  paths.lung += Math.max(0, paths.lung) * Math.max(0, fineTexture) * 0.16;
}
