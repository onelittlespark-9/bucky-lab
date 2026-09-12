import type { Patient, Projection, SimPose } from "./types";
import type { Paths } from "./anatomy";
import { softEllipse } from "./geometry";
import { scaleAnatomyCm } from "./anatomy-structures";

/** Shared soft-tissue layer footprints used by the exposure renderer. */
export function addSharedTissueLayers(
  paths: Paths,
  x: number,
  y: number,
  patient: Patient,
  pose: SimPose,
  projection?: Projection,
) {
  const scale = patient.heightCm / 170;
  const rotation = (pose.rotationY * Math.PI) / 180;
  const lateral = projection?.anatomy === "torso-lat" || Math.abs(pose.rotationY) >= 45;
  // The renderer historically called this helper without passing Projection.
  // Inspiration is the defining benchmark state for the PA/lateral chest views,
  // so retain that as a safe compatibility path until all call sites pass it.
  const chest = projection?.id === "pa-chest" || projection?.id === "lat-chest" || pose.breath === "inspiration";

  // For a true lateral exposure detector X is already the patient's AP axis.
  const xr = lateral ? x : x * Math.cos(rotation) - y * 0.002 * Math.sin(rotation);

  if (chest) {
    // Chest radiography needs a relatively thin chest-wall envelope around the
    // aerated lungs. The previous generic torso model was centred in the upper
    // abdomen and added several centimetres of soft tissue across the lungs,
    // making a normal 125 kVp chest appear almost completely opaque.
    const torsoWidth = scaleAnatomyCm(lateral ? 12.0 : 16.0, patient.heightCm);
    const torso = softEllipse(
      xr,
      y,
      0,
      scaleAnatomyCm(38.5, patient.heightCm),
      torsoWidth,
      scaleAnatomyCm(22.5, patient.heightCm),
      0,
      0.10,
    );
    if (torso < 0.02) return;

    const habitusFat = patient.habitus === "hypersthenic" ? 1.8 : patient.habitus === "asthenic" ? 0.65 : 1.05;
    paths.fat += torso * habitusFat;
    paths.soft += torso * (patient.thickness.chest * (lateral ? 0.070 : 0.052));

    // Pectoral/chest-wall attenuation should be subtle on a PA image and more
    // evident on a lateral image, never a broad central white mass.
    const pectoralL = softEllipse(xr, y, -5.2 * scale, scaleAnatomyCm(35, patient.heightCm), 5.2 * scale, 7.0 * scale, 0.08, 0.14);
    const pectoralR = softEllipse(xr, y, 5.2 * scale, scaleAnatomyCm(35, patient.heightCm), 5.2 * scale, 7.0 * scale, -0.08, 0.14);
    paths.soft += Math.max(pectoralL, pectoralR) * (lateral ? 0.70 : 0.38);
    return;
  }

  // Non-chest projections keep the broader torso envelope used for abdomen,
  // pelvis and spine simulations.
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
