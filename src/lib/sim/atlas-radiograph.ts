import type { Patient, Projection, SimPose, TubeState } from "./types";
import type { ProjectionGeometry } from "./projection-physics";
import { projectAtlasSkeletalOD } from "./atlas-skeletal-projector";
import { linearAttenuation } from "./nist-attenuation";

/**
 * Compatibility facade for the renderer's legacy HU-shaped procedural paths.
 *
 * IMPORTANT: attenuation coefficients live in nist-attenuation.ts only.  This
 * function deliberately contains no independent X-ray attenuation table; it
 * maps the small set of legacy HU bands used by render-radiograph.ts onto the
 * canonical NIST/ICRU material model.  New renderer code should use
 * linearAttenuation()/materialOpticalDepth() directly rather than add another
 * HU or radiograph-specific coefficient table here.
 */
export function muFromHU(hu:number,kvp:number):number{
  if(hu<=-950)return linearAttenuation("air",kvp);
  if(hu<=-300)return linearAttenuation("inflatedLung",kvp);
  if(hu<=-30)return linearAttenuation("adipose",kvp);
  if(hu<300)return linearAttenuation("soft",kvp);
  if(hu<1000)return linearAttenuation("trabecularBone",kvp);
  if(hu<2000)return linearAttenuation("corticalBone",kvp);
  // Metal is a simulator/device fallback rather than a biological material.
  // Anchor it to the canonical cortical-bone curve instead of maintaining a
  // second energy-dependent coefficient table.
  const excess=Math.max(0,Math.min(2000,hu-2000))/1000;
  return linearAttenuation("corticalBone",kvp)*(2.2+1.8*excess);
}

/**
 * Non-canonical projections delegate to the same skeletal projector used by
 * canonical views.  This wrapper exists only to preserve the current renderer
 * API while the procedural fallback path is retired.
 */
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
