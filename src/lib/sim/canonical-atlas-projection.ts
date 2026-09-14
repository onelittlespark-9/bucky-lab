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
const MAX_CACHE_ENTRIES=6;
const MAX_VIEW_CACHE_ENTRIES=12;
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
function suppressProceduralFallback(src:Float32Array|null){if(!src)return null;const out=new Float32Array(src.length);for(let i=0;i<src.length;i++)out[i]=Math.max(.00026,src[i]!);return out;}
function smoothstep(a:number,b:number,v:number){const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);}

// The atlas respiratory meshes currently under-report usable front/back depth in frontal projection.
// Correct material composition only inside the existing atlas body support: geometry/silhouette still comes from the atlas.
// This is deliberately not a contrast operation. It removes soft-tissue optical depth where an inflated lung would replace it,
// while preserving a central mediastinum, cardiac overlap and denser basal/diaphragmatic transition.
function applyFrontalThoraxMaterial(src:Float32Array|null,width:number,height:number,tube:TubeState,geometry:ProjectionGeometry,projection:Projection){
  if(!src||projection.anatomy==="torso-lat")return src;
  const out=new Float32Array(src);
  for(let py=0;py<height;py++){
    const y=tube.crY+((py+.5)/height-.5)*tube.collimationH/geometry.magnification;
    const vertical=smoothstep(108,118,y)*(1-smoothstep(148,154,y));
    if(vertical<=0)continue;
    const baseTaper=1-.58*smoothstep(108,119,y);
    for(let px=0;px<width;px++){
      const i=py*width+px,original=src[i]!;
      if(original<.008)continue;
      const x=tube.crX+((px+.5)/width-.5)*tube.collimationW/geometry.magnification;
      const ax=Math.abs(x);
      const lateral=smoothstep(2.8,6.2,ax)*(1-smoothstep(16.5,20.5,ax));
      if(lateral<=0)continue;
      const inferior=1-smoothstep(128,145,y),heartCentre=-2.1,heartHalf=5.0+4.0*inferior;
      const heart=Math.max(0,1-Math.abs(x-heartCentre)/heartHalf)*smoothstep(111,121,y)*(1-smoothstep(137,149,y));
      const mediastinum=Math.max(0,1-ax/5.2);
      const aeration=vertical*lateral*baseTaper*(1-.72*Math.max(heart,mediastinum));
      const floor=Math.max(.010,original*.24);
      out[i]=Math.max(floor,original*(1-.70*aeration));
    }
  }
  return out;
}

function localMean(src:Float32Array,width:number,height:number,x:number,y:number,radius:number){let sum=0,weight=0;for(let dy=-radius;dy<=radius;dy++){const yy=Math.max(0,Math.min(height-1,y+dy));for(let dx=-radius;dx<=radius;dx++){const xx=Math.max(0,Math.min(width-1,x+dx)),w=radius+1-Math.max(Math.abs(dx),Math.abs(dy));sum+=src[yy*width+xx]!*w;weight+=w;}}return weight?sum/weight:0;}

// Whole-body atlas bone already contains cortical/trabecular/marrow modelling. This pass only corrects the presentation failure
// seen in the clinical review: isolated cortical rims read as uniformly white line art while ribs/spine stack too densely.
// It is local and anatomy-preserving: no synthetic bones are added and low-density medullary/trabecular interiors are not filled in.
function refineWholeBodyBone(src:Float32Array|null,width:number,height:number,tube:TubeState,geometry:ProjectionGeometry,projection:Projection){
  if(!src||projection.id!=="ap-full-body")return src;
  const out=new Float32Array(src);
  for(let py=0;py<height;py++){
    const y=tube.crY+((py+.5)/height-.5)*tube.collimationH/geometry.magnification;
    for(let px=0;px<width;px++){
      const i=py*width+px,v=src[i]!;if(v<=.0005)continue;
      const x=tube.crX+((px+.5)/width-.5)*tube.collimationW/geometry.magnification,ax=Math.abs(x),near=localMean(src,width,height,px,py,1),broad=localMean(src,width,height,px,py,3),edgeExcess=Math.max(0,v-near);
      let scale=1-.24*smoothstep(.018,.12,edgeExcess);
      const thorax=smoothstep(108,116,y)*(1-smoothstep(151,157,y)),centralThorax=thorax*(1-smoothstep(12.5,18.5,ax));
      scale*=1-.14*centralThorax*smoothstep(.025,.12,broad);
      const skull=smoothstep(151,158,y);scale*=1-.07*skull*smoothstep(.035,.16,edgeExcess);
      const distal=(1-smoothstep(28,42,y))+smoothstep(72,92,y)*(1-smoothstep(8,13,ax));
      const fine=v-near,detail=distal*Math.max(-.012,Math.min(.012,fine))*.16;
      out[i]=Math.max(0,v*scale+detail);
    }
  }
  return out;
}

export async function canonicalAtlasProjection(args:{patient:Patient;projection:Projection;tube:TubeState;exposureKvp:number;width:number;height:number;geometry:ProjectionGeometry;}){
  const{patient,projection,tube,exposureKvp,width,height,geometry}=args,baseKey=canonicalKey(patient,projection),viewKey=[baseKey,projection.id,exposureKvp,width,height,tube.crX.toFixed(3),tube.crY.toFixed(3),tube.collimationW.toFixed(3),tube.collimationH.toFixed(3),geometry.magnification.toFixed(5)].join("|");
  const cached=VIEW_CACHE.get(viewKey);if(cached){touchView(viewKey,cached);return cached;}
  const maps=await canonicalMaps({patient,projection,tube,geometry});
  const tissueScale=linearAttenuation("soft",exposureKvp)/linearAttenuation("soft",REFERENCE_KVP),boneNow=.68*linearAttenuation("corticalBone",exposureKvp)+.32*linearAttenuation("trabecularBone",exposureKvp),boneRef=.68*linearAttenuation("corticalBone",REFERENCE_KVP)+.32*linearAttenuation("trabecularBone",REFERENCE_KVP),boneScale=boneNow/boneRef;
  const croppedTissue=cropCanonical(maps.tissue,maps.width,maps.height,tube,geometry,width,height,tissueScale);
  const materialCorrected=applyFrontalThoraxMaterial(croppedTissue,width,height,tube,geometry,projection);
  const tissue=suppressProceduralFallback(materialCorrected);
  const croppedBone=cropCanonical(maps.bone,maps.width,maps.height,tube,geometry,width,height,boneScale),bone=refineWholeBodyBone(croppedBone,width,height,tube,geometry,projection);
  const result={bone,tissue};touchView(viewKey,result);return result;
}
