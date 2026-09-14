import type { Patient, Projection, SimPose, TubeState } from "./types";
import type { ProjectionGeometry } from "./projection-physics";
import { projectAtlasSkeletalOD } from "./atlas-skeletal-projector";
import { materialOpticalDepth } from "./nist-attenuation";

/**
 * Compatibility facade for legacy HU-shaped procedural paths. HU ranges are
 * mapped to physical materials, then evaluated through the full polychromatic
 * spectrum. No fixed grayscale or single effective-energy mu is used here.
 */
export function opticalDepthFromHU(hu:number,pathCm:number,kvp:number):number{
  if(pathCm<=0)return 0;
  if(hu<=-950)return materialOpticalDepth("air",pathCm,kvp);
  if(hu<=-300)return materialOpticalDepth("inflatedLung",pathCm,kvp);
  if(hu<=-30)return materialOpticalDepth("adipose",pathCm,kvp);
  if(hu<300)return materialOpticalDepth("soft",pathCm,kvp);
  if(hu<1000)return materialOpticalDepth("trabecularBone",pathCm,kvp);
  if(hu<2000)return materialOpticalDepth("corticalBone",pathCm,kvp);
  return materialOpticalDepth("metal",pathCm,kvp);
}

/** Non-canonical projections delegate to the unified skeletal projector. */
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
  return projectAtlasSkeletalOD({...args,wholeBody:false});
}
