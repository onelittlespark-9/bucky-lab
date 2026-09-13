import * as THREE from "three";
import type { Patient, Projection, TubeState } from "./types";
import type { ProjectionGeometry } from "./projection-physics";

const MODEL_ROOT = "/models/human-atlas/";
const ATLAS_HEIGHT_M = 1.7;

interface AtlasPart {
  name:string;
  system:string;
  chunk:number;
  positions:number;
  normals:number;
  indices:number;
  vertexCount:number;
  indexCount:number;
  bounds:[number[],number[]];
}
interface AtlasManifest { parts:AtlasPart[]; chunks:{url:string;bytes:number}[]; }
interface LoadedPart { mesh:THREE.Mesh; region:string; }
interface NativeAtlas { root:THREE.Group; parts:LoadedPart[]; }

let cache:Promise<NativeAtlas>|null=null;

function regionFor(name:string):string{
  const n=name.toLowerCase();
  if(n.includes("cartilage"))return "other";
  if(n.includes("rib")||n.includes("costal"))return "rib";
  if(n.includes("scapula"))return "scapula";
  if(n.includes("clavicle"))return "clavicle";
  if(n.includes("humerus"))return "humerus";
  if(n.includes("radius")||n.includes("ulna"))return "forearm";
  if(n.includes("hand")||n.includes("metacarp")||n.includes("phalan")||n.includes("carpal"))return "hand";
  if(n.includes("femur"))return "femur";
  if(n.includes("tibia")||n.includes("fibula"))return "lowerleg";
  if(n.includes("foot")||n.includes("metatars")||n.includes("talus")||n.includes("calcaneus")||n.includes("tarsal"))return "foot";
  if(n.includes("pelvis")||n.includes("ilium")||n.includes("ischium")||n.includes("pubis")||n.includes("sacrum"))return "pelvis";
  if(n.includes("vertebra")||n.includes("spine")||n.includes("sternum")||n.includes("coccyx"))return "axial";
  if(n.includes("skull")||n.includes("mandible")||n.includes("maxilla")||n.includes("zygomatic")||n.includes("temporal")||n.includes("frontal")||n.includes("parietal"))return "skull";
  return "other";
}

async function loadNativeAtlas():Promise<NativeAtlas>{
  if(cache)return cache;
  cache=(async()=>{
    const response=await fetch(`${MODEL_ROOT}atlas.json`,{cache:"force-cache"});
    if(!response.ok)throw new Error(`Whole-body atlas manifest failed (${response.status}).`);
    const atlas=await response.json() as AtlasManifest;
    const skeletal=atlas.parts.filter(p=>p.system==="skeletal");
    const chunks=new Map<number,ArrayBuffer>();
    await Promise.all([...new Set(skeletal.map(p=>p.chunk))].map(async index=>{
      const chunk=atlas.chunks[index];
      if(!chunk)throw new Error(`Whole-body atlas chunk ${index} missing.`);
      const r=await fetch(chunk.url,{cache:"force-cache"});
      if(!r.ok)throw new Error(`Whole-body atlas chunk ${index} failed.`);
      const b=await r.arrayBuffer();
      if(b.byteLength!==chunk.bytes)throw new Error(`Whole-body atlas chunk ${index} incomplete.`);
      chunks.set(index,b);
    }));
    const root=new THREE.Group(),parts:LoadedPart[]=[];
    for(const part of skeletal){
      const buffer=chunks.get(part.chunk);if(!buffer)continue;
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute("position",new THREE.BufferAttribute(new Float32Array(buffer,part.positions,part.vertexCount*3),3));
      geometry.setAttribute("normal",new THREE.BufferAttribute(new Int16Array(buffer,part.normals,part.vertexCount*3),3,true));
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer,part.indices,part.indexCount),1));
      const centre=new THREE.Vector3(
        (part.bounds[0][0]+part.bounds[1][0])*.5,
        (part.bounds[0][1]+part.bounds[1][1])*.5,
        (part.bounds[0][2]+part.bounds[1][2])*.5,
      );
      geometry.translate(-centre.x,-centre.y,-centre.z);
      const mesh=new THREE.Mesh(geometry);
      mesh.position.copy(centre);
      mesh.name=part.name;
      root.add(mesh);
      parts.push({mesh,region:regionFor(part.name)});
    }
    return {root,parts};
  })();
  return cache;
}

function muFromHU(hu:number,kvp:number):number{
  const e=Math.pow(70/Math.max(45,kvp),.28),air=.0003*e,water=.205*e,bone=.72*e;
  if(hu<=-1000)return air;
  if(hu<=0)return water+(hu/1000)*(water-air);
  if(hu<=1000)return water+(hu/1000)*(bone-water);
  return bone+Math.min(1000,hu-1000)*.00018*e;
}

function material(region:string){
  if(region==="skull")return{trab:380,cort:900,gain:.38,cap:1.25};
  if(region==="pelvis")return{trab:330,cort:780,gain:.38,cap:1.15};
  if(region==="axial")return{trab:300,cort:700,gain:.34,cap:.95};
  if(region==="rib")return{trab:180,cort:520,gain:.28,cap:.55};
  if(region==="clavicle"||region==="scapula")return{trab:240,cort:620,gain:.31,cap:.70};
  if(region==="femur"||region==="lowerleg")return{trab:330,cort:820,gain:.36,cap:1.10};
  if(region==="humerus"||region==="forearm")return{trab:300,cort:760,gain:.34,cap:.95};
  if(region==="hand"||region==="foot")return{trab:260,cort:680,gain:.31,cap:.75};
  return{trab:280,cort:700,gain:.32,cap:.85};
}

function unpackDepth24(buf:Uint8Array,j:number){return buf[j]!/255+buf[j+1]!/65025+buf[j+2]!/16581375;}

function renderThickness(
  scene:THREE.Scene,root:THREE.Group,all:LoadedPart[],part:LoadedPart,camera:THREE.OrthographicCamera,
  renderer:THREE.WebGLRenderer,target:THREE.WebGLRenderTarget,frontMat:THREE.ShaderMaterial,backMat:THREE.ShaderMaterial,w:number,h:number,
){
  for(const p of all)p.mesh.visible=p===part;
  root.updateMatrixWorld(true);
  const front=new Uint8Array(w*h*4),back=new Uint8Array(w*h*4);
  scene.overrideMaterial=frontMat;renderer.setRenderTarget(target);renderer.clear(true,true,true);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,w,h,front);
  scene.overrideMaterial=backMat;renderer.clear(true,true,true);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,w,h,back);
  const out=new Float32Array(w*h),range=camera.far-camera.near;
  for(let i=0;i<out.length;i++){
    const j=i*4,f=unpackDepth24(front,j),b=unpackDepth24(back,j);
    if(f>=.9999||b>=.9999||b<=f)continue;
    const cm=(b-f)*range*100;
    if(cm>0&&cm<12)out[i]=cm;
  }
  return out;
}

function blur(src:Float32Array,w:number,h:number):Float32Array{
  const out=new Float32Array(src.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let sum=0,n=0;
    for(let yy=Math.max(0,y-1);yy<=Math.min(h-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++){
      const weight=(xx===x&&yy===y)?4:(xx===x||yy===y)?2:1;
      sum+=src[yy*w+xx]!*weight;n+=weight;
    }
    out[y*w+x]=sum/n;
  }
  return out;
}

export async function wholeBodyAtlasOpticalDensity(args:{patient:Patient;projection:Projection;tube:TubeState;exposureKvp:number;width:number;height:number;geometry:ProjectionGeometry;}):Promise<Float32Array|null>{
  if(typeof document==="undefined"||typeof window==="undefined")return null;
  const{patient,tube,exposureKvp,width,height,geometry}=args;
  try{
    const atlas=await loadNativeAtlas();
    atlas.root.position.set(0,0,0);atlas.root.rotation.set(0,0,0);atlas.root.scale.setScalar((patient.heightCm/100)/ATLAS_HEIGHT_M);
    for(const p of atlas.parts){p.mesh.visible=true;p.mesh.quaternion.identity();}
    atlas.root.updateMatrixWorld(true);

    const bounds=new THREE.Box3().setFromObject(atlas.root),centre=bounds.getCenter(new THREE.Vector3());
    centre.x=0;
    const rw=Math.min(448,Math.max(224,width)),rh=Math.min(768,Math.max(320,height));
    const camera=new THREE.OrthographicCamera(0,1,1,0,.01,5);
    camera.left=-tube.collimationW/geometry.magnification/200;
    camera.right=tube.collimationW/geometry.magnification/200;
    camera.top=tube.collimationH/geometry.magnification/200;
    camera.bottom=-tube.collimationH/geometry.magnification/200;
    camera.position.set(centre.x,centre.y,centre.z+2.5);camera.lookAt(centre);camera.updateProjectionMatrix();

    const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,preserveDrawingBuffer:false});renderer.setSize(rw,rh,false);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.setClearColor(0xffffff,1);
    const scene=new THREE.Scene();scene.background=new THREE.Color(0xffffff);scene.add(atlas.root);
    const target=new THREE.WebGLRenderTarget(rw,rh,{format:THREE.RGBAFormat,type:THREE.UnsignedByteType,depthBuffer:true,stencilBuffer:false});
    const vertex=`varying float vDepth;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;vDepth=gl_Position.z/gl_Position.w*.5+.5;}`;
    const fragment=`varying float vDepth;vec3 packDepth24(float v){v=clamp(v,0.0,0.999999);vec3 enc=fract(v*vec3(1.0,255.0,65025.0));enc-=enc.yzz*vec3(1.0/255.0,1.0/255.0,0.0);return enc;}void main(){gl_FragColor=vec4(packDepth24(vDepth),1.0);}`;
    const frontMat=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,side:THREE.FrontSide,depthTest:true,depthWrite:true});
    const backMat=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,side:THREE.BackSide,depthTest:true,depthWrite:true});
    const low=new Float32Array(rw*rh);

    for(const part of atlas.parts){
      if(part.region==="other")continue;
      const thickness=renderThickness(scene,atlas.root,atlas.parts,part,camera,renderer,target,frontMat,backMat,rw,rh),m=material(part.region),muTrab=muFromHU(m.trab,exposureKvp),muCort=muFromHU(m.cort,exposureKvp);
      for(let i=0;i<low.length;i++){
        const raw=thickness[i]!;if(raw<=0)continue;
        const t=Math.min(raw,m.cap),shell=Math.min(.085,t*.10),cortical=Math.min(t,shell*2),trab=Math.max(0,t-cortical);
        low[i]+=(cortical*muCort+trab*muTrab)*m.gain;
      }
    }

    for(const p of atlas.parts)p.mesh.visible=true;
    const softened=blur(low,rw,rh);
    scene.overrideMaterial=null;renderer.dispose();target.dispose();frontMat.dispose();backMat.dispose();

    const full=new Float32Array(width*height);
    for(let y=0;y<height;y++){
      const sy=(1-y/Math.max(1,height-1))*(rh-1),y0=Math.floor(sy),y1=Math.min(rh-1,y0+1),fy=sy-y0;
      for(let x=0;x<width;x++){
        const sx=x/Math.max(1,width-1)*(rw-1),x0=Math.floor(sx),x1=Math.min(rw-1,x0+1),fx=sx-x0;
        const a=softened[y0*rw+x0]!,b=softened[y0*rw+x1]!,c=softened[y1*rw+x0]!,d=softened[y1*rw+x1]!;
        full[y*width+x]=Math.min(.42,a*(1-fx)*(1-fy)+b*fx*(1-fy)+c*(1-fx)*fy+d*fx*fy);
      }
    }
    return full;
  }catch(err){console.warn("[Bucky Lab] Whole-body atlas projection failed",err);return null;}
}
