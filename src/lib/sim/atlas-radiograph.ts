import type { Patient, Projection, SimPose, TubeState } from "./types";
import type { ProjectionGeometry } from "./projection-physics";
import { projectAtlasSkeletalOD } from "./atlas-skeletal-projector";

/**
 * Legacy HU helper retained for the procedural fallback path. Atlas skeletal
 * rendering now uses the same cortical/trabecular/marrow material model in
 * every projection via projectAtlasSkeletalOD().
 */
export function muFromHU(hu:number,kvp:number):number{
  const e=Math.pow(70/Math.max(45,kvp),.28),a=.0003*e,w=.205*e,b=.72*e;
  if(hu<=-1000)return a;
  if(hu<=0)return w+(hu/1000)*(w-a);
  if(hu<=1000)return w+(hu/1000)*(b-w);
  return b+Math.min(1000,hu-1000)*.00018*e;
}

export async function atlasBoneOpticalDensity(args:{
  patient:Patient;
  projection:Projection;
  pose:SimPose;
  tube:TubeState;
  exposureKvp:number;
  width:number;
  height:number;
  geometry:ProjectionGeometry;
}):Promise<Float32Array|null>{
  return projectAtlasSkeletalOD({
    ...args,
    wholeBody:false,
  });
}
