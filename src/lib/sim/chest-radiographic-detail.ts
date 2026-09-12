import type { Patient, Projection, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule, softEllipse } from "./geometry";

/**
 * Subtle projection-specific structures for a clinical chest radiograph.
 * These are attenuation structures, not visible 3D rods: vessels, hila,
 * mediastinum, diaphragm and fine parenchymal texture are superimposed on the
 * existing patient model so the result reads as a radiograph rather than an
 * anatomical illustration.
 */
export function addChestRadiographicDetail(
  paths: Paths,
  x: number,
  y: number,
  patient: Patient,
  projection: Projection,
  pose: SimPose,
  seed: number,
) {
  if (projection.id !== "pa-chest" && projection.id !== "lat-chest") return;

  const k = patient.heightCm / 170;
  const inspiration = pose.breath === "inspiration";
  const texture = fbm(x * 1.35, y * 1.35, seed + 101) - 0.5;
  const fine = fbm(x * 5.8, y * 5.8, seed + 107) - 0.5;

  if (projection.id === "pa-chest") {
    // Central airway and hilar/mediastinal soft tissue. Keep these deliberately
    // low amplitude because normal CXR anatomy is mostly a density gradient.
    const trachea = softCapsule(x, y, 0, 17 * k, 0.15, 30 * k, 0.62, 0.32);
    paths.air += trachea * 7;
    paths.soft += softEllipse(x, y, 0.3, 28 * k, 4.0, 9.5 * k, 0, 0.2) * 1.4;
    paths.soft += softEllipse(x, y, -3.2, 34 * k, 2.9, 3.1, 0, 0.18) * 1.5;
    paths.soft += softEllipse(x, y, 3.2, 34 * k, 3.0, 3.2, 0, 0.18) * 1.5;

    // Aortic arch / descending aorta contour.
    paths.soft += softEllipse(x, y, -4.7, 27 * k, 2.8, 3.2 * k, 0.15, 0.18) * 1.1;
    paths.soft += softCapsule(x, y, -4.2, 29 * k, -3.0, 46 * k, 1.25, 0.28) * 0.75;

    // Pulmonary vessels: branching, tapering low-density markings. These are
    // intentionally soft and irregular rather than straight line geometry.
    const hilumY = 35 * k;
    for (const side of [-1, 1] as const) {
      const hx = side * 4.1;
      paths.soft += softCapsule(x, y, hx, hilumY, side * 7.5, 41 * k, 0.52, 0.34) * 0.85;
      paths.soft += softCapsule(x, y, side * 6.6, 39 * k, side * 9.8, 46 * k, 0.36, 0.34) * 0.62;
      paths.soft += softCapsule(x, y, side * 7.4, 40 * k, side * 11.8, 37 * k, 0.30, 0.34) * 0.55;
      paths.soft += softCapsule(x, y, side * 7.7, 42 * k, side * 10.8, 52 * k, 0.27, 0.36) * 0.5;
      paths.soft += softCapsule(x, y, side * 6.9, 45 * k, side * 5.8, 54 * k, 0.25, 0.38) * 0.42;
    }

    // Normal lung texture: broad heterogeneous parenchyma plus fine vessel-like
    // variation. Strong enough to prevent a flat black/grey lung field but much
    // weaker than ribs or bones.
    const lungArea = Math.max(0, paths.lung);
    const parenchymal = lungArea * (0.10 + Math.max(0, texture) * 0.12);
    paths.soft += parenchymal;
    paths.lung += lungArea * Math.max(0, fine) * 0.045;

    // Diaphragmatic domes and costophrenic recesses.
    const diaY = (inspiration ? 48 : 50) * k;
    paths.soft += softCapsule(x, y, -10.0, diaY, -4.0, diaY + 1.5, 0.7, 0.32) * 0.7;
    paths.soft += softCapsule(x, y, 4.0, diaY + 1.5, 10.0, diaY, 0.72, 0.32) * 0.72;
    paths.soft += softEllipse(x, y, -10.8, diaY + 2.2, 2.2, 1.2, 0, 0.25) * 0.5;
    paths.soft += softEllipse(x, y, 10.8, diaY + 2.2, 2.2, 1.2, 0, 0.25) * 0.5;

    // Keep rib visibility anatomically useful but prevent the previous rod-like
    // appearance: ribs are a thin cortical signal, not thick filled tubes.
    for (let i = 0; i < 10; i++) {
      const yy = (25 + i * 2.9) * k;
      for (const side of [-1, 1] as const) {
        const rib = softCapsule(x, y, side * 3.0, yy, side * (12.5 - i * 0.22), yy + 1.9, 0.20, 0.30);
        paths.cortical += rib * 0.34;
        paths.bone += rib * 0.18;
      }
    }
    return;
  }

  // Lateral CXR: the dominant appearance is superimposition of the sternum,
  // spine, ribs, retrosternal/retrocardiac spaces and diaphragms.
  paths.air += softCapsule(x, y, 1.0, 18 * k, 1.0, 34 * k, 0.58, 0.32) * 5;
  paths.soft += softCapsule(x, y, -7.8, 24 * k, -7.0, 46 * k, 1.0, 0.25) * 1.2;
  paths.soft += softEllipse(x, y, -1.5, 38 * k, 7.5, 9 * k, 0.2, 0.16) * 1.1;
  paths.soft += softEllipse(x, y, -3.5, 49 * k, 6.5, 4.0 * k, 0.1, 0.18) * 0.75;
  paths.soft += softCapsule(x, y, 7.2, 24 * k, 7.4, 49 * k, 1.1, 0.28) * 0.55;
  paths.soft += softCapsule(x, y, -5.2, 50 * k, 6.5, 51.5 * k, 0.7, 0.3) * 0.8;
  paths.soft += softCapsule(x, y, 5.8, 52 * k, 12.0, 51 * k, 0.7, 0.3) * 0.7;
  paths.soft += Math.max(0, paths.lung) * (0.09 + Math.max(0, texture) * 0.10);
  paths.lung += Math.max(0, paths.lung) * Math.max(0, fine) * 0.04;
}
