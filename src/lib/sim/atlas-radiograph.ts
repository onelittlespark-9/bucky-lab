import type { Patient, Projection, SimPose, TubeState } from "./types";
import type { ProjectionGeometry } from "./projection-physics";
import { projectAtlasSkeletalOD } from "./atlas-skeletal-projector";
import { linearAttenuation, materialOpticalDepth } from "./nist-attenuation";

/**
 * Compatibility facade for the renderer's legacy HU-shaped procedural paths.
 * Attenuation coefficients live in nist-attenuation.ts only. New code should
 * prefer materialOpticalDepth() so path length is evaluated through the
 * polychromatic spectrum rather than treating kVp as a monochromatic energy.
 */
export function muFromHU(hu:number,kvp:number):number{
  if(hu<=-950)return linearAttenuation("air",kvp);
  if(hu<=-300)return linearAttenuation("inflatedLung",kvp);
  if(hu<=-30)return linearAttenuation("adipose",kvp);
  if(hu<300)return linearAttenuation("soft",kvp);
  if(hu<1000)return linearAttenuation("trabecularBone",kvp);
  if(hu<2000)return linearAttenuation("corticalBone",kvp);
  const excess=Math.max(0,Math.min(2000,hu-2000))/1000;
  return linearAttenuation("corticalBone",kvp)*(2.2+1.8*excess);
}

export function opticalDepthFromHU(hu:number,pathCm:number,kvp:number):number{
  if(pathCm<=0)return 0;
  if(hu<=-950)return materialOpticalDepth("air",pathCm,kvp);
  if(hu<=-300)return materialOpticalDepth("inflatedLung",pathCm,kvp);
  if(hu<=-30)return materialOpticalDepth("adipose",pathCm,kvp);
  if(hu<300)return materialOpticalDepth("soft",pathCm,kvp);
  if(hu<1000)return materialOpticalDepth("trabecularBone",pathCm,kvp);
  if(hu<2000)return materialOpticalDepth("corticalBone",pathCm,kvp);
  const excess=Math.max(0,Math.min(2000,hu-2000))/1000;
  return materialOpticalDepth("corticalBone",pathCm,kvp)*(2.2+1.8*excess);
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
