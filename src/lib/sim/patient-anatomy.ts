import type {Patient,Projection,SimPose,TubeState} from "./types";
import type {ProjectionGeometry} from "./projection-physics";
import type {MaterialPath} from "./nist-attenuation";
import type {CtVolume} from "../ct/ct-volume";
import {loadCtVolume} from "../ct/ct-volume";
import {integrateCtVolume} from "./hu-volume-projector";

/**
 * Single source-of-truth contract for anatomy used by positioning, CT and projection.
 * New production projection code must depend on this interface rather than importing
 * procedural 2-D anatomy samplers directly.
 */
export interface PatientAnatomy{
 id:string;
 kind:"ct-volume"|"atlas-mesh";
 ct?:CtVolume;
 source:string;
}

const anatomyCache=new Map<string,Promise<PatientAnatomy|null>>();
export async function loadPatientAnatomy(patient:Patient,caseId?:string|null):Promise<PatientAnatomy|null>{
 const id=caseId||patient.id,key=`${patient.id}:${id}`;let p=anatomyCache.get(key);if(p)return p;
 p=(async()=>{const ct=await loadCtVolume(id);return ct?{id,kind:"ct-volume",ct,source:ct.manifest.source?.name??"CT volume"}:null;})();
 anatomyCache.set(key,p);return p;
}

function rotateY(x:number,z:number,degrees:number){const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return[x*c-z*s,x*s+z*c] as const;}

/** Cone-beam ray through the SAME patient-space volume used by CT. Patient rotation is
 * applied by inverse-transforming the source and detector ray into patient coordinates. */
export function projectPatientVolumeRay(args:{anatomy:PatientAnatomy;projection:Projection;pose:SimPose;tube:TubeState;geometry:ProjectionGeometry;detectorXcm:number;detectorYcm:number;}):MaterialPath{
 const{anatomy,pose,tube,detectorXcm,detectorYcm}=args;if(!anatomy.ct)throw new Error("Patient anatomy has no projectable CT volume");
 const sourceZ=-Math.max(80,tube.sid/args.geometry.magnification),sourceX=tube.crX,sourceY=tube.crY;
 const[ox,oz]=rotateY(sourceX,sourceZ,-pose.rotationY),[dx,dz]=rotateY(detectorXcm-sourceX,-sourceZ,-pose.rotationY);
 return integrateCtVolume(anatomy.ct,{originCm:[ox,sourceY,oz],direction:[dx,detectorYcm-sourceY,dz]});
}
