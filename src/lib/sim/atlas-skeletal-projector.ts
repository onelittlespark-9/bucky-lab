import * as THREE from "three";
import type { Patient, Projection, SimPose, TubeState, PlacementMode } from "./types";
import type { ProjectionGeometry } from "./projection-physics";
import { patientKinematics, type V3 } from "./patient-kinematics";
import { primaryOpticalDepth } from "./nist-attenuation";

const MODEL_ROOT = "/models/human-atlas/";
const ATLAS_HEIGHT_M = 1.7;
const MAX_BONE_PATH_CM = 15;
const DIAMETER_BUCKET_CM = 0.25;

type BoneRegion = "rib"|"scapula"|"clavicle"|"humerus"|"forearm"|"hand"|"femur"|"patella"|"lowerleg"|"foot"|"pelvis"|"axial"|"skull"|"other";
type Side = -1|1;
interface AtlasPart { name:string; system:string; chunk:number; positions:number; normals:number; indices:number; vertexCount:number; indexCount:number; bounds:[number[],number[]]; }
interface AtlasManifest { parts:AtlasPart[]; chunks:{url:string;bytes:number}[]; }
interface LoadedPart { mesh:THREE.Mesh; region:BoneRegion; side:Side; sourceName:string; center:V3; }
interface LoadedAtlas { root:THREE.Group; parts:LoadedPart[]; }
export interface AtlasSkeletalMaterialPaths {
  corticalBone:Float32Array;
  trabecularBone:Float32Array;
  adipose:Float32Array;
  displacedSoft:Float32Array;
}

let atlasCache:Promise<LoadedAtlas>|null=null;

function regionFor(name:string):BoneRegion {
  const n=name.toLowerCase();
  if(n.includes("cartilage"))return"other";
  if(n.includes("rib")||n.includes("costal"))return"rib";
  if(n.includes("scapula"))return"scapula";
  if(n.includes("clavicle"))return"clavicle";
  if(n.includes("humerus"))return"humerus";
  if(n.includes("radius")||n.includes("ulna"))return"forearm";
  if(n.includes("hand")||n.includes("metacarp")||n.includes("phalan")||n.includes("carpal")||n.includes("finger")||n.includes("digit"))return"hand";
  if(n.includes("femur"))return"femur";
  if(n.includes("patella"))return"patella";
  if(n.includes("tibia")||n.includes("fibula"))return"lowerleg";
  if(n.includes("foot")||n.includes("metatars")||n.includes("talus")||n.includes("calcaneus")||n.includes("tarsal")||n.includes("toe"))return"foot";
  if(n.includes("pelvis")||n.includes("ilium")||n.includes("ischium")||n.includes("pubis")||n.includes("sacrum")||n.includes("hip bone")||n.includes("coxal")||n.includes("innominate")||n.includes("acetabul")||n.includes("os cox"))return"pelvis";
  if(n.includes("vertebra")||n.includes("spine")||n.includes("sternum")||n.includes("coccyx"))return"axial";
  if(n.includes("skull")||n.includes("mandible")||n.includes("maxilla")||n.includes("zygomatic")||n.includes("temporal")||n.includes("frontal")||n.includes("parietal")||n.includes("occipital")||n.includes("sphenoid")||n.includes("ethmoid")||n.includes("nasal")||n.includes("lacrimal")||n.includes("vomer")||n.includes("palatine"))return"skull";
  return"other";
}
function sideFor(b:[number[],number[]]):Side{return((b[0][0]+b[1][0])*.5)<0?-1:1;}
function isLongBone(region:BoneRegion){return region==="humerus"||region==="femur"||region==="forearm"||region==="lowerleg";}

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
      const chunk=manifest.chunks[index];if(!chunk)throw new Error(`Atlas chunk ${index} missing.`);
      const r=await fetch(chunk.url,{cache:"force-cache"});if(!r.ok)throw new Error(`Atlas chunk ${index} failed.`);
      const buffer=await r.arrayBuffer();if(buffer.byteLength!==chunk.bytes)throw new Error(`Atlas chunk ${index} incomplete.`);chunks.set(index,buffer);
    }));
    const root=new THREE.Group(),parts:LoadedPart[]=[];
    for(const part of skeletal){const buffer=chunks.get(part.chunk);if(!buffer)continue;const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(new Float32Array(buffer,part.positions,part.vertexCount*3),3));g.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer,part.indices,part.indexCount),1));const c=new THREE.Vector3((part.bounds[0][0]+part.bounds[1][0])*.5,(part.bounds[0][1]+part.bounds[1][1])*.5,(part.bounds[0][2]+part.bounds[1][2])*.5);g.translate(-c.x,-c.y,-c.z);const mesh=new THREE.Mesh(g);mesh.position.copy(c);mesh.name=part.name;root.add(mesh);parts.push({mesh,region:regionFor(part.name),side:sideFor(part.bounds),sourceName:part.name,center:[c.x,c.y,c.z]});}
    return{root,parts};
  })();
  return atlasCache;
}

function resetAtlas(a:LoadedAtlas,p:Patient){a.root.position.set(0,0,0);a.root.rotation.set(0,0,0);a.root.quaternion.identity();a.root.scale.setScalar((p.heightCm/100)/ATLAS_HEIGHT_M);for(const q of a.parts){const c=q.center;q.mesh.position.set(c[0],c[1],c[2]);q.mesh.quaternion.identity();q.mesh.scale.setScalar(1);q.mesh.visible=true;}}
function group(p:LoadedPart[],r:BoneRegion,s:Side){return p.filter(q=>q.region===r&&q.side===s);}
function anchor(p:LoadedPart[]){return p.length?p.reduce((s,q)=>s.add(q.mesh.position),new THREE.Vector3()).multiplyScalar(1/p.length):new THREE.Vector3();}
function moveGroup(p:LoadedPart[],t:THREE.Vector3,r:THREE.Quaternion){const a=anchor(p);for(const q of p){q.mesh.position.copy(t).add(q.mesh.position.clone().sub(a).applyQuaternion(r));q.mesh.quaternion.copy(r);}}
function articulate(atlas:LoadedAtlas,patient:Patient,projection:Projection,pose:SimPose){
  if(projection.id==="ap-full-body"||projection.id==="pa-chest"||projection.id==="lat-chest")return;
  const placement:PlacementMode=projection.setup==="table"||projection.setup==="tabletop"?"table":"upright-bucky";
  const H=patient.heightCm/100,scale=H/ATLAS_HEIGHT_M;
  const kin=patientKinematics({H,s:1,shoulder:patient.morph.shoulder,hip:patient.morph.hip,limb:patient.morph.limb,elbowFlex:pose.elbowFlex,hipInternal:pose.hipInternal,armRaise:pose.armRaise,armSide:pose.armSide,armRotation:pose.armRotation,forearmRotation:pose.forearmRotation,shoulderRoll:pose.shoulderRoll,kneeFlex:pose.kneeFlex,projectionId:projection.id,placement,buckyTilt:0});
  const local=(p:V3)=>new THREE.Vector3(p[0]/scale,p[1]/scale,p[2]/scale),mid=(a:THREE.Vector3,b:THREE.Vector3)=>a.clone().add(b).multiplyScalar(.5),direction=(a:V3,b:V3)=>new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]).normalize(),yAxis=new THREE.Vector3(0,1,0);
  for(const side of[-1,1]as const){const arm=side<0?kin.arms[0]:kin.arms[1],leg=side<0?kin.legs[0]:kin.legs[1];const shoulder=local(arm.shoulder),elbow=local(arm.elbow),wrist=local(arm.wrist),hand=local(arm.hand),hip=local(leg.hip),knee=local(leg.knee),ankle=local(leg.ankle),foot=local(leg.foot);moveGroup(group(atlas.parts,"humerus",side),mid(shoulder,elbow),new THREE.Quaternion().setFromUnitVectors(yAxis,direction(arm.shoulder,arm.upper)));moveGroup(group(atlas.parts,"forearm",side),mid(elbow,wrist),new THREE.Quaternion().setFromUnitVectors(yAxis,direction(arm.elbow,arm.wrist)));moveGroup(group(atlas.parts,"hand",side),hand,new THREE.Quaternion().setFromUnitVectors(yAxis,direction(arm.elbow,arm.wrist)));moveGroup(group(atlas.parts,"femur",side),mid(hip,knee),new THREE.Quaternion().setFromUnitVectors(yAxis,direction(leg.hip,leg.knee)));moveGroup(group(atlas.parts,"lowerleg",side),mid(knee,ankle),new THREE.Quaternion().setFromUnitVectors(yAxis,direction(leg.knee,leg.ankle)));moveGroup(group(atlas.parts,"foot",side),foot,new THREE.Quaternion().setFromUnitVectors(yAxis,direction(leg.knee,leg.ankle)));}
}

function unpackDepth(b:Uint8Array,j:number){return b[j]!/255+b[j+1]!/65025+b[j+2]!/16581375;}
function projectThickness(scene:THREE.Scene,atlas:LoadedAtlas,part:LoadedPart,camera:THREE.OrthographicCamera,renderer:THREE.WebGLRenderer,target:THREE.WebGLRenderTarget,fm:THREE.ShaderMaterial,bm:THREE.ShaderMaterial,w:number,h:number){for(const p of atlas.parts)p.mesh.visible=p===part;atlas.root.updateMatrixWorld(true);const front=new Uint8Array(w*h*4),back=new Uint8Array(w*h*4);scene.overrideMaterial=fm;renderer.setRenderTarget(target);renderer.clear(true,true,true);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,w,h,front);scene.overrideMaterial=bm;renderer.clear(true,true,true);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,w,h,back);const out=new Float32Array(w*h),range=camera.far-camera.near;for(let i=0;i<out.length;i++){const j=i*4,f=unpackDepth(front,j),b=unpackDepth(back,j);if(f>=.9999||b>=.9999)continue;const cm=Math.abs(b-f)*range*100;if(cm>.002&&cm<MAX_BONE_PATH_CM)out[i]=cm;}return out;}
function shellChord(path:number,outerDiameter:number,shell:number){const diameter=Math.max(path,outerDiameter,shell*2),radius=diameter*.5,halfChord=Math.min(radius,path*.5),offsetSq=Math.max(0,radius*radius-halfChord*halfChord),innerRadius=Math.max(0,radius-shell),innerHalf=Math.sqrt(Math.max(0,innerRadius*innerRadius-offsetSq)),interior=Math.max(0,Math.min(path,innerHalf*2));return{cortical:Math.max(0,path-interior),interior};}
function materialPaths(region:BoneRegion,name:string,path:number,outerDiameter=path){
  const n=name.toLowerCase();let shell=.13,trabFrac=.32;
  if(region==="humerus"||region==="femur"){shell=.22;trabFrac=.065;}
  else if(region==="forearm"||region==="lowerleg"){shell=.155;trabFrac=.060;}
  else if(region==="rib"){shell=.027;trabFrac=.14;}
  else if(region==="axial"){shell=n.includes("stern")?.050:.035;trabFrac=n.includes("vertebr")?.22:.27;}
  else if(region==="pelvis"){shell=n.includes("sacrum")?.050:.062;trabFrac=.38;}
  else if(region==="scapula"){shell=.035;trabFrac=.28;}
  else if(region==="clavicle"){shell=.085;trabFrac=.16;}
  else if(region==="hand"||region==="foot"){shell=.078;trabFrac=.24;}
  else if(region==="patella"){shell=.050;trabFrac=.40;}
  else if(region==="skull"){shell=n.includes("mandible")?.105:n.includes("temporal")||n.includes("occipital")?.082:.058;trabFrac=n.includes("mandible")?.23:.20;}
  const shellGeometry=isLongBone(region)?shellChord(path,outerDiameter,shell):{cortical:Math.min(path,shell*2),interior:Math.max(0,path-Math.min(path,shell*2))};
  let cortical=shellGeometry.cortical,interior=shellGeometry.interior;
  const chordFraction=Math.min(1,path/Math.max(.05,outerDiameter));
  if(isLongBone(region)){
    const canalWeight=Math.pow(chordFraction,1.35);
    trabFrac*=1-.86*canalWeight;
  }else if(region==="rib"){
    trabFrac*=.68+.32*Math.min(1,path/.45);
  }else if(region==="axial"){
    trabFrac*=.72+.28*Math.min(1,path/1.2);
  }else if(region==="skull"){
    const overlapWeight=Math.min(1,path/.7);
    cortical*=.88+.12*overlapWeight;
  }
  const trabecular=interior*Math.max(.02,trabFrac),marrow=Math.max(0,interior-trabecular);
  return{cortical,trabecular,marrow};
}
function resample(src:Float32Array,rw:number,rh:number,width:number,height:number){const full=new Float32Array(width*height);for(let y=0;y<height;y++){const sy=(1-y/Math.max(1,height-1))*(rh-1),y0=Math.floor(sy),y1=Math.min(rh-1,y0+1),fy=sy-y0;for(let x=0;x<width;x++){const sx=x/Math.max(1,width-1)*(rw-1),x0=Math.floor(sx),x1=Math.min(rw-1,x0+1),fx=sx-x0,a=src[y0*rw+x0]!,b=src[y0*rw+x1]!,c=src[y1*rw+x0]!,d=src[y1*rw+x1]!;full[y*width+x]=a*(1-fx)*(1-fy)+b*fx*(1-fy)+c*(1-fx)*fy+d*fx*fy;}}return full;}

export async function projectAtlasSkeletalPaths(args:{patient:Patient;projection:Projection;pose?:SimPose;tube:TubeState;width:number;height:number;geometry:ProjectionGeometry;wholeBody?:boolean;}):Promise<AtlasSkeletalMaterialPaths|null>{
  if(typeof document==="undefined"||typeof window==="undefined")return null;
  const{patient,projection,pose,tube,width,height,geometry,wholeBody=false}=args;
  try{
    const atlas=await loadAtlas();resetAtlas(atlas,patient);if(pose&&!wholeBody)articulate(atlas,patient,projection,pose);atlas.root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(atlas.root),centre=bounds.getCenter(new THREE.Vector3());centre.x=0;const rw=Math.min(640,Math.max(256,width)),rh=Math.min(1152,Math.max(384,height));let target=centre.clone();if(!wholeBody){const targetYcm=projection.cr.y*patient.heightCm/170,targetXcm=projection.cr.x;target=new THREE.Vector3(targetXcm/100,patient.heightCm/100-targetYcm/100,0);}const lateral=projection.anatomy==="torso-lat"||projection.anatomy==="cspine-lat"||projection.anatomy==="skull-lat",camera=new THREE.OrthographicCamera(0,1,1,0,.01,5),halfW=tube.collimationW/geometry.magnification/200,halfH=tube.collimationH/geometry.magnification/200;camera.left=-halfW;camera.right=halfW;camera.top=halfH;camera.bottom=-halfH;camera.position.copy(lateral?new THREE.Vector3(target.x+2.5,target.y,target.z):new THREE.Vector3(target.x,target.y,target.z+2.5));camera.lookAt(target);camera.updateProjectionMatrix();
    const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,preserveDrawingBuffer:false});renderer.setSize(rw,rh,false);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.setClearColor(0xffffff,1);
    const scene=new THREE.Scene();scene.background=new THREE.Color(0xffffff);scene.add(atlas.root);
    const targetRT=new THREE.WebGLRenderTarget(rw,rh,{format:THREE.RGBAFormat,type:THREE.UnsignedByteType,depthBuffer:true,stencilBuffer:false});
    const vs=`varying float vDepth;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;vDepth=gl_Position.z/gl_Position.w*.5+.5;}`;
    const fs=`varying float vDepth;vec3 packDepth24(float v){v=clamp(v,0.0,0.999999);vec3 enc=fract(v*vec3(1.0,255.0,65025.0));enc-=enc.yzz*vec3(1.0/255.0,1.0/255.0,0.0);return enc;}void main(){gl_FragColor=vec4(packDepth24(vDepth),1.0);}`;
    const fm=new THREE.ShaderMaterial({vertexShader:vs,fragmentShader:fs,side:THREE.FrontSide,depthTest:true,depthWrite:true});
    const bm=new THREE.ShaderMaterial({vertexShader:vs,fragmentShader:fs,side:THREE.BackSide,depthTest:true,depthWrite:true});
    const maps:AtlasSkeletalMaterialPaths={corticalBone:new Float32Array(rw*rh),trabecularBone:new Float32Array(rw*rh),adipose:new Float32Array(rw*rh),displacedSoft:new Float32Array(rw*rh)};
    for(const part of atlas.parts){if(part.region==="other")continue;const raw=projectThickness(scene,atlas,part,camera,renderer,targetRT,fm,bm,rw,rh);if(isLongBone(part.region)){const rowDiameter=new Float32Array(rh);for(let y=0;y<rh;y++){let localMax=0;for(let x=0;x<rw;x++)localMax=Math.max(localMax,raw[y*rw+x]!);rowDiameter[y]=Math.max(DIAMETER_BUCKET_CM,Math.round(localMax/DIAMETER_BUCKET_CM)*DIAMETER_BUCKET_CM);}for(let y=0;y<rh;y++){const diameter=rowDiameter[y]!;if(diameter<=DIAMETER_BUCKET_CM)continue;for(let x=0;x<rw;x++){const i=y*rw+x,path=raw[i]!;if(path<=0)continue;const m=materialPaths(part.region,part.sourceName,path,diameter);maps.corticalBone[i]+=m.cortical;maps.trabecularBone[i]+=m.trabecular;maps.adipose[i]+=m.marrow;maps.displacedSoft[i]+=path;}}}else{for(let i=0;i<raw.length;i++){const path=raw[i]!;if(path<=0)continue;const m=materialPaths(part.region,part.sourceName,path);maps.corticalBone[i]+=m.cortical;maps.trabecularBone[i]+=m.trabecular;maps.adipose[i]+=m.marrow;maps.displacedSoft[i]+=path;}}}
    for(const p of atlas.parts)p.mesh.visible=true;scene.overrideMaterial=null;renderer.dispose();targetRT.dispose();fm.dispose();bm.dispose();return{corticalBone:resample(maps.corticalBone,rw,rh,width,height),trabecularBone:resample(maps.trabecularBone,rw,rh,width,height),adipose:resample(maps.adipose,rw,rh,width,height),displacedSoft:resample(maps.displacedSoft,rw,rh,width,height)};
  }catch(err){console.warn("[Bucky Lab] Unified skeletal atlas path projection failed",err);return null;}
}

export async function projectAtlasSkeletalOD(args:{patient:Patient;projection:Projection;pose?:SimPose;tube:TubeState;exposureKvp:number;width:number;height:number;geometry:ProjectionGeometry;wholeBody?:boolean;}):Promise<Float32Array|null>{const paths=await projectAtlasSkeletalPaths(args);if(!paths)return null;const out=new Float32Array(args.width*args.height);for(let i=0;i<out.length;i++){const boneOD=primaryOpticalDepth({corticalBone:paths.corticalBone[i]!,trabecularBone:paths.trabecularBone[i]!,adipose:paths.adipose[i]!},args.exposureKvp),softOD=primaryOpticalDepth({soft:paths.displacedSoft[i]!},args.exposureKvp);out[i]=Math.max(0,boneOD-softOD);}return out;}
