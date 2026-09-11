import { type ReactNode } from "react";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { projectionById } from "@/lib/sim/projections";
import type { V3 } from "@/lib/sim/patient-kinematics";

/**
 * Single scene-space transform for every patient layer.
 * Anatomy components must live below this rig rather than calculating their
 * own patient placement. This prevents skin, soft tissue, skeleton and organs
 * drifting apart when the patient is moved between table/upright positions.
 *
 * Projection orientation is deliberately applied here so PA/AP is a property
 * of the patient, not just of the X-ray image. A PA upright examination means
 * the patient's anterior surface faces the image receptor; AP means the
 * posterior surface faces the receptor. Every anatomical layer therefore
 * rotates together.
 */
export function PatientRig({ children }: { children: ReactNode }) {
  const patientId = useSim(s => s.patientId);
  const projectionId = useSim(s => s.projectionId);
  const pose = useSim(s => s.pose);
  const equipment = useSim(s => s.equipment);
  const patient = patientById(patientId);
  const projection = projectionById(projectionId);
  const H = patient.heightCm / 100;
  const scale = H / 1.7;
  const bodyThickness = Math.max(0.13 * scale, 0.12 * patient.morph.torsoDepth * scale * 1.05);
  const footRadiusY = 0.045 * scale;
  const footSole = 0.055 * H - 0.012 * scale - footRadiusY;
  const kyphosis = patient.morph.kyphosis * 0.22;
  const oblique = pose.oblique * Math.PI / 180;
  const yaw = pose.rotationY * Math.PI / 180;
  const wall = equipment.placement !== "table";

  // In the upright room the detector is on the patient's -Z side. The model's
  // anterior surface is +Z, so a PA projection requires a 180° yaw to place
  // the anterior surface against/facing the receptor. AP remains at 0°.
  // Table examinations are kept supine/tabletop; AP/PA of an individual part
  // is handled by the part positioning rather than rotating the whole patient.
  const projectionCode = projection.shortName.trim().toUpperCase().split(/[ .-]/)[0];
  const projectionYaw = wall && projectionCode === "PA" ? Math.PI : 0;

  let position: V3;
  let rotation: V3;
  if (wall) {
    const floorY = equipment.placement === "seated" ? 0.38 : 0;
    const requestedY = floorY + equipment.patientY;
    const floorLockedY = equipment.placement === "seated" ? requestedY : Math.max(floorY - footSole, requestedY);
    position = [equipment.patientX, floorLockedY, (equipment.placement === "upright-bucky" ? -0.48 : -0.32) + equipment.patientZ];
    rotation = [0, projectionYaw + yaw, 0];
  } else {
    const tableTop = equipment.tableHeight + 0.075;
    position = [equipment.tableX + equipment.patientX, tableTop + bodyThickness + equipment.patientY, equipment.tableZ + H * 0.5 + equipment.patientZ];
    rotation = [-Math.PI / 2, 0, yaw];
  }

  return (
    <group position={position} rotation={rotation}>
      <group rotation={[kyphosis, oblique, 0]} scale={scale}>
        {children}
      </group>
    </group>
  );
}
