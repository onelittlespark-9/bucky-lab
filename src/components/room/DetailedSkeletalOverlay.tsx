import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { DetailedSkeletalLayer } from "./DetailedSkeletalLayer";
import type { V3 } from "@/lib/sim/patient-kinematics";

export function DetailedSkeletalOverlay() {
  const patientId = useSim(s => s.patientId);
  const projectionId = useSim(s => s.projectionId);
  const pose = useSim(s => s.pose);
  const equipment = useSim(s => s.equipment);
  const exposing = useSim(s => s.exposing);
  const visible = useSim(s => s.anatomyVisibility.skeleton);
  const patient = patientById(patientId);
  if (!visible) return null;

  const H = patient.heightCm / 100;
  const s = H / 1.7;
  const bodyThickness = Math.max(.13 * s, .12 * patient.morph.torsoDepth * s * 1.05);
  const footRadiusY = .045 * s;
  const footSole = .055 * H - .012 * s - footRadiusY;
  const kyphosis = patient.morph.kyphosis * .22;
  const oblique = pose.oblique * Math.PI / 180;
  const yaw = pose.rotationY * Math.PI / 180;
  const wall = equipment.placement !== "table";
  let groupPos: V3;
  let groupRot: V3;
  if (wall) {
    const floorY = equipment.placement === "seated" ? .38 : 0;
    const requestedY = floorY + equipment.patientY;
    const floorLockedY = equipment.placement === "seated" ? requestedY : Math.max(floorY - footSole, requestedY);
    groupPos = [equipment.patientX, floorLockedY, (equipment.placement === "upright-bucky" ? -.48 : -.32) + equipment.patientZ];
    groupRot = [0, yaw, 0];
  } else {
    const tableTop = equipment.tableHeight + .075;
    groupPos = [equipment.tableX + equipment.patientX, tableTop + bodyThickness + equipment.patientY, equipment.tableZ + H * .5 + equipment.patientZ];
    groupRot = [-Math.PI / 2, 0, yaw];
  }
  const sharedPose = { elbowFlex: pose.elbowFlex, hipInternal: pose.hipInternal, armRaise: pose.armRaise, shoulderRoll: pose.shoulderRoll, kneeFlex: pose.kneeFlex };
  return <group position={groupPos} rotation={groupRot}>
    <group rotation={[kyphosis, oblique, 0]}>
      <DetailedSkeletalLayer H={H} s={s} torsoWidth={patient.morph.torsoWidth} torsoDepth={patient.morph.torsoDepth} shoulder={patient.morph.shoulder} hip={patient.morph.hip} patientMorph={{ limb: patient.morph.limb }} pose={sharedPose} projectionId={projectionId} placement={equipment.placement} buckyTilt={equipment.buckyTilt} opacity={exposing ? .96 : .34} />
    </group>
  </group>;
}
