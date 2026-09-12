import type { Patient, Projection, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { fbm, rimEllipse, softCapsule, softEllipse } from "./geometry";

/**
 * Adds fine anatomical structure to the projection sampler. The base sampler is
 * deliberately broad; this layer supplies cortical margins, joint spaces,
 * trabecular variation and realistic surrounding soft tissue so extremity and
 * skull exposures read as radiographs rather than flat geometric silhouettes.
 */
export function refineRadiographicAnatomy(paths: Paths, x: number, y: number, patient: Patient, projection: Projection, pose: SimPose, seed: number) {
  const a = projection.anatomy;
  if (a === "torso-ap" || a === "torso-lat") return;

  const scale = patient.heightCm / 170;
  const side = projection.laterality === "right" ? 1 : -1;
  const texture = fbm(x * 2.8, y * 2.8, seed + 71) - 0.5;
  const fine = fbm(x * 7.5, y * 7.5, seed + 73) - 0.5;

  // A radiographic limb should retain a soft-tissue envelope outside the bone,
  // with a gradual edge rather than a hard cartoon boundary.
  const softEnvelope = Math.max(
    softEllipse(x, y, 0, 0, 7.5 * scale, 10 * scale, 0, 0.15),
    softEllipse(x, y, 0, 1.5 * scale, 6 * scale, 8 * scale, 0, 0.15),
  );
  paths.soft += softEnvelope * (0.45 + Math.max(0, patient.thickness.extremity - 2) * 0.12);
  paths.fat += softEnvelope * (patient.habitus === "hypersthenic" ? 0.75 : patient.habitus === "asthenic" ? 0.2 : 0.45);

  if (a === "hand-pa") {
    for (let digit = 0; digit < 5; digit++) {
      const bx = -3.3 + digit * 1.62;
      const lengths = digit === 0 ? [2.4, 2.2] : [2.0, 1.9, 1.55];
      let y0 = 4.8;
      for (let j = 0; j < lengths.length; j++) {
        const len = lengths[j]!;
        const taper = Math.max(0.22, 0.38 - j * 0.035);
        const bone = softCapsule(x, y, bx + (digit === 0 ? j * 0.18 : 0), y0, bx, y0 + len, taper, 0.12);
        paths.bone += bone * (3.0 - j * 0.18);
        paths.cortical += rimEllipse(x, y, bx, y0 + len * 0.5, taper + 0.08, len * 0.52, 0, 0.18) * 0.95;
        y0 += len + 0.25;
      }
      const joint = softEllipse(x, y, bx, y0 - 0.2, 0.62, 0.18, 0, 0.15);
      paths.bone *= Math.max(0.78, 1 - joint * 0.55);
      paths.soft += joint * 0.2;
    }
    paths.bone += softCapsule(x, y, -2.5, -7.5, -2.1, -1.7, 0.62, 0.14) * 4.4;
    paths.bone += softCapsule(x, y, 2.2, -7.2, 1.7, -1.7, 0.5, 0.14) * 3.8;
    for (let row = 0; row < 2; row++) for (let c = 0; c < 4; c++) {
      paths.bone += softEllipse(x, y, -2.2 + c * 1.45, -5.0 + row * 1.25, 0.62, 0.55, 0, 0.2) * 3.2;
    }
    paths.soft += Math.max(0, fine) * 0.12;
    return;
  }

  if (a === "wrist-pa") {
    for (let row = 0; row < 2; row++) for (let c = 0; c < 4; c++) {
      const cx = -2.45 + c * 1.62 + (row ? 0.25 : 0);
      const cy = -2.7 + row * 1.45;
      paths.bone += softEllipse(x, y, cx, cy, 0.72, 0.68, 0, 0.18) * 4.2;
      paths.cortical += rimEllipse(x, y, cx, cy, 0.68, 0.64, 0.35, 0.2) * 0.9;
    }
    paths.bone += softCapsule(x, y, -2.5, -8.5, -2.2, -3.8, 0.75, 0.14) * 4.8;
    paths.bone += softCapsule(x, y, 2.3, -8.2, 2.0, -3.8, 0.62, 0.14) * 4.1;
    paths.soft += texture * 0.18;
    return;
  }

  if (a === "elbow-ap") {
    paths.bone += softCapsule(x, y, 0, -7.5, 0, -1.0, 1.55, 0.13) * 5.2;
    paths.cortical += rimEllipse(x, y, 0, -4.2, 1.45, 3.1, 0.25, 0.16) * 1.3;
    paths.bone += softEllipse(x, y, -1.8, 0.2, 1.45, 1.25, 0, 0.18) * 5.4;
    paths.bone += softEllipse(x, y, 1.75, 0.25, 1.38, 1.22, 0, 0.18) * 5.2;
    paths.bone += softCapsule(x, y, -0.9, 1.0, -1.0, 7.8, 0.75, 0.13) * 5.2;
    paths.bone += softCapsule(x, y, 1.0, 1.1, 1.0, 7.8, 0.62, 0.13) * 4.7;
    const joint = softEllipse(x, y, 0, 1.05, 3.0, 0.42, 0, 0.22);
    paths.bone *= Math.max(0.72, 1 - joint * 0.72);
    paths.soft += joint * 0.55;
    return;
  }

  if (a === "shoulder-ap") {
    paths.bone += softEllipse(x, y, 0, 0.2, 3.25, 3.25, 0, 0.12) * 5.4;
    paths.cortical += rimEllipse(x, y, 0, 0.2, 3.15, 3.1, 0.6, 0.12) * 1.5;
    paths.bone += softCapsule(x, y, 0, 2.0, 0, 10.5, 1.2, 0.14) * 4.6;
    paths.bone += softEllipse(x, y, -3.7, -1.1, 2.4, 1.05, 0.25, 0.16) * 3.8;
    paths.bone += softCapsule(x, y, -6.2, -1.2, 6.2, -1.35, 0.48, 0.16) * 3.2;
    const joint = softEllipse(x, y, -0.8, 0.2, 0.5, 2.0, 0, 0.2);
    paths.bone *= Math.max(0.82, 1 - joint * 0.55);
    paths.soft += softEnvelope * 0.15;
    return;
  }

  if (a === "knee-ap" || a === "knee-lat") {
    const lateral = a === "knee-lat";
    const fy = lateral ? -0.8 : -0.1;
    paths.bone += softCapsule(x, y, lateral ? 0.7 : -0.7, -8.5, lateral ? 0.6 : -0.5, fy, lateral ? 2.0 : 1.7, 0.13) * 5.8;
    paths.bone += softEllipse(x, y, lateral ? 0.2 : -1.7, 0, lateral ? 2.4 : 1.65, 1.45, 0, 0.15) * 5.5;
    paths.bone += softEllipse(x, y, lateral ? 1.8 : 1.7, 0.1, 1.35, 1.4, 0, 0.15) * 4.5;
    paths.bone += softCapsule(x, y, lateral ? 0.4 : 0, 1.2, lateral ? 0.4 : 0, 9.0, lateral ? 1.8 : 1.95, 0.14) * 5.4;
    paths.bone += softEllipse(x, y, lateral ? -1.5 : -2.3, 1.2, 0.9, 1.15, 0, 0.16) * 3.2;
    paths.bone += softEllipse(x, y, lateral ? -0.4 : 0, -0.6, lateral ? 1.1 : 1.2, 2.2, 0.12, 0.14) * 3.8;
    const joint = softEllipse(x, y, lateral ? 0.3 : 0, 0.65, lateral ? 2.8 : 3.7, 0.45, 0, 0.2);
    paths.bone *= Math.max(0.7, 1 - joint * 0.75);
    paths.soft += joint * 0.7;
    return;
  }

  if (a === "foot-dp") {
    for (let i = 0; i < 5; i++) {
      const bx = -3.25 + i * 1.62;
      const width = i === 0 ? 0.48 : 0.36;
      paths.bone += softCapsule(x, y, bx, -1.7, bx + (i - 2) * 0.16, 4.9, width, 0.13) * 4.4;
      for (let ph = 0; ph < 2; ph++) {
        const yy = 5.3 + ph * 1.75;
        paths.bone += softCapsule(x, y, bx + (i - 2) * 0.18, yy, bx + (i - 2) * 0.2, yy + 1.35, 0.25 - ph * 0.025, 0.12) * 3.3;
      }
    }
    for (let i = 0; i < 7; i++) {
      const tx = -4.0 + i * 1.3;
      const ty = -4.4 + Math.abs(i - 3) * 0.25;
      paths.bone += softEllipse(x, y, tx, ty, 0.85, 0.9, 0.1 * (i - 3), 0.18) * 3.8;
    }
    paths.bone += softEllipse(x, y, 0, -6.0, 2.7, 1.5, 0, 0.16) * 3.5;
    return;
  }

  if (a === "ankle-ap") {
    paths.bone += softCapsule(x, y, -1.15, -8.5, -1.0, 0.8, 1.05, 0.13) * 5.3;
    paths.bone += softCapsule(x, y, 1.15, -8.3, 1.1, 0.6, 0.72, 0.13) * 4.4;
    paths.bone += softEllipse(x, y, 0, 1.6, 2.8, 1.5, 0, 0.15) * 5.0;
    paths.bone += softEllipse(x, y, -2.25, 1.1, 0.95, 1.55, 0, 0.15) * 4.0;
    paths.bone += softEllipse(x, y, 2.1, 1.0, 0.85, 1.45, 0, 0.15) * 3.6;
    const mortise = softEllipse(x, y, 0, 0.65, 2.0, 0.35, 0, 0.2);
    paths.bone *= Math.max(0.72, 1 - mortise * 0.72);
    paths.soft += mortise * 0.5;
    return;
  }

  if (a === "cspine-lat") {
    for (let i = 0; i < 7; i++) {
      const cy = 14 + i * 2.2;
      paths.bone += softEllipse(x, y, 0, cy, 1.15, 0.82, 0, 0.12) * 4.8;
      paths.cortical += rimEllipse(x, y, 0, cy, 1.1, 0.78, 0.35, 0.12) * 1.15;
      paths.bone += softEllipse(x, y, -1.9, cy + 0.05, 0.75, 0.8, 0, 0.18) * 1.8;
      const disc = softEllipse(x, y, 0, cy + 1.08, 1.0, 0.18, 0, 0.15);
      paths.bone *= Math.max(0.78, 1 - disc * 0.55);
      paths.soft += disc * 0.35;
    }
    paths.soft += softEllipse(x, y, 2.6, 18, 2.2, 7.5, 0, 0.2) * 0.8;
    paths.air += softCapsule(x, y, 1.5, 12, 1.5, 22, 0.55, 0.25) * 3;
    return;
  }

  if (a === "skull-lat") {
    const outer = softEllipse(x, y, 0, -1, 11.5, 10.5, 0, 0.10);
    const inner = softEllipse(x, y, 0.2, -0.7, 9.7, 8.9, 0, 0.12);
    paths.bone += outer * 2.8 + inner * 1.6;
    paths.cortical += rimEllipse(x, y, 0, -1, 11.5, 10.5, 0.65, 0.06) * 3.2;
    paths.cortical += rimEllipse(x, y, 0.2, -0.7, 9.8, 8.9, 0.5, 0.06) * 1.5;
    paths.bone += softEllipse(x, y, 2.8, 3.7, 4.4, 3.0, 0.25, 0.13) * 2.5;
    paths.bone += softEllipse(x, y, 4.5, 6.0, 4.8, 2.7, 0.38, 0.13) * 2.0;
    for (const [cx, cy, rx, ry] of [[3,2,2.7,2.0],[5.2,1.5,2.0,1.4],[2.8,5.2,1.8,1.4]] as const) {
      const sinus = softEllipse(x, y, cx, cy, rx, ry, 0, 0.18);
      paths.air += sinus * 5.5;
      paths.bone *= Math.max(0.72, 1 - sinus * 0.45);
    }
    paths.soft += inner * 0.25;
    return;
  }

  if (paths.bone > 0.15) {
    paths.bone *= 1 + fine * 0.08;
    paths.cortical += Math.max(0, texture) * 0.18;
  }
}
