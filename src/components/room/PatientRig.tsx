import { type ReactNode } from "react";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { projectionById } from "@/lib/sim/projections";
import type { V3 } from "@/lib/sim/patient-kinematics";

/**
 * Single scene-space transform for every patient layer.
 *
 * Anatomical components are responsible only for their internal height/pose
 * geometry. This rig owns the patient's room placement and projection
 * orientation. Nothing anatomical gets a second independent world transform.
 */
export function PatientRig({ children }: { children: ReactNode }) {
  const patientId = useSim(s => s.patientId);
  const projectionId = useSim(s => s.projectionId);
  const pose = useSim(s => s.pose);
  const equipment = useSim(s => s.equipment);
  const patient = patientById(patientId);
  const projection = projectionById(projectionId);
  const H = patient.heightCm / 100;
  const bodyThickness = Math.max(0.13 * (H / 1.7), 0.12 * patient.morph.torsoDepth * (H / 1.7) * 1.05);
  const footRadiusY = 0.045 * (H / 1.7);
  const footSole = 0.055 * H - 0.012 * (H / 1.7) - footRadiusY;
  const kyphosis = patient.morph.kyphosis * 0.22;
  const oblique = pose.oblique * Math.PI / 180;
  const yaw = pose.rotationY * Math.PI / 180;
  const wall = equipment.placement !== "table";

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
      <group rotation={[kyphosis, oblique, 0]}>
        {children}
      </group>
    </group>
  );
}
