import type { Patient, Projection, TubeState } from "./types";
import type { ProjectionGeometry } from "./projection-physics";
import { projectAtlasSkeletalOD } from "./atlas-skeletal-projector";
import { projectAtlasTissueOD } from "./atlas-tissue-projector";
import { linearAttenuation } from "./nist-attenuation";

const CANONICAL_W_CM=60;
const CANONICAL_H_CM=180;
const CANONICAL_CR_Y_CM=85;
const REFERENCE_KVP=80;
const BASE_WIDTH=640;
const BASE_HEIGHT=1920;
const MAX_CACHE_ENTRIES=4;
const MAX_VIEW_CACHE_ENTRIES=10;
type CanonicalMaps={bone:Float32Array|null;tissue:Float32Array|null;width:number;height:number};
type ViewMaps={bone:Float32Array|null;tissue:Float32Array|null};
const CACHE=new Map<string,Promise<CanonicalMaps>>();
const VIEW_CACHE=new Map<string,ViewMaps>();

export function usesCanonicalAtlasProjection(projection:Projection){
  return projection.id==="pa-chest"||projection.id==="ap-full-body"||projection.anatomy==="torso-ap"||projection.anatomy==="torso-lat"||projection.anatomy==="shoulder-ap";
}

function sampleBilinear(src:Float32Array,sw:number,sh:number,u:number,v:number){if(u<0||v<0||u>sw-1||v>sh-1)return 0;const x0=Math.floor(u),y0=Math.floor(v),x1=Math.min(sw-1,x0+1),y1=Math.min(sh-1,y0+1),fx=u-x0,fy=v-y0,a=src[y0*sw+x0]!,b=src[y0*sw+x1]!,c=src[y1*sw+x0]!,d=src[y1*sw+x1]!;return a*(1-fx)*(1-fy)+b*fx*(1-fy)+c*(1-fx)*fy+d*fx*fy;}
function patientKey(patient:Patient){return[patient.id,patient.heightCm,patient.weightKg,patient.habitus,JSON.stringify(patient.morph)].join("|");}
function projectionFamily(projection:Projection){return projection.anatomy==="torso-lat"||projection.anatomy==="cspine-lat"||projection.anatomy==="skull-lat"?"lateral":"frontal";}
function canonicalKey(patient:Patient,projection:Projection){return`${patientKey(patient)}|${projectionFamily(projection)}`;}
function touchCache(key:string,pending:Promise<CanonicalMaps>){CACHE.delete(key);CACHE.set(key,pending);while(CACHE.size>MAX_CACHE_ENTRIES){const oldest=CACHE.keys().next().value as string|undefined;if(!oldest)break;CACHE.delete(oldest);for(const viewKey of VIEW_CACHE.keys())if(viewKey.startsWith(`${oldest}|`))VIEW_CACHE.delete(viewKey);}}
function touchView(key:string,value:ViewMaps){VIEW_CACHE.delete(key);VIEW_CACHE.set(key,value);while(VIEW_CACHE.size>MAX_VIEW_CACHE_ENTRIES){const oldest=VIEW_CACHE.keys().next().value as string|undefined;if(!oldest)break;VIEW_CACHE.delete(oldest);}}

async function canonicalMaps(args:{patient:Patient;projection:Projection;tube:TubeState;geometry:ProjectionGeometry;}){
  const{patient,projection,tube,geometry}=args,key=canonicalKey(patient,projection);
  const existing=CACHE.get(key);if(existing){touchCache(key,existing);return existing;}
  const canonicalTube:TubeState={...tube,crX:0,crY:CANONICAL_CR_Y_CM,collimationW:CANONICAL_W_CM,collimationH:CANONICAL_H_CM};
  const objectGeometry:ProjectionGeometry={...geometry,magnification:1,effectiveObjectScale:1};
  const pending=Promise.all([
    projectAtlasSkeletalOD({patient,projection,tube:canonicalTube,exposureKvp:REFERENCE_KVP,width:BASE_WIDTH,height:BASE_HEIGHT,geometry:objectGeometry,wholeBody:true}),
    projectAtlasTissueOD({patient,projection,tube:canonicalTube,exposureKvp:REFERENCE_KVP,width:BASE_WIDTH,height:BASE_HEIGHT,geometry:objectGeometry,wholeBody:true}),
  ]).then(([bone,tissue])=>({bone,tissue,width:BASE_WIDTH,height:BASE_HEIGHT})).catch(err=>{CACHE.delete(key);throw err;});
  touchCache(key,pending);return pending;
}

function cropCanonical(src:Float32Array|null,sw:number,sh:number,tube:TubeState,geometry:ProjectionGeometry,width:number,height:number,scale:number){if(!src)return null;const out=new Float32Array(width*height);for(let py=0;py<height;py++){const cmY=((py+.5)/height-.5)*tube.collimationH/geometry.magnification,globalY=tube.crY+cmY,v=(globalY/CANONICAL_H_CM)*(sh-1);for(let px=0;px<width;px++){const cmX=((px+.5)/width-.5)*tube.collimationW/geometry.magnification,globalX=tube.crX+cmX,u=(.5+globalX/CANONICAL_W_CM)*(sw-1);out[py*width+px]=sampleBilinear(src,sw,sh,u,v)*scale;}}return out;}

export async function canonicalAtlasProjection(args:{patient:Patient;projection:Projection;tube:TubeState;exposureKvp:number;width:number;height:number;geometry:ProjectionGeometry;}){
  const{patient,projection,tube,exposureKvp,width,height,geometry}=args,baseKey=canonicalKey(patient,projection),viewKey=[baseKey,projection.id,exposureKvp,width,height,tube.crX.toFixed(3),tube.crY.toFixed(3),tube.collimationW.toFixed(3),tube.collimationH.toFixed(3),geometry.magnification.toFixed(5)].join("|");
  const cached=VIEW_CACHE.get(viewKey);if(cached){touchView(viewKey,cached);return cached;}
  const maps=await canonicalMaps({patient,projection,tube,geometry});
  const tissueScale=linearAttenuation("soft",exposureKvp)/linearAttenuation("soft",REFERENCE_KVP),boneNow=.68*linearAttenuation("corticalBone",exposureKvp)+.32*linearAttenuation("trabecularBone",exposureKvp),boneRef=.68*linearAttenuation("corticalBone",REFERENCE_KVP)+.32*linearAttenuation("trabecularBone",REFERENCE_KVP),boneScale=boneNow/boneRef;
  // The current atlas soft-tissue depth projection produces faceted surface-mesh slabs in chest views. Preserve its skeletal geometry, but use the dedicated procedural tissue path for frontal and lateral chest/full-body projections until tissue integration is genuinely volumetric.
  const preferProceduralTissue=projection.id==="pa-chest"||projection.id==="ap-full-body"||projection.anatomy==="torso-lat";
  const result={bone:cropCanonical(maps.bone,maps.width,maps.height,tube,geometry,width,height,boneScale),tissue:preferProceduralTissue?null:cropCanonical(maps.tissue,maps.width,maps.height,tube,geometry,width,height,tissueScale)};touchView(viewKey,result);return result;
}
