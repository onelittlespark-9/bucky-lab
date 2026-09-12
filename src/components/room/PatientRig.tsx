import { type ReactNode } from "react";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { projectionById } from "@/lib/sim/projections";
import type { V3 } from "@/lib/sim/patient-kinematics";

/**
 * Patient-only scene transform. The tabletop and detector have their own transforms.
 *
 * On the table, patientX/patientY/patientZ are offsets RELATIVE to the tabletop,
 * so moving the table carries the patient with it. Changing the patient offsets
 * then moves only the patient relative to that table position.
 */
export function PatientRig({children}:{children:ReactNode}){
 const patientId=useSim(s=>s.patientId),projectionId=useSim(s=>s.projectionId),pose=useSim(s=>s.pose),equipment=useSim(s=>s.equipment),patient=patientById(patientId),projection=projectionById(projectionId),H=patient.heightCm/100,bodyThickness=Math.max(.13*(H/1.7),.12*patient.morph.torsoDepth*(H/1.7)*1.05),footRadiusY=.045*(H/1.7),footSole=.055*H-.012*(H/1.7)-footRadiusY,kyphosis=patient.morph.kyphosis*.22,oblique=pose.oblique*Math.PI/180,yaw=pose.rotationY*Math.PI/180,wall=equipment.placement!=="table";
 const projectionCode=projection.shortName.trim().toUpperCase().split(/[ .-]/)[0],projectionYaw=wall&&projectionCode==="PA"?Math.PI:0;
 let position:V3;let rotation:V3;
 if(wall){
  const floorY=equipment.placement==="seated"?.38:0,requestedY=floorY+equipment.patientY,floorLockedY=equipment.placement==="seated"?requestedY:Math.max(floorY-footSole,requestedY);
  position=[equipment.patientX,floorLockedY,(equipment.placement==="upright-bucky"?-.48:-.32)+equipment.patientZ];
  rotation=[0,projectionYaw+yaw,0];
 }else{
  // Table coordinates are the parent/reference frame for the patient.
  // Therefore table movement carries the patient; patient offsets remain local.
  const tableTop=equipment.tableHeight+.075;
  position=[
   equipment.tableX+equipment.patientX,
   tableTop+bodyThickness+equipment.patientY,
   equipment.tableZ+H*.5+equipment.patientZ
  ];
  rotation=[-Math.PI/2,0,yaw];
 }
 return <group position={position} rotation={rotation}><group rotation={[kyphosis,oblique,0]}>{children}</group></group>;
}
