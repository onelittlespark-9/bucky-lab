import type { Patient, Projection, TubeState } from "./types";
import type { ProjectionGeometry } from "./projection-physics";
import { projectAtlasSkeletalOD } from "./atlas-skeletal-projector";

export async function wholeBodyAtlasOpticalDensity(args:{
  patient:Patient;
  projection:Projection;
  tube:TubeState;
  exposureKvp:number;
  width:number;
  height:number;
  geometry:ProjectionGeometry;
}):Promise<Float32Array|null>{
  return projectAtlasSkeletalOD({
    ...args,
    wholeBody:true,
  });
}
