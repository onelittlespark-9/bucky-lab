import { type ReactNode } from "react";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { projectionById } from "@/lib/sim/projections";
import { patientWorldTransform } from "@/lib/sim/patient-anatomy";
/** Room view now consumes the same patient-space/world transform contract as projection anatomy. */
export function PatientRig({children}:{children:ReactNode}){
 const patientId=useSim(s=>s.patientId),projectionId=useSim(s=>s.projectionId),pose=useSim(s=>s.pose),equipment=useSim(s=>s.equipment),patient=patientById(patientId),projection=projectionById(projectionId),t=patientWorldTransform(patient,projection,pose,equipment);
 return <group position={[...t.position]} rotation={[...t.rotation]}><group rotation={[...t.deformation]}>{children}</group></group>;
}
