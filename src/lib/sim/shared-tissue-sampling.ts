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
  // so retain that as a compatibility path until every call site passes it.
  const chest = projection?.id === "pa-chest" || projection?.id === "lat-chest" || pose.breath === "inspiration";

  // For a true lateral exposure detector X is already the patient's AP axis.
  const xr = lateral ? x : x * Math.cos(rotation) - y * 0.002 * Math.sin(rotation);

  if (chest) {
    // sampleAnatomy() contains an older generic torso model. It is useful for
    // abdomen/pelvis work, but on chest views it was being combined with this
    // dedicated thoracic model and effectively double-counting soft tissue,
    // lungs and abdominal attenuation. Start the chest material path cleanly.
    paths.air = 0;
    paths.lung = 0;
    paths.fat = 0;
    paths.soft = 0;
    paths.gas = 0;

    const torsoWidth = scaleAnatomyCm(lateral ? 12.2 : 16.3, patient.heightCm);
    const torso = softEllipse(
      xr,
      y,
      0,
      scaleAnatomyCm(38.5, patient.heightCm),
      torsoWidth,
      scaleAnatomyCm(22.8, patient.heightCm),
      0,
      0.085,
    );
    if (torso < 0.012) {
      paths.air = 42;
      return;
    }

    const habitusFat = patient.habitus === "hypersthenic" ? 1.45 : patient.habitus === "asthenic" ? 0.45 : 0.82;
    paths.fat = torso * habitusFat;
    paths.soft = torso * (patient.thickness.chest * (lateral ? 0.048 : 0.032));

    // Aerated lungs replace the majority of the thoracic soft-tissue path.
    // Keep a thin chest-wall component so ribs/soft tissue still sit inside a
    // believable body envelope rather than floating against detector air.
    const lungRight = lateral
      ? softEllipse(xr, y, -0.2 * scale, scaleAnatomyCm(34.0, patient.heightCm), 10.4 * scale, 22.7 * scale, 0, 0.10)
      : softEllipse(xr, y, -7.1 * scale, scaleAnatomyCm(34.0, patient.heightCm), 9.8 * scale, 22.8 * scale, -0.02, 0.10);
    const lungLeft = lateral
      ? lungRight
      : softEllipse(xr, y, 6.8 * scale, scaleAnatomyCm(34.4, patient.heightCm), 8.9 * scale, 22.0 * scale, 0.02, 0.10);
    const lungMask = Math.max(lungRight, lungLeft);
    paths.soft *= Math.max(0.10, 1 - lungMask * 0.90);
    paths.fat *= Math.max(0.22, 1 - lungMask * 0.78);

    // Subtle pectoral/chest-wall attenuation. A PA chest should not contain a
    // broad central slab of soft tissue overlying both lungs.
    const pectoralL = softEllipse(xr, y, -5.1 * scale, scaleAnatomyCm(34.5, patient.heightCm), 5.0 * scale, 6.6 * scale, 0.08, 0.13);
    const pectoralR = softEllipse(xr, y, 5.1 * scale, scaleAnatomyCm(34.5, patient.heightCm), 5.0 * scale, 6.6 * scale, -0.08, 0.13);
    paths.soft += Math.max(pectoralL, pectoralR) * (lateral ? 0.42 : 0.18);
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
