import type {Patient,Projection,SimPose,TubeState,RoomEquipment} from "./types";
import type {ProjectionGeometry} from "./projection-physics";
import type {MaterialPath} from "./nist-attenuation";
import type {CtVolume} from "../ct/ct-volume";
import {loadCtVolume} from "../ct/ct-volume";
import {integrateCtVolume} from "./hu-volume-projector";
export type V3=readonly[number,number,number];
export interface PatientWorldTransform{position:V3;rotation:V3;deformation:V3;}
/** Single owner of anatomy used by room, CT and radiographic projection. */
export interface PatientAnatomy{id:string;kind:"ct-volume"|"atlas-mesh";ct?:CtVolume;source:string;}
const anatomyCache=new Map<string,Promise<PatientAnatomy|null>>();
export async function loadPatientAnatomy(patient:Patient,caseId?:string|null):Promise<PatientAnatomy|null>{const id=caseId||patient.id,key=`${patient.id}:${id}`;let p=anatomyCache.get(key);if(p)return p;p=(async()=>{const ct=await loadCtVolume(id);return ct?{id,kind:"ct-volume",ct,source:ct.manifest.source?.name??"CT volume"}:null;})();anatomyCache.set(key,p);return p;}
export function patientWorldTransform(patient:Patient,projection:Projection,pose:SimPose,equipment:RoomEquipment):PatientWorldTransform{const H=patient.heightCm/100,bodyThickness=Math.max(.13*(H/1.7),.12*patient.morph.torsoDepth*(H/1.7)*1.05),footRadiusY=.045*(H/1.7),footSole=.055*H-.012*(H/1.7)-footRadiusY,kyphosis=patient.morph.kyphosis*.22,oblique=pose.oblique*Math.PI/180,yaw=pose.rotationY*Math.PI/180,wall=equipment.placement!=="table",projectionCode=projection.shortName.trim().toUpperCase().split(/[ .-]/)[0],projectionYaw=wall&&projectionCode==="PA"?Math.PI:0;let position:V3,rotation:V3;if(wall){const floorY=equipment.placement==="seated"?.38:0,requestedY=floorY+equipment.patientY,floorLockedY=equipment.placement==="seated"?requestedY:Math.max(floorY-footSole,requestedY);position=[equipment.patientX,floorLockedY,(equipment.placement==="upright-bucky"?-.48:-.32)+equipment.patientZ];rotation=[0,projectionYaw+yaw,0];}else{const tableTop=equipment.tableHeight+.075;position=[equipment.tableX+equipment.patientX,tableTop+bodyThickness+equipment.patientY,equipment.tableZ+H*.5+equipment.patientZ];rotation=[-Math.PI/2,0,yaw];}return{position,rotation,deformation:[kyphosis,oblique,0]};}
function rotateY(x:number,z:number,degrees:number){const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return[x*c-z*s,x*s+z*c] as const;}
/** Cone-beam ray through the same patient-space volume used by CT. */
export function projectPatientVolumeRay(args:{anatomy:PatientAnatomy;projection:Projection;pose:SimPose;tube:TubeState;geometry:ProjectionGeometry;detectorXcm:number;detectorYcm:number;}):MaterialPath{const{anatomy,pose,tube,detectorXcm,detectorYcm}=args;if(!anatomy.ct)throw new Error("Patient anatomy has no projectable CT volume");const sourceZ=-Math.max(80,tube.sid/args.geometry.magnification),sourceX=tube.crX,sourceY=tube.crY;const[ox,oz]=rotateY(sourceX,sourceZ,-pose.rotationY),[dx,dz]=rotateY(detectorXcm-sourceX,-sourceZ,-pose.rotationY);return integrateCtVolume(anatomy.ct,{originCm:[ox,sourceY,oz],direction:[dx,detectorYcm-sourceY,dz]});}
