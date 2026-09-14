import * as THREE from "three";
import type { Patient, Projection, SimPose, TubeState, PlacementMode } from "./types";
import type { ProjectionGeometry } from "./projection-physics";
import { patientKinematics, type V3 } from "./patient-kinematics";
import { materialOpticalDepth, primaryOpticalDepth } from "./nist-attenuation";

const MODEL_ROOT = "/models/human-atlas/";
const ATLAS_HEIGHT_M = 1.7;
const MAX_BONE_PATH_CM = 15;
const LOOKUP_STEP_CM = 0.05;

type BoneRegion = "rib"|"scapula"|"clavicle"|"humerus"|"forearm"|"hand"|"femur"|"patella"|"lowerleg"|"foot"|"pelvis"|"axial"|"skull"|"other";
type Side = -1|1;

interface AtlasPart { name:string; system:string; chunk:number; positions:number; normals:number; indices:number; vertexCount:number; indexCount:number; bounds:[number[],number[]]; }
interface AtlasManifest { parts:AtlasPart[]; chunks:{url:string;bytes:number}[]; }
interface LoadedPart { mesh:THREE.Mesh; region:BoneRegion; side:Side; sourceName:string; center:V3; }
interface LoadedAtlas { root:THREE.Group; parts:LoadedPart[]; }
interface BoneComposition { cortical:number; trabecular:number; marrow:number; }

let atlasCache: Promise<LoadedAtlas> | null = null;

function regionFor(name:string):BoneRegion {
  const n=name.toLowerCase();
  if(n.includes("cartilage"))return"other";
  if(n.includes("rib")||n.includes("costal"))return"rib";
  if(n.includes("scapula"))return"scapula";
  if(n.includes("clavicle"))return"clavicle";
  if(n.includes("humerus"))return"humerus";
  if(n.includes("radius")||n.includes("ulna"))return"forearm";
  if(n.includes("hand")||n.includes("metacarp")||n.includes("phalan")||n.includes("carpal"))return"hand";
  if(n.includes("femur"))return"femur";
  if(n.includes("patella"))return"patella";
  if(n.includes("tibia")||n.includes("fibula"))return"lowerleg";
  if(n.includes("foot")||n.includes("metatars")||n.includes("talus")||n.includes("calcaneus")||n.includes("tarsal"))return"foot";
  if(n.includes("pelvis")||n.includes("ilium")||n.includes("ischium")||n.includes("pubis")||n.includes("sacrum")||n.includes("hip bone")||n.includes("coxal")||n.includes("innominate")||n.includes("acetabul")||n.includes("os cox"))return"pelvis";
  if(n.includes("vertebra")||n.includes("spine")||n.includes("sternum")||n.includes("coccyx"))return"axial";
  if(n.includes("skull")||n.includes("mandible")||n.includes("maxilla")||n.includes("zygomatic")||n.includes("temporal")||n.includes("frontal")||n.includes("parietal"))return"skull";
  return"other";
}
function sideFor(bounds:[number[],number[]]):Side { return ((bounds[0][0]+bounds[1][0])*.5)<0?-1:1; }

async function loadAtlas():Promise<LoadedAtlas>{
  if(atlasCache)return atlasCache;
  atlasCache=(async()=>{
    const response=await fetch(`${MODEL_ROOT}atlas.json`,{cache:"force-cache"});
    if(!response.ok)throw new Error(`Human atlas manifest failed (${response.status}).`);
    const manifest=await response.json() as AtlasManifest;
    const skeletal=manifest.parts.filter(p=>p.system==="skeletal");
    if(!skeletal.length)throw new Error("Human atlas contains no skeletal structures.");
    const chunks=new Map<number,ArrayBuffer>();
    await Promise.all([...new Set(skeletal.map(p=>p.chunk))].map(async index=>{
      const chunk=manifest.chunks[index]; if(!chunk)throw new Error(`Atlas chunk ${index} missing.`);
      const r=await fetch(chunk.url,{cache:"force-cache"}); if(!r.ok)throw new Error(`Atlas chunk ${index} failed.`);
      const buffer=await r.arrayBuffer(); if(buffer.byteLength!==chunk.bytes)throw new Error(`Atlas chunk ${index} incomplete.`);
      chunks.set(index,buffer);
    }));
    const root=new THREE.Group(),parts:LoadedPart[]=[];
    for(const part of skeletal){
      const buffer=chunks.get(part.chunk); if(!buffer)continue;
      const g=new THREE.BufferGeometry();
      g.setAttribute("position",new THREE.BufferAttribute(new Float32Array(buffer,part.positions,part.vertexCount*3),3));
      // Normals are intentionally not uploaded: a transmission projection uses
      // geometric path length, not surface lighting or opacity.
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer,part.indices,part.indexCount),1));
      const c=new THREE.Vector3((part.bounds[0][0]+part.bounds[1][0])*.5,(part.bounds[0][1]+part.bounds[1][1])*.5,(part.bounds[0][2]+part.bounds[1][2])*.5);
      g.translate(-c.x,-c.y,-c.z);
      const mesh=new THREE.Mesh(g); mesh.position.copy(c); mesh.name=part.name; root.add(mesh);
      parts.push({mesh,region:regionFor(part.name),side:sideFor(part.bounds),sourceName:part.name,center:[c.x,c.y,c.z]});
    }
    return{root,parts};
  })();
  return atlasCache;
}

function resetAtlas(atlas:LoadedAtlas,patient:Patient){
  atlas.root.position.set(0,0,0); atlas.root.rotation.set(0,0,0); atlas.root.quaternion.identity();
  atlas.root.scale.setScalar((patient.heightCm/100)/ATLAS_HEIGHT_M);
  for(const p of atlas.parts){ const c=p.center; p.mesh.position.set(c[0],c[1],c[2]); p.mesh.quaternion.identity(); p.mesh.scale.setScalar(1); p.mesh.visible=true; }
}
function group(parts:LoadedPart[],region:BoneRegion,side:Side){return parts.filter(p=>p.region===region&&p.side===side);}
function anchor(parts:LoadedPart[]){return parts.length?parts.reduce((s,p)=>s.add(p.mesh.position),new THREE.Vector3()).multiplyScalar(1/parts.length):new THREE.Vector3();}
function moveGroup(parts:LoadedPart[],target:THREE.Vector3,rotation:THREE.Quaternion){const a=anchor(parts);for(const p of parts){p.mesh.position.copy(target).add(p.mesh.position.clone().sub(a).applyQuaternion(rotation));p.mesh.quaternion.copy(rotation);}}

function articulate(atlas:LoadedAtlas,patient:Patient,projection:Projection,pose:SimPose){
  if(projection.id==="ap-full-body"||projection.id==="pa-chest"||projection.id==="lat-chest")return;
  const placement:PlacementMode=projection.setup==="table"||projection.setup==="tabletop"?"table":"upright-bucky";
  const H=patient.heightCm/100,scale=H/ATLAS_HEIGHT_M;
  const kin=patientKinematics({H,s:1,shoulder:patient.morph.shoulder,hip:patient.morph.hip,limb:patient.morph.limb,elbowFlex:pose.elbowFlex,hipInternal:pose.hipInternal,armRaise:pose.armRaise,armSide:pose.armSide,armRotation:pose.armRotation,forearmRotation:pose.forearmRotation,shoulderRoll:pose.shoulderRoll,kneeFlex:pose.kneeFlex,projectionId:projection.id,placement,buckyTilt:0});
  const local=(p:V3)=>new THREE.Vector3(p[0]/scale,p[1]/scale,p[2]/scale);
  const mid=(a:THREE.Vector3,b:THREE.Vector3)=>a.clone().add(b).multiplyScalar(.5);
  const direction=(a:V3,b:V3)=>new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]).normalize();
  const yAxis=new THREE.Vector3(0,1,0);
  for(const side of[-1,1]as const){
    const arm=side<0?kin.arms[0]:kin.arms[1],leg=side<0?kin.legs[0]:kin.legs[1];
    const shoulder=local(arm.shoulder),elbow=local(arm.elbow),wrist=local(arm.wrist),hand=local(arm.hand),hip=local(leg.hip),knee=local(leg.knee),ankle=local(leg.ankle),foot=local(leg.foot);
    moveGroup(group(atlas.parts,"humerus",side),mid(shoulder,elbow),new THREE.Quaternion().setFromUnitVectors(yAxis,direction(arm.shoulder,arm.upper)));
    moveGroup(group(atlas.parts,"forearm",side),mid(elbow,wrist),new THREE.Quaternion().setFromUnitVectors(yAxis,direction(arm.elbow,arm.wrist)));
    moveGroup(group(atlas.parts,"hand",side),hand,new THREE.Quaternion().setFromUnitVectors(yAxis,direction(arm.elbow,arm.wrist)));
    moveGroup(group(atlas.parts,"femur",side),mid(hip,knee),new THREE.Quaternion().setFromUnitVectors(yAxis,direction(leg.hip,leg.knee)));
    moveGroup(group(atlas.parts,"lowerleg",side),mid(knee,ankle),new THREE.Quaternion().setFromUnitVectors(yAxis,direction(leg.knee,leg.ankle)));
    moveGroup(group(atlas.parts,"foot",side),foot,new THREE.Quaternion().setFromUnitVectors(yAxis,direction(leg.knee,leg.ankle)));
  }
}

function unpackDepth(b:Uint8Array,j:number){return b[j]!/255+b[j+1]!/65025+b[j+2]!/16581375;}
function projectThickness(scene:THREE.Scene,atlas:LoadedAtlas,part:LoadedPart,camera:THREE.OrthographicCamera,renderer:THREE.WebGLRenderer,target:THREE.WebGLRenderTarget,fm:THREE.ShaderMaterial,bm:THREE.ShaderMaterial,w:number,h:number){
  for(const p of atlas.parts)p.mesh.visible=p===part;atlas.root.updateMatrixWorld(true);
  const front=new Uint8Array(w*h*4),back=new Uint8Array(w*h*4);
  scene.overrideMaterial=fm;renderer.setRenderTarget(target);renderer.clear(true,true,true);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,w,h,front);
  scene.overrideMaterial=bm;renderer.clear(true,true,true);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,w,h,back);
  const out=new Float32Array(w*h),range=camera.far-camera.near;
  for(let i=0;i<out.length;i++){const j=i*4,f=unpackDepth(front,j),b=unpackDepth(back,j);if(f>=.9999||b>=.9999)continue;const cm=Math.abs(b-f)*range*100;if(cm>.002&&cm<MAX_BONE_PATH_CM)out[i]=cm;}
  return out;
}

/**
 * Bulk material composition used until a labelled cortical/trabecular marrow
 * volume is available. Crucially, the whole projected chord participates in
 * attenuation; no image-space shell, edge gain, texture or opacity is applied.
 */
function composition(region:BoneRegion,name:string):BoneComposition{
  const n=name.toLowerCase();
  if(region==="skull")return n.includes("mandible")?{cortical:.42,trabecular:.42,marrow:.16}:{cortical:.34,trabecular:.50,marrow:.16};
  if(region==="rib")return{cortical:.26,trabecular:.54,marrow:.20};
  if(region==="axial")return{cortical:.18,trabecular:.62,marrow:.20};
  if(region==="pelvis")return n.includes("sacrum")?{cortical:.18,trabecular:.64,marrow:.18}:{cortical:.22,trabecular:.58,marrow:.20};
  if(region==="scapula")return{cortical:.20,trabecular:.60,marrow:.20};
  if(region==="clavicle")return{cortical:.38,trabecular:.42,marrow:.20};
  if(region==="humerus"||region==="femur")return{cortical:.38,trabecular:.24,marrow:.38};
  if(region==="forearm"||region==="lowerleg")return{cortical:.42,trabecular:.22,marrow:.36};
  if(region==="hand"||region==="foot")return{cortical:.30,trabecular:.48,marrow:.22};
  if(region==="patella")return{cortical:.22,trabecular:.60,marrow:.18};
  return{cortical:.26,trabecular:.54,marrow:.20};
}

function buildExcessLookup(region:BoneRegion,name:string,kvp:number){
  const c=composition(region,name),count=Math.round(MAX_BONE_PATH_CM/LOOKUP_STEP_CM)+1,out=new Float32Array(count);
  for(let i=0;i<count;i++){
    const path=i*LOOKUP_STEP_CM;
    const boneOD=primaryOpticalDepth({corticalBone:path*c.cortical,trabecularBone:path*c.trabecular,adipose:path*c.marrow},kvp);
    const displacedSoftOD=materialOpticalDepth("soft",path,kvp);
    out[i]=Math.max(0,boneOD-displacedSoftOD);
  }
  return out;
}
function lookupExcess(table:Float32Array,pathCm:number){
  const q=Math.max(0,Math.min(MAX_BONE_PATH_CM,pathCm))/LOOKUP_STEP_CM,i0=Math.floor(q),i1=Math.min(table.length-1,i0+1),t=q-i0;
  return table[i0]!*(1-t)+table[i1]!*t;
}

export async function projectAtlasSkeletalOD(args:{patient:Patient;projection:Projection;pose?:SimPose;tube:TubeState;exposureKvp:number;width:number;height:number;geometry:ProjectionGeometry;wholeBody?:boolean;}):Promise<Float32Array|null>{
  if(typeof document==="undefined"||typeof window==="undefined")return null;
  const{patient,projection,pose,tube,exposureKvp,width,height,geometry,wholeBody=false}=args;
  try{
    const atlas=await loadAtlas();resetAtlas(atlas,patient);if(pose&&!wholeBody)articulate(atlas,patient,projection,pose);atlas.root.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(atlas.root),centre=bounds.getCenter(new THREE.Vector3());centre.x=0;
    const rw=Math.min(640,Math.max(256,width)),rh=Math.min(1152,Math.max(384,height));
    let target=centre.clone();
    if(!wholeBody){const targetYcm=projection.cr.y*patient.heightCm/170,targetXcm=projection.cr.x;target=new THREE.Vector3(targetXcm/100,patient.heightCm/100-targetYcm/100,0);}
    const lateral=projection.anatomy==="torso-lat"||projection.anatomy==="cspine-lat"||projection.anatomy==="skull-lat";
    const camera=new THREE.OrthographicCamera(0,1,1,0,.01,5),halfW=tube.collimationW/geometry.magnification/200,halfH=tube.collimationH/geometry.magnification/200;
    camera.left=-halfW;camera.right=halfW;camera.top=halfH;camera.bottom=-halfH;
    camera.position.copy(lateral?new THREE.Vector3(target.x+2.5,target.y,target.z):new THREE.Vector3(target.x,target.y,target.z+2.5));camera.lookAt(target);camera.updateProjectionMatrix();
    const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,preserveDrawingBuffer:false});renderer.setSize(rw,rh,false);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.setClearColor(0xffffff,1);
    const scene=new THREE.Scene();scene.background=new THREE.Color(0xffffff);scene.add(atlas.root);
    const targetRT=new THREE.WebGLRenderTarget(rw,rh,{format:THREE.RGBAFormat,type:THREE.UnsignedByteType,depthBuffer:true,stencilBuffer:false});
    const vs=`varying float vDepth;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;vDepth=gl_Position.z/gl_Position.w*.5+.5;}`,fs=`varying float vDepth;vec3 packDepth24(float v){v=clamp(v,0.0,0.999999);vec3 enc=fract(v*vec3(1.0,255.0,65025.0));enc-=enc.yzz*vec3(1.0/255.0,1.0/255.0,0.0);return enc;}void main(){gl_FragColor=vec4(packDepth24(vDepth),1.0);}`;
    const fm=new THREE.ShaderMaterial({vertexShader:vs,fragmentShader:fs,side:THREE.FrontSide,depthTest:true,depthWrite:true}),bm=new THREE.ShaderMaterial({vertexShader:vs,fragmentShader:fs,side:THREE.BackSide,depthTest:true,depthWrite:true});
    const optical=new Float32Array(rw*rh),lookupCache=new Map<string,Float32Array>();
    for(const part of atlas.parts){
      if(part.region==="other")continue;
      const raw=projectThickness(scene,atlas,part,camera,renderer,targetRT,fm,bm,rw,rh);
      const key=`${part.region}|${part.sourceName}`;
      let table=lookupCache.get(key);if(!table){table=buildExcessLookup(part.region,part.sourceName,exposureKvp);lookupCache.set(key,table);}
      for(let i=0;i<optical.length;i++){const path=raw[i]!;if(path>0)optical[i]+=lookupExcess(table,path);}
    }
    for(const p of atlas.parts)p.mesh.visible=true;scene.overrideMaterial=null;renderer.dispose();targetRT.dispose();fm.dispose();bm.dispose();
    const full=new Float32Array(width*height);
    for(let y=0;y<height;y++){
      const sy=(1-y/Math.max(1,height-1))*(rh-1),y0=Math.floor(sy),y1=Math.min(rh-1,y0+1),fy=sy-y0;
      for(let x=0;x<width;x++){
        const sx=x/Math.max(1,width-1)*(rw-1),x0=Math.floor(sx),x1=Math.min(rw-1,x0+1),fx=sx-x0,a=optical[y0*rw+x0]!,b=optical[y0*rw+x1]!,c=optical[y1*rw+x0]!,d=optical[y1*rw+x1]!;
        full[y*width+x]=a*(1-fx)*(1-fy)+b*fx*(1-fy)+c*(1-fx)*fy+d*fx*fy;
      }
    }
    return full;
  }catch(err){console.warn("[Bucky Lab] Unified skeletal atlas projection failed",err);return null;}
}
