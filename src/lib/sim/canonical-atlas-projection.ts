import type { Patient, Projection, TubeState } from "./types";
import type { ProjectionGeometry } from "./projection-physics";
import { projectAtlasSkeletalPaths, type AtlasSkeletalMaterialPaths } from "./atlas-skeletal-projector";
import { projectAtlasTissuePaths, type AtlasTissueMaterialPaths } from "./atlas-tissue-projector";
import { primaryOpticalDepth } from "./nist-attenuation";

const CANONICAL_W_CM=60;
const CANONICAL_H_CM=180;
const CANONICAL_CR_Y_CM=85;
const BASE_WIDTH=448;
const BASE_HEIGHT=1344;
const MAX_CACHE_ENTRIES=4;
const MAX_VIEW_CACHE_ENTRIES=8;
export interface CanonicalAtlasMaterialMaps{tissue:AtlasTissueMaterialPaths|null;skeletal:AtlasSkeletalMaterialPaths|null;tissueMask:Float32Array|null;}
type CanonicalMaps={tissue:AtlasTissueMaterialPaths|null;skeletal:AtlasSkeletalMaterialPaths|null;width:number;height:number};
const CACHE=new Map<string,Promise<CanonicalMaps>>();
const VIEW_CACHE=new Map<string,CanonicalAtlasMaterialMaps>();

export function usesCanonicalAtlasProjection(projection:Projection){return projection.id==="pa-chest"||projection.id==="ap-full-body"||projection.anatomy==="torso-ap"||projection.anatomy==="torso-lat"||projection.anatomy==="shoulder-ap";}
function sampleBilinear(src:Float32Array,sw:number,sh:number,u:number,v:number){if(u<0||v<0||u>sw-1||v>sh-1)return 0;const x0=Math.floor(u),y0=Math.floor(v),x1=Math.min(sw-1,x0+1),y1=Math.min(sh-1,y0+1),fx=u-x0,fy=v-y0,a=src[y0*sw+x0]!,b=src[y0*sw+x1]!,c=src[y1*sw+x0]!,d=src[y1*sw+x1]!;return a*(1-fx)*(1-fy)+b*fx*(1-fy)+c*(1-fx)*fy+d*fx*fy;}
function patientKey(patient:Patient){return[patient.id,patient.heightCm,patient.weightKg,patient.habitus,JSON.stringify(patient.morph)].join("|");}
function projectionFamily(projection:Projection){return projection.anatomy==="torso-lat"||projection.anatomy==="cspine-lat"||projection.anatomy==="skull-lat"?"lateral":"frontal";}
function canonicalKey(patient:Patient,projection:Projection){return`${patientKey(patient)}|${projectionFamily(projection)}`;}
function touchCache(key:string,pending:Promise<CanonicalMaps>){CACHE.delete(key);CACHE.set(key,pending);while(CACHE.size>MAX_CACHE_ENTRIES){const oldest=CACHE.keys().next().value as string|undefined;if(!oldest)break;CACHE.delete(oldest);for(const viewKey of VIEW_CACHE.keys())if(viewKey.startsWith(`${oldest}|`))VIEW_CACHE.delete(viewKey);}}
function touchView(key:string,value:CanonicalAtlasMaterialMaps){VIEW_CACHE.delete(key);VIEW_CACHE.set(key,value);while(VIEW_CACHE.size>MAX_VIEW_CACHE_ENTRIES){const oldest=VIEW_CACHE.keys().next().value as string|undefined;if(!oldest)break;VIEW_CACHE.delete(oldest);}}
function cropCanonical(src:Float32Array|null,sw:number,sh:number,tube:TubeState,geometry:ProjectionGeometry,width:number,height:number){if(!src)return null;const out=new Float32Array(width*height);for(let py=0;py<height;py++){const cmY=((py+.5)/height-.5)*tube.collimationH/geometry.magnification,globalY=tube.crY+cmY,v=(.5+(globalY-CANONICAL_CR_Y_CM)/CANONICAL_H_CM)*(sh-1);for(let px=0;px<width;px++){const cmX=((px+.5)/width-.5)*tube.collimationW/geometry.magnification,globalX=tube.crX+cmX,u=(.5+globalX/CANONICAL_W_CM)*(sw-1);out[py*width+px]=sampleBilinear(src,sw,sh,u,v);}}return out;}
function cropTissue(src:AtlasTissueMaterialPaths|null,sw:number,sh:number,tube:TubeState,geometry:ProjectionGeometry,width:number,height:number):AtlasTissueMaterialPaths|null{if(!src)return null;return{adipose:cropCanonical(src.adipose,sw,sh,tube,geometry,width,height)!,muscle:cropCanonical(src.muscle,sw,sh,tube,geometry,width,height)!,soft:cropCanonical(src.soft,sw,sh,tube,geometry,width,height)!,inflatedLung:cropCanonical(src.inflatedLung,sw,sh,tube,geometry,width,height)!,blood:cropCanonical(src.blood,sw,sh,tube,geometry,width,height)!,brain:cropCanonical(src.brain,sw,sh,tube,geometry,width,height)!,air:cropCanonical(src.air,sw,sh,tube,geometry,width,height)!};}
function cropSkeletal(src:AtlasSkeletalMaterialPaths|null,sw:number,sh:number,tube:TubeState,geometry:ProjectionGeometry,width:number,height:number):AtlasSkeletalMaterialPaths|null{if(!src)return null;return{corticalBone:cropCanonical(src.corticalBone,sw,sh,tube,geometry,width,height)!,trabecularBone:cropCanonical(src.trabecularBone,sw,sh,tube,geometry,width,height)!,adipose:cropCanonical(src.adipose,sw,sh,tube,geometry,width,height)!,displacedSoft:cropCanonical(src.displacedSoft,sw,sh,tube,geometry,width,height)!};}
function tissueMask(paths:AtlasTissueMaterialPaths|null){if(!paths)return null;const out=new Float32Array(paths.soft.length);for(let i=0;i<out.length;i++)out[i]=(paths.adipose[i]!+paths.muscle[i]!+paths.soft[i]!+paths.inflatedLung[i]!+paths.blood[i]!+paths.brain[i]!+paths.air[i]!)>.003?1:0;return out;}
function blurMap(src:Float32Array,w:number,h:number,r=2){let cur=new Float32Array(src);for(let pass=0;pass<r;pass++){const out=new Float32Array(src.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0,n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=Math.max(0,Math.min(w-1,x+dx)),yy=Math.max(0,Math.min(h-1,y+dy)),wt=!dx&&!dy?4:dx===0||dy===0?2:1;s+=cur[yy*w+xx]!*wt;n+=wt;}out[y*w+x]=s/n;}cur=out;}return cur;}

function refineWholeBodyMaterials(tissue:AtlasTissueMaterialPaths|null,skeletal:AtlasSkeletalMaterialPaths|null,w:number,h:number){
  if(tissue){
    const lungSmooth=blurMap(tissue.inflatedLung,w,h,2),bloodSmooth=blurMap(tissue.blood,w,h,2),muscleSmooth=blurMap(tissue.muscle,w,h,2);
    for(let i=0;i<tissue.soft.length;i++){
      const lung=lungSmooth[i]!,presence=Math.min(1,lung/5.5);
      if(lung>.04){
        // Exchange the internal solid chord for aerated parenchyma. This is intentionally based on
        // the projected lung depth, so the two lung fields survive whole-body display processing.
        const wall=Math.min(tissue.soft[i]!,1.0+0.16*tissue.muscle[i]!+0.10*tissue.adipose[i]!);
        const replaceable=Math.max(0,tissue.soft[i]!-wall),exchange=replaceable*(.82+.16*presence);
        tissue.soft[i]-=exchange;
        tissue.inflatedLung[i]=Math.max(tissue.inflatedLung[i]!,lung)+exchange;
        tissue.muscle[i]*=.72+.12*(1-presence);
        tissue.adipose[i]*=.86;
        // Heart, hila and diaphragm remain superimposed and are spatially softened rather than
        // appearing as hard atlas cut-outs.
        tissue.blood[i]=Math.max(tissue.blood[i]!,bloodSmooth[i]!*0.92);
        tissue.muscle[i]=Math.max(tissue.muscle[i]!,muscleSmooth[i]!*0.34);
      }else{
        // Reduce the featureless abdominal slab while retaining solid-organ superimposition.
        const organ=Math.min(1,(bloodSmooth[i]!+muscleSmooth[i]!)/5);
        if(organ>.05&&tissue.soft[i]!>1){const shift=Math.min(.85,tissue.soft[i]!*(.10+.08*organ));tissue.soft[i]-=shift;tissue.adipose[i]+=shift*.45;tissue.muscle[i]+=shift*.38;}
      }
    }
  }
  if(skeletal){
    const total=new Float32Array(skeletal.corticalBone.length);for(let i=0;i<total.length;i++)total[i]=skeletal.corticalBone[i]!+skeletal.trabecularBone[i]!;
    const neighbourhood=blurMap(total,w,h,1);
    for(let i=0;i<total.length;i++){
      const cortical=skeletal.corticalBone[i]!,trab=skeletal.trabecularBone[i]!,t=total[i]!;if(t<=.002)continue;
      // Local thickness drives cortical response: thin ribs/digits lose the painted-white look,
      // while overlapping skull, pelvis and joint cortex remains dense. Shift removed cortex into
      // trabecular/marrow material rather than deleting attenuation globally.
      const depth=Math.min(1,t/1.7),overlap=Math.min(1,neighbourhood[i]!/2.2),keep=.34+.30*depth+.18*overlap,shift=cortical*(1-keep);
      skeletal.corticalBone[i]=cortical-shift;
      skeletal.trabecularBone[i]=trab+shift*.30;
      skeletal.adipose[i]+=shift*.42;
    }
  }
}
function clinicallyFramedTube(tube:TubeState,projection:Projection):TubeState{if(projection.id!=="pa-chest"&&projection.id!=="lat-chest")return tube;const requestedTop=tube.crY-tube.collimationH*.5,requestedBottom=tube.crY+tube.collimationH*.5,top=Math.max(21.0,requestedTop),bottom=Math.min(54.5,requestedBottom),safeTop=Math.min(top,bottom-8),safeBottom=Math.max(bottom,safeTop+8);return{...tube,crY:(safeTop+safeBottom)*.5,collimationH:safeBottom-safeTop};}
async function canonicalMaps(args:{patient:Patient;projection:Projection;tube:TubeState;geometry:ProjectionGeometry;}){const{patient,projection,tube,geometry}=args,key=canonicalKey(patient,projection),existing=CACHE.get(key);if(existing){touchCache(key,existing);return existing;}const canonicalTube:TubeState={...tube,crX:0,crY:CANONICAL_CR_Y_CM,collimationW:CANONICAL_W_CM,collimationH:CANONICAL_H_CM},objectGeometry:ProjectionGeometry={...geometry,magnification:1,effectiveObjectScale:1};const pending=Promise.all([projectAtlasSkeletalPaths({patient,projection,tube:canonicalTube,width:BASE_WIDTH,height:BASE_HEIGHT,geometry:objectGeometry,wholeBody:true}),projectAtlasTissuePaths({patient,projection,tube:canonicalTube,width:BASE_WIDTH,height:BASE_HEIGHT,geometry:objectGeometry,wholeBody:true})]).then(([skeletal,tissue])=>({skeletal,tissue,width:BASE_WIDTH,height:BASE_HEIGHT})).catch(err=>{CACHE.delete(key);throw err;});touchCache(key,pending);return pending;}

export async function canonicalAtlasMaterialProjection(args:{patient:Patient;projection:Projection;tube:TubeState;width:number;height:number;geometry:ProjectionGeometry;}):Promise<CanonicalAtlasMaterialMaps>{const{patient,projection,tube,width,height,geometry}=args,framedTube=clinicallyFramedTube(tube,projection),baseKey=canonicalKey(patient,projection),viewKey=[baseKey,projection.id,width,height,framedTube.crX.toFixed(3),framedTube.crY.toFixed(3),framedTube.collimationW.toFixed(3),framedTube.collimationH.toFixed(3),geometry.magnification.toFixed(5)].join("|"),cached=VIEW_CACHE.get(viewKey);if(cached){touchView(viewKey,cached);return cached;}const maps=await canonicalMaps({patient,projection,tube:framedTube,geometry}),tissue=cropTissue(maps.tissue,maps.width,maps.height,framedTube,geometry,width,height),skeletal=cropSkeletal(maps.skeletal,maps.width,maps.height,framedTube,geometry,width,height);if(projection.id==="ap-full-body")refineWholeBodyMaterials(tissue,skeletal,width,height);const result={tissue,skeletal,tissueMask:tissueMask(tissue)};touchView(viewKey,result);return result;}

export async function canonicalAtlasProjection(args:{patient:Patient;projection:Projection;tube:TubeState;exposureKvp:number;width:number;height:number;geometry:ProjectionGeometry;}){const maps=await canonicalAtlasMaterialProjection(args),n=args.width*args.height,bone=new Float32Array(n),tissue=new Float32Array(n);for(let i=0;i<n;i++){if(maps.tissue)tissue[i]=primaryOpticalDepth({adipose:maps.tissue.adipose[i]!,muscle:maps.tissue.muscle[i]!,soft:maps.tissue.soft[i]!,inflatedLung:maps.tissue.inflatedLung[i]!,blood:maps.tissue.blood[i]!,brain:maps.tissue.brain[i]!,air:maps.tissue.air[i]!},args.exposureKvp);if(maps.skeletal){const full=primaryOpticalDepth({corticalBone:maps.skeletal.corticalBone[i]!,trabecularBone:maps.skeletal.trabecularBone[i]!,adipose:maps.skeletal.adipose[i]!},args.exposureKvp),displaced=primaryOpticalDepth({soft:maps.skeletal.displacedSoft[i]!},args.exposureKvp);bone[i]=Math.max(0,full-displaced);}}return{bone,tissue};}
