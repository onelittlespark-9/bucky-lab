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
  const chest = projection?.id === "pa-chest" || projection?.id === "lat-chest" || pose.breath === "inspiration";

  // For a true lateral exposure detector X is already the patient's AP axis.
  const xr = lateral ? x : x * Math.cos(rotation) - y * 0.002 * Math.sin(rotation);

  if (chest) {
    // sampleAnatomy() contains an older generic torso model. It is useful for
    // abdomen/pelvis work, but on chest views it double-counts attenuation.
    paths.air = 0;
    paths.lung = 0;
    paths.fat = 0;
    paths.soft = 0;
    paths.gas = 0;

    // Keep the envelope continuous beyond the costophrenic angles. Previously
    // the model switched abruptly to a large air path at its inferior edge,
    // which created the obvious horizontal band across the lower chest.
    const torsoWidth = scaleAnatomyCm(lateral ? 12.2 : 16.3, patient.heightCm);
    const torso = softEllipse(
      xr,
      y,
      0,
      scaleAnatomyCm(39.5, patient.heightCm),
      torsoWidth,
      scaleAnatomyCm(25.0, patient.heightCm),
      0,
      0.085,
    );
    if (torso < 0.004) return;

    const habitusFat = patient.habitus === "hypersthenic" ? 1.45 : patient.habitus === "asthenic" ? 0.45 : 0.82;
    paths.fat = torso * habitusFat;
    paths.soft = torso * (patient.thickness.chest * (lateral ? 0.048 : 0.032));

    // Aerated lungs replace most of the thoracic soft-tissue path while a thin
    // chest-wall path remains around them.
    const lungRight = lateral
      ? softEllipse(xr, y, -0.2 * scale, scaleAnatomyCm(34.0, patient.heightCm), 10.4 * scale, 22.7 * scale, 0, 0.10)
      : softEllipse(xr, y, -7.1 * scale, scaleAnatomyCm(34.0, patient.heightCm), 9.8 * scale, 22.8 * scale, -0.02, 0.10);
    const lungLeft = lateral
      ? lungRight
      : softEllipse(xr, y, 6.8 * scale, scaleAnatomyCm(34.4, patient.heightCm), 8.9 * scale, 22.0 * scale, 0.02, 0.10);
    const lungMask = Math.max(lungRight, lungLeft);
    paths.soft *= Math.max(0.10, 1 - lungMask * 0.90);
    paths.fat *= Math.max(0.22, 1 - lungMask * 0.78);

    const pectoralL = softEllipse(xr, y, -5.1 * scale, scaleAnatomyCm(34.5, patient.heightCm), 5.0 * scale, 6.6 * scale, 0.08, 0.13);
    const pectoralR = softEllipse(xr, y, 5.1 * scale, scaleAnatomyCm(34.5, patient.heightCm), 5.0 * scale, 6.6 * scale, -0.08, 0.13);
    paths.soft += Math.max(pectoralL, pectoralR) * (lateral ? 0.42 : 0.18);

    // Add only a low, broad sub-diaphragmatic soft-tissue pedestal rather than
    // drawing individual abdominal organs into a chest projection.
    const inferior = softEllipse(
      xr,
      y,
      0,
      scaleAnatomyCm(55.5, patient.heightCm),
      scaleAnatomyCm(lateral ? 11.0 : 15.0, patient.heightCm),
      scaleAnatomyCm(8.5, patient.heightCm),
      0,
      0.12,
    );
    paths.soft += inferior * 0.45;
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
