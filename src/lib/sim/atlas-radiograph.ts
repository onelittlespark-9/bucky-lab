import * as THREE from "three";
import type { Patient, Projection, SimPose, TubeState, PlacementMode } from "./types";
import { patientKinematics, type V3 } from "./patient-kinematics";
import type { ProjectionGeometry } from "./projection-physics";

const MODEL_ROOT = "/models/human-atlas/";
const ATLAS_HEIGHT_M = 1.7;
const CACHE = new Map<string, AtlasScene>();

interface AtlasPart { id:string; name:string; system:string; chunk:number; positions:number; normals:number; indices:number; vertexCount:number; indexCount:number; bounds:[number[],number[]]; }
interface AtlasManifest { version:string; parts:AtlasPart[]; chunks:{url:string;bytes:number}[]; triangles:number; }
interface AtlasScene { root:THREE.Group; meshes:THREE.Mesh[]; }
type Side=-1|1;

function regionFor(name:string):string {
  const n=name.toLowerCase();
  if(n.includes("rib")||n.includes("costal"))return"rib";
  if(n.includes("scapula"))return"scapula";
  if(n.includes("clavicle"))return"clavicle";
  if(n.includes("humerus"))return"humerus";
  if(n.includes("radius")||n.includes("ulna"))return"forearm";
  if(n.includes("hand")||n.includes("metacarp")||n.includes("phalanx")||n.includes("carpal"))return"hand";
  if(n.includes("femur"))return"femur";
  if(n.includes("tibia")||n.includes("fibula"))return"lowerleg";
  if(n.includes("foot")||n.includes("metatars")||n.includes("talus")||n.includes("calcaneus")||n.includes("tarsal"))return"foot";
  if(n.includes("pelvis")||n.includes("ilium")||n.includes("ischium")||n.includes("pubis")||n.includes("sacrum"))return"pelvis";
  if(n.includes("vertebra")||n.includes("spine")||n.includes("sternum")||n.includes("coccyx"))return"axial";
  if(n.includes("skull")||n.includes("mandible")||n.includes("maxilla")||n.includes("zygomatic")||n.includes("temporal")||n.includes("frontal")||n.includes("parietal"))return"skull";
  return"axial";
}
function sideFor(bounds:[number[],number[]]):Side{return((bounds[0][0]+bounds[1][0])*.5)<0?-1:1;}

async function loadAtlas():Promise<AtlasScene>{
  const cached=CACHE.get("atlas");if(cached)return cached;
  const response=await fetch(`${MODEL_ROOT}atlas.json`,{cache:"force-cache"});
  if(!response.ok)throw new Error(`Human Atlas manifest failed to load (${response.status}).`);
  const atlas=await response.json() as AtlasManifest;
  const parts=atlas.parts.filter(p=>p.system==="skeletal");
  if(!parts.length)throw new Error("Human Atlas contains no skeletal structures.");
  const root=new THREE.Group(),meshes:THREE.Mesh[]=[];
  const chunks=new Map<number,Array<{part:AtlasPart;buffer:ArrayBuffer}>>();
  await Promise.all([...new Set(parts.map(p=>p.chunk))].map(async chunkIndex=>{
    const chunk=atlas.chunks[chunkIndex];if(!chunk)throw new Error(`Human Atlas chunk ${chunkIndex} is missing.`);
    const r=await fetch(chunk.url,{cache:"force-cache"});if(!r.ok)throw new Error(`Human Atlas chunk ${chunkIndex} failed.`);
    const buffer=await r.arrayBuffer();
    if(buffer.byteLength!==chunk.bytes)throw new Error(`Human Atlas chunk ${chunkIndex} is incomplete.`);
    chunks.set(chunkIndex,parts.filter(p=>p.chunk===chunkIndex).map(part=>({part,buffer})));
  }));
  for(const{part,buffer}of[...chunks.values()].flat()){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.BufferAttribute(new Float32Array(buffer,part.positions,part.vertexCount*3),3));
    geometry.setAttribute("normal",new THREE.BufferAttribute(new Int16Array(buffer,part.normals,part.vertexCount*3),3,true));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer,part.indices,part.indexCount),1));
    const center=new THREE.Vector3((part.bounds[0][0]+part.bounds[1][0])*.5,(part.bounds[0][1]+part.bounds[1][1])*.5,(part.bounds[0][2]+part.bounds[1][2])*.5);
    geometry.translate(-center.x,-center.y,-center.z);
    const mesh=new THREE.Mesh(geometry);
    mesh.name=`Atlas radiograph ${part.name}`;
    mesh.userData.atlasRegion=regionFor(part.name);
    mesh.userData.atlasSide=sideFor(part.bounds);
    mesh.userData.atlasCenter=[center.x,center.y,center.z] as V3;
    root.add(mesh);meshes.push(mesh);
  }
  const scene={root,meshes};CACHE.set("atlas",scene);return scene;
}

function resetAtlas(root:THREE.Group,meshes:THREE.Mesh[],patient:Patient){
  root.position.set(0,0,0);root.rotation.set(0,0,0);root.quaternion.identity();
  root.scale.setScalar((patient.heightCm/100)/ATLAS_HEIGHT_M);
  for(const mesh of meshes){const c=mesh.userData.atlasCenter as V3;mesh.position.set(c[0],c[1],c[2]);mesh.quaternion.identity();mesh.scale.setScalar(1);mesh.visible=true;}
}
function groupMeshes(meshes:THREE.Mesh[],region:string,side:Side){return meshes.filter(m=>m.userData.atlasRegion===region&&m.userData.atlasSide===side);}
function groupAnchor(meshes:THREE.Mesh[]){if(!meshes.length)return new THREE.Vector3();return meshes.reduce((s,m)=>s.add(m.position),new THREE.Vector3()).multiplyScalar(1/meshes.length);}
function moveGroup(meshes:THREE.Mesh[],target:THREE.Vector3,rotation?:THREE.Quaternion){if(!meshes.length)return;const anchor=groupAnchor(meshes),q=rotation??new THREE.Quaternion();for(const mesh of meshes){const relative=mesh.position.clone().sub(anchor).applyQuaternion(q);mesh.position.copy(target).add(relative);mesh.quaternion.copy(q);}}

function articulate(root:THREE.Group,meshes:THREE.Mesh[],pose:SimPose,patient:Patient,placement:PlacementMode,projectionId:string){
  resetAtlas(root,meshes,patient);
  if(projectionId==="pa-chest"||projectionId==="lat-chest")return;
  const H=patient.heightCm/100,scale=H/ATLAS_HEIGHT_M;
  const kin=patientKinematics({H,s:1,shoulder:patient.morph.shoulder,hip:patient.morph.hip,limb:patient.morph.limb,elbowFlex:pose.elbowFlex,hipInternal:pose.hipInternal,armRaise:pose.armRaise,armSide:pose.armSide,armRotation:pose.armRotation,forearmRotation:pose.forearmRotation,shoulderRoll:pose.shoulderRoll,kneeFlex:pose.kneeFlex,projectionId,placement,buckyTilt:0});
  const local=(p:V3)=>new THREE.Vector3(p[0]/scale,p[1]/scale,p[2]/scale),mid=(a:THREE.Vector3,b:THREE.Vector3)=>a.clone().add(b).multiplyScalar(.5),dir=(a:V3,b:V3)=>new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]).normalize(),y=new THREE.Vector3(0,1,0);
  for(const side of[-1,1]as const){
    const arm=side<0?kin.arms[0]:kin.arms[1],leg=side<0?kin.legs[0]:kin.legs[1];
    const shoulder=local(arm.shoulder),elbow=local(arm.elbow),wrist=local(arm.wrist),hand=local(arm.hand),hip=local(leg.hip),knee=local(leg.knee),ankle=local(leg.ankle),foot=local(leg.foot);
    const ud=dir(arm.shoulder,arm.upper),fd=dir(arm.elbow,arm.wrist),td=dir(leg.hip,leg.knee),cd=dir(leg.knee,leg.ankle);
    moveGroup(groupMeshes(meshes,"humerus",side),mid(shoulder,elbow),new THREE.Quaternion().setFromUnitVectors(y,ud));
    moveGroup(groupMeshes(meshes,"forearm",side),mid(elbow,wrist),new THREE.Quaternion().setFromUnitVectors(y,fd));
    moveGroup(groupMeshes(meshes,"hand",side),hand,new THREE.Quaternion().setFromUnitVectors(y,fd));
    moveGroup(groupMeshes(meshes,"femur",side),mid(hip,knee),new THREE.Quaternion().setFromUnitVectors(y,td));
    moveGroup(groupMeshes(meshes,"lowerleg",side),mid(knee,ankle),new THREE.Quaternion().setFromUnitVectors(y,cd));
    moveGroup(groupMeshes(meshes,"foot",side),foot,new THREE.Quaternion().setFromUnitVectors(y,cd));
  }
}

function materialHU(region:string,projection:Projection){
  const chest=projection.id==="pa-chest"||projection.id==="lat-chest";
  if(chest){
    if(region==="rib")return{trabecular:220,cortical:650};
    if(region==="clavicle")return{trabecular:260,cortical:720};
    if(region==="scapula")return{trabecular:180,cortical:520};
    if(region==="axial")return{trabecular:240,cortical:700};
  }
  if(region==="skull")return{trabecular:650,cortical:1250};if(region==="pelvis")return{trabecular:500,cortical:1150};if(region==="rib"||region==="scapula"||region==="clavicle")return{trabecular:450,cortical:1050};if(region==="axial")return{trabecular:projection.id.includes("lumbar")?500:450,cortical:1050};if(region==="femur"||region==="lowerleg")return{trabecular:550,cortical:1250};if(region==="humerus"||region==="forearm")return{trabecular:500,cortical:1150};if(region==="hand"||region==="foot")return{trabecular:450,cortical:1000};return{trabecular:500,cortical:1100};
}
export function muFromHU(hu:number,kvp:number):number{const e=Math.pow(70/Math.max(45,kvp),.28),a=.0003*e,w=.205*e,b=.72*e;if(hu<=-1000)return a;if(hu<=0)return w+(hu/1000)*(w-a);if(hu<=1000)return w+(hu/1000)*(b-w);return b+Math.min(1000,hu-1000)*.00018*e;}

// RGB packs detector depth at ~24-bit precision while retaining an unsigned-byte
// render target that works reliably on mobile WebGL.
function unpackDepth24(buf:Uint8Array,j:number):number{return buf[j]!/255+buf[j+1]!/65025+buf[j+2]!/16581375;}
function renderMeshThickness(scene:THREE.Scene,root:THREE.Group,meshes:THREE.Mesh[],mesh:THREE.Mesh,camera:THREE.OrthographicCamera,renderer:THREE.WebGLRenderer,target:THREE.WebGLRenderTarget,frontMaterial:THREE.ShaderMaterial,backMaterial:THREE.ShaderMaterial,rw:number,rh:number):Float32Array{
  for(const m of meshes)m.visible=m===mesh;
  const front=new Uint8Array(rw*rh*4),back=new Uint8Array(rw*rh*4);
  root.updateMatrixWorld(true);
  scene.overrideMaterial=frontMaterial;renderer.setRenderTarget(target);renderer.clear(true,true,true);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,rw,rh,front);
  scene.overrideMaterial=backMaterial;renderer.clear(true,true,true);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,rw,rh,back);
  const out=new Float32Array(rw*rh),rangeM=camera.far-camera.near;
  for(let i=0;i<out.length;i++){
    const j=i*4,f=unpackDepth24(front,j),b=unpackDepth24(back,j);
    if(f>=.9999||b>=.9999||b<=f)continue;
    const thicknessCm=(b-f)*rangeM*100;
    if(thicknessCm>0&&thicknessCm<12)out[i]=thicknessCm;
  }
  return out;
}
function regionsForProjection(p:Projection){if(p.id==="pa-chest"||p.id==="lat-chest")return["axial","rib","scapula","clavicle"];return["axial","rib","scapula","clavicle","skull","pelvis","femur","lowerleg","humerus","forearm","hand","foot"];}
function chestRegionGain(region:string){if(region==="rib")return.42;if(region==="axial")return.26;if(region==="clavicle")return.38;if(region==="scapula")return.10;return.5;}
function chestThicknessCap(region:string){if(region==="rib")return.95;if(region==="axial")return1.8;if(region==="clavicle")return1.25;if(region==="scapula")return.55;return2.0;}

export async function atlasBoneOpticalDensity(args:{patient:Patient;projection:Projection;pose:SimPose;tube:TubeState;exposureKvp:number;width:number;height:number;geometry:ProjectionGeometry;}):Promise<Float32Array|null>{
  if(typeof document==="undefined"||typeof window==="undefined")return null;
  const{patient,projection,pose,tube,exposureKvp,width,height,geometry}=args;
  try{
    const atlas=await loadAtlas();
    const placement:PlacementMode=projection.setup==="table"||projection.setup==="tabletop"?"table":"upright-bucky";
    articulate(atlas.root,atlas.meshes,pose,patient,placement,projection.id);
    const rw=Math.min(448,Math.max(224,width)),rh=Math.min(448,Math.max(224,height));
    const targetYcm=projection.cr.y*patient.heightCm/170,targetXcm=projection.cr.x,targetY=patient.heightCm/100-targetYcm/100,target=new THREE.Vector3(targetXcm/100,targetY,0);
    const lateral=projection.anatomy==="torso-lat"||projection.anatomy==="cspine-lat"||projection.anatomy==="skull-lat";
    const camera=new THREE.OrthographicCamera(0,1,1,0,.01,5),halfW=tube.collimationW/geometry.magnification/200,halfH=tube.collimationH/geometry.magnification/200;
    camera.left=-halfW;camera.right=halfW;camera.top=halfH;camera.bottom=-halfH;
    camera.position.copy(lateral?new THREE.Vector3(target.x+2.5,target.y,target.z):new THREE.Vector3(target.x,target.y,target.z+2.5));camera.lookAt(target);camera.updateProjectionMatrix();
    const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,preserveDrawingBuffer:false});renderer.setSize(rw,rh,false);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.setClearColor(0xffffff,1);
    const scene=new THREE.Scene();scene.background=new THREE.Color(0xffffff);scene.add(atlas.root);
    const renderTarget=new THREE.WebGLRenderTarget(rw,rh,{format:THREE.RGBAFormat,type:THREE.UnsignedByteType,depthBuffer:true,stencilBuffer:false});
    const depthVertex=`varying float vDepth;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;vDepth=gl_Position.z/gl_Position.w*.5+.5;}`;
    const depthFragment=`varying float vDepth;vec3 packDepth24(float v){v=clamp(v,0.0,0.999999);vec3 enc=fract(v*vec3(1.0,255.0,65025.0));enc-=enc.yzz*vec3(1.0/255.0,1.0/255.0,0.0);return enc;}void main(){gl_FragColor=vec4(packDepth24(vDepth),1.0);}`;
    const frontMaterial=new THREE.ShaderMaterial({vertexShader:depthVertex,fragmentShader:depthFragment,side:THREE.FrontSide,depthTest:true,depthWrite:true}),backMaterial=new THREE.ShaderMaterial({vertexShader:depthVertex,fragmentShader:depthFragment,side:THREE.BackSide,depthTest:true,depthWrite:true});
    const low=new Float32Array(rw*rh),regions=regionsForProjection(projection),chest=projection.id==="pa-chest"||projection.id==="lat-chest";
    for(const mesh of atlas.meshes){
      const region=mesh.userData.atlasRegion as string;if(!regions.includes(region))continue;
      const thickness=renderMeshThickness(scene,atlas.root,atlas.meshes,mesh,camera,renderer,renderTarget,frontMaterial,backMaterial,rw,rh),hu=materialHU(region,projection),muTrab=muFromHU(hu.trabecular,exposureKvp),muCort=muFromHU(hu.cortical,exposureKvp),gain=chest?chestRegionGain(region):1,cap=chest?chestThicknessCap(region):12;
      for(let i=0;i<low.length;i++){
        const raw=thickness[i]!;if(raw<=0)continue;
        const t=Math.min(raw,cap),shellCm=Math.min(t*.22,chest?.14:.22),corticalPath=Math.min(t,shellCm*2),trabPath=Math.max(0,t-corticalPath);
        low[i]+=(corticalPath*muCort+trabPath*muTrab)*gain;
      }
    }
    // Overlapping thin bones should remain separable on a high-kVp chest rather
    // than accumulating into a solid white column. Keep this cap chest-only so
    // extremity/pelvis bone contrast is unaffected.
    if(chest)for(let i=0;i<low.length;i++)low[i]=Math.min(low[i]!,0.62);
    for(const m of atlas.meshes)m.visible=true;scene.overrideMaterial=null;renderer.dispose();renderTarget.dispose();frontMaterial.dispose();backMaterial.dispose();
    const full=new Float32Array(width*height);
    for(let y=0;y<height;y++){const sy=y/Math.max(1,height-1)*(rh-1),y0=Math.floor(sy),y1=Math.min(rh-1,y0+1),fy=sy-y0;for(let x=0;x<width;x++){const sx=x/Math.max(1,width-1)*(rw-1),x0=Math.floor(sx),x1=Math.min(rw-1,x0+1),fx=sx-x0,a=low[y0*rw+x0]!,b=low[y0*rw+x1]!,c=low[y1*rw+x0]!,d=low[y1*rw+x1]!;full[y*width+x]=a*(1-fx)*(1-fy)+b*fx*(1-fy)+c*(1-fx)*fy+d*fx*fy;}}
    return full;
  }catch(err){console.warn("[Bucky Lab] Atlas projection failed",err);return null;}
}
