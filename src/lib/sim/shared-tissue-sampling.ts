import type { Patient, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { softEllipse } from "./geometry";
import { scaleAnatomyCm } from "./anatomy-structures";

/** Shared soft-tissue layer footprints used by both the 3D model and exposure renderer. */
export function addSharedTissueLayers(paths: Paths, x: number, y: number, patient: Patient, pose: SimPose) {
  const scale = patient.heightCm / 170;
  const rotation = (pose.rotationY * Math.PI) / 180;
  const lateral = Math.abs(pose.rotationY) >= 45;
  // For a true lateral exposure detector X is already the patient's AP axis;
  // rotating it again collapses the torso to a narrow strip.
  const xr = lateral ? x : x * Math.cos(rotation) - y * 0.002 * Math.sin(rotation);
  const torsoWidth = lateral ? scaleAnatomyCm(12.5, patient.heightCm) : scaleAnatomyCm(15.5, patient.heightCm);
  const torso = softEllipse(xr, y, 0, scaleAnatomyCm(54, patient.heightCm), torsoWidth, scaleAnatomyCm(30, patient.heightCm), 0, 0.12);
  if (torso < 0.02) return;
  const habitusFat = patient.habitus === "hypersthenic" ? 5.0 : patient.habitus === "asthenic" ? 1.0 : 2.5;
  paths.fat += torso * habitusFat;
  paths.soft += torso * (patient.thickness.chest * 0.16 + patient.thickness.abdomen * 0.10);
  const pectoralL = softEllipse(xr, y, -5.2 * scale, scaleAnatomyCm(36, patient.heightCm), scaleAnatomyCm(5.5, patient.heightCm), scaleAnatomyCm(7.5, patient.heightCm), 0.08, 0.14);
  const pectoralR = softEllipse(xr, y, 5.2 * scale, scaleAnatomyCm(36, patient.heightCm), scaleAnatomyCm(5.5, patient.heightCm), scaleAnatomyCm(7.5, patient.heightCm), -0.08, 0.14);
  paths.soft += Math.max(pectoralL, pectoralR) * (lateral ? 1.1 : 1.8);
  const abdominal = softEllipse(xr, y, 0, scaleAnatomyCm(56, patient.heightCm), scaleAnatomyCm(lateral ? 9 : 10.5, patient.heightCm), scaleAnatomyCm(13, patient.heightCm), 0, 0.16);
  paths.soft += abdominal * 1.2;
}
