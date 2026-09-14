import type { Patient, Projection, TubeState } from "./types";
import type { ProjectionGeometry } from "./projection-physics";
import { projectAtlasSkeletalOD } from "./atlas-skeletal-projector";
import { projectAtlasTissueOD } from "./atlas-tissue-projector";
import { linearAttenuation } from "./nist-attenuation";

const CANONICAL_W_CM=60;
const CANONICAL_H_CM=180;
const CANONICAL_CR_Y_CM=85;
const REFERENCE_KVP=80;
const BASE_WIDTH=448;
const BASE_HEIGHT=1344;
const MAX_CACHE_ENTRIES=3;
const MAX_VIEW_CACHE_ENTRIES=6;
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

/**
 * Keep dedicated chest views clinically framed even when a stored/default field
 * is too generous. In the atlas coordinate system 0 cm is the vertex and the
 * thorax runs approximately C7 (22 cm) to the costophrenic recesses (54 cm).
 * User collimation can still be tightened inside this range, but cannot drift up
 * far enough to include the mandible or down into the mid abdomen.
 */
function clinicallyFramedTube(tube:TubeState,projection:Projection):TubeState{
  if(projection.id!=="pa-chest"&&projection.id!=="lat-chest")return tube;
  const requestedTop=tube.crY-tube.collimationH*.5,requestedBottom=tube.crY+tube.collimationH*.5;
  const top=Math.max(21.0,requestedTop),bottom=Math.min(54.5,requestedBottom);
  const safeTop=Math.min(top,bottom-8),safeBottom=Math.max(bottom,safeTop+8);
  return{...tube,crY:(safeTop+safeBottom)*.5,collimationH:safeBottom-safeTop};
}

function applyFrontalThoraxMaterial(src:Float32Array|null,width:number,height:number,tube:TubeState,geometry:ProjectionGeometry,projection:Projection){
  if(!src||projection.anatomy==="torso-lat")return src;
  const out=new Float32Array(src);
  for(let py=0;py<height;py++){
    const y=tube.crY+((py+.5)/height-.5)*tube.collimationH/geometry.magnification;
    // Atlas coordinates are measured downwards from the vertex. The previous
    // 108-154 cm window was in the lower limbs, so the lung correction never
    // touched the thorax. Apply it from the apices/C7 region to the diaphragms.
    const vertical=smoothstep(21.5,24.5,y)*(1-smoothstep(49.0,54.0,y));
    if(vertical<=0)continue;
    for(let px=0;px<width;px++){
      const i=py*width+px,original=src[i]!;
      if(original<.001)continue;
      const x=tube.crX+((px+.5)/width-.5)*tube.collimationW/geometry.magnification;
      const ax=Math.abs(x);
      const lateral=smoothstep(2.6,5.0,ax)*(1-smoothstep(14.0,17.5,ax));
      if(lateral<=0)continue;
      const lower=smoothstep(34,48,y),heartCentre=2.0,heartHalf=3.8+3.0*lower;
      const heart=Math.max(0,1-Math.abs(x-heartCentre)/heartHalf)*smoothstep(30,34,y)*(1-smoothstep(47,52,y));
      const mediastinum=Math.max(0,1-ax/4.2)*smoothstep(23,27,y)*(1-smoothstep(47,51,y));
      const aeration=vertical*lateral*(1-.78*Math.max(heart,mediastinum));
      // Replace most of the soft-tissue path in aerated lung rather than
      // painting a dark overlay. Keep a physical residual for chest wall,
      // vessels and superimposed structures.
      const floor=Math.max(.0045,original*.16);
      out[i]=Math.max(floor,original*(1-.82*aeration));
    }
  }
  return out;
}

function localMean(src:Float32Array,width:number,height:number,x:number,y:number,radius:number){let sum=0,weight=0;for(let dy=-radius;dy<=radius;dy++){const yy=Math.max(0,Math.min(height-1,y+dy));for(let dx=-radius;dx<=radius;dx++){const xx=Math.max(0,Math.min(width-1,x+dx)),w=radius+1-Math.max(Math.abs(dx),Math.abs(dy));sum+=src[yy*width+xx]!*w;weight+=w;}}return weight?sum/weight:0;}

function refineWholeBodyBone(src:Float32Array|null,width:number,height:number,tube:TubeState,geometry:ProjectionGeometry,projection:Projection){
  if(!src||projection.id!=="ap-full-body")return src;
  const out=new Float32Array(src.length);
  for(let py=0;py<height;py++){
    const y=tube.crY+((py+.5)/height-.5)*tube.collimationH/geometry.magnification;
    for(let px=0;px<width;px++){
      const i=py*width+px,v=src[i]!,near=localMean(src,width,height,px,py,1),broad=localMean(src,width,height,px,py,3);
      if(v<=.0005&&broad<=.0015)continue;
      const x=tube.crX+((px+.5)/width-.5)*tube.collimationW/geometry.magnification,ax=Math.abs(x),edgeExcess=Math.max(0,v-near);
      let scale=1-.28*smoothstep(.014,.10,edgeExcess);
      // Correct coordinate ranges: thorax is ~22-55 cm from the vertex and the
      // skull is the first ~20 cm. Suppress stacked thoracic cortical spikes,
      // not the legs as the old 108-157 cm ranges inadvertently did.
      const thorax=smoothstep(21,25,y)*(1-smoothstep(51,56,y)),centralThorax=thorax*(1-smoothstep(12.5,17.5,ax));
      scale*=1-.12*centralThorax*smoothstep(.020,.10,broad);
      const skull=1-smoothstep(17,22,y);scale*=1-.08*skull*smoothstep(.028,.14,edgeExcess);
      // A projection radiograph contains attenuation through the entire bone
      // volume. Re-introduce a restrained low-frequency component inside thin
      // cortical outlines so shafts and flat bones do not render as wireframes.
      const supportedFill=Math.min(.055,broad*(skull?.42:.34));
      const fine=Math.max(-.010,Math.min(.010,v-near))*.10;
      out[i]=Math.max(0,Math.max(v*scale,supportedFill)+fine);
    }
  }
  return out;
}

export async function canonicalAtlasProjection(args:{patient:Patient;projection:Projection;tube:TubeState;exposureKvp:number;width:number;height:number;geometry:ProjectionGeometry;}){
  const{patient,projection,tube,exposureKvp,width,height,geometry}=args,framedTube=clinicallyFramedTube(tube,projection),baseKey=canonicalKey(patient,projection),viewKey=[baseKey,projection.id,exposureKvp,width,height,framedTube.crX.toFixed(3),framedTube.crY.toFixed(3),framedTube.collimationW.toFixed(3),framedTube.collimationH.toFixed(3),geometry.magnification.toFixed(5)].join("|");
  const cached=VIEW_CACHE.get(viewKey);if(cached){touchView(viewKey,cached);return cached;}
  const maps=await canonicalMaps({patient,projection,tube:framedTube,geometry});
  const tissueScale=linearAttenuation("soft",exposureKvp)/linearAttenuation("soft",REFERENCE_KVP),boneNow=.68*linearAttenuation("corticalBone",exposureKvp)+.32*linearAttenuation("trabecularBone",exposureKvp),boneRef=.68*linearAttenuation("corticalBone",REFERENCE_KVP)+.32*linearAttenuation("trabecularBone",REFERENCE_KVP),boneScale=boneNow/boneRef;
  const croppedTissue=cropCanonical(maps.tissue,maps.width,maps.height,framedTube,geometry,width,height,tissueScale);
  const materialCorrected=applyFrontalThoraxMaterial(croppedTissue,width,height,framedTube,geometry,projection);
  const tissue=suppressProceduralFallback(materialCorrected);
  const croppedBone=cropCanonical(maps.bone,maps.width,maps.height,framedTube,geometry,width,height,boneScale),bone=refineWholeBodyBone(croppedBone,width,height,framedTube,geometry,projection);
  const result={bone,tissue};touchView(viewKey,result);return result;
}
