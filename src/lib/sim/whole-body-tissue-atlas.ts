import type { Patient, Projection, TubeState } from "./types";
import type { ProjectionGeometry } from "./projection-physics";
import { projectAtlasTissueOD } from "./atlas-tissue-projector";

export async function wholeBodyAtlasTissueOpticalDensity(args:{
  patient:Patient;
  tube:TubeState;
  exposureKvp:number;
  width:number;
  height:number;
  geometry:ProjectionGeometry;
  projection?:Projection;
}):Promise<Float32Array|null>{
  const projection=args.projection??({id:"ap-full-body",name:"AP whole body",shortName:"AP whole body",region:"Whole body",anatomy:"full-body-ap",setup:"wall",recumbency:"erect",irW:60,irH:180,grid:true,sidCm:180,tubeAngle:0,kvp:90,mas:10,collimationW:60,collimationH:180,cr:{x:0,y:85},landmarkId:"",centring:"",position:"",beam:"",collimation:"",criteria:[],include:[]} as Projection);
  return projectAtlasTissueOD({
    patient:args.patient,
    projection,
    tube:args.tube,
    exposureKvp:args.exposureKvp,
    width:args.width,
    height:args.height,
    geometry:args.geometry,
    wholeBody:true,
  });
}
