import type { Patient, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { softEllipse } from "./geometry";
import { SHARED_ORGANS, scaleAnatomyCm } from "./anatomy-structures";

/** Adds the same organ footprints used by the 3D anatomy layer to the 2D X-ray path model. */
export function addSharedOrganPaths(paths: Paths, x: number, y: number, patient: Patient, pose: SimPose) {
  const scale = patient.heightCm / 170;
  const rotation = (pose.rotationY * Math.PI) / 180;
  const xr = x * Math.cos(rotation) - y * 0.002 * Math.sin(rotation);

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
        paths.lung += shape * patient.thickness.chest * 0.34;
        paths.soft *= Math.max(0.22, 1 - shape * 0.48);
      }
    } else if (organ.id === "heart") {
      paths.soft += shape * 4.8;
      paths.lung *= Math.max(0.15, 1 - shape * 0.82);
    } else {
      paths.soft += shape * (organ.id === "liver" ? 5.5 : 3.4);
      if (organ.id === "stomach") paths.gas += shape * 2.5;
    }
  }

  // Shared spine and rib levels make the visible anatomy and radiograph landmarks agree.
  for (const level of [22, 25.7, 29.4, 33.1, 36.8, 40.5, 44.2, 47.9, 51.6, 55.3, 59, 62.7, 66.4, 70.1, 73.8, 77.5, 81.2]) {
    const vy = scaleAnatomyCm(level, patient.heightCm);
    paths.bone += softEllipse(x, y, 0, vy, scale * 1.15, scale * 1.05, 0, 0.18) * 3.8;
  }

  for (let i = 0; i < 10; i++) {
    const ry = scaleAnatomyCm(28 + i * 2.8, patient.heightCm);
    for (const side of [-1, 1]) {
      const ribX = side * scaleAnatomyCm(7.5, patient.heightCm);
      paths.bone += softEllipse(x, y, ribX, ry, scaleAnatomyCm(7.2, patient.heightCm), scale * 0.65, side * 0.12, 0.2) * 0.7;
    }
  }
}
