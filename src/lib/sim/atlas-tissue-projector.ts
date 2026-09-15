import * as THREE from "three";
import type { Patient, Projection, TubeState } from "./types";
import type { ProjectionGeometry } from "./projection-physics";
import { primaryOpticalDepth } from "./nist-attenuation";
import { isAtlasAirway, isAtlasLungParenchyma } from "./atlas-tissue-classification";

const MODEL_ROOT="/models/human-atlas/",ATLAS_HEIGHT_M=1.7;
const SYSTEMS=new Set(["integumentary","muscular","respiratory","cardiac","digestive","urinary","arterial","venous","nervous"]);
interface AtlasPart{name:string;system:string;chunk:number;positions:number;indices:number;vertexCount:number;indexCount:number;bounds:[number[],number[]];}
interface AtlasManifest{parts:AtlasPart[];chunks:{url:string;bytes:number}[];}
interface LoadedPart{mesh:THREE.Mesh;system:string;name:string;}
interface TissueAtlas{root:THREE.Group;parts:LoadedPart[];}
export interface AtlasTissueMaterialPaths{adipose:Float32Array;muscle:Float32Array;soft:Float32Array;inflatedLung:Float32Array;blood:Float32Array;brain:Float32Array;air:Float32Array;}
let cache:Promise<TissueAtlas>|null=null;
async function loadAtlas():Promise<TissueAtlas>{if(cache)return cache;cache=(async()=>{const r=await fetch(`${MODEL_ROOT}atlas.json`,{cache:"force-cache"});if(!r.ok)throw new Error(`Tissue atlas manifest failed (${r.status}).`);const m=await r.json() as AtlasManifest,selected=m.parts.filter(p=>SYSTEMS.has(p.system)),chunks=new Map<number,ArrayBuffer>();await Promise.all([...new Set(selected.map(p=>p.chunk))].map(async i=>{const c=m.chunks[i];if(!c)throw new Error(`Atlas chunk ${i} missing.`);const q=await fetch(c.url,{cache:"force-cache"}),b=await q.arrayBuffer();if(!q.ok||b.byteLength!==c.bytes)throw new Error(`Atlas chunk ${i} failed.`);chunks.set(i,b);}));const root=new THREE.Group(),parts:LoadedPart[]=[];for(const p of selected){const b=chunks.get(p.chunk);if(!b)continue;const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.BufferAttribute(new Float32Array(b,p.positions,p.vertexCount*3),3));g.setIndex(new THREE.BufferAttribute(new Uint32Array(b,p.indices,p.indexCount),1));const c=new THREE.Vector3((p.bounds[0][0]+p.bounds[1][0])*.5,(p.bounds[0][1]+p.bounds[1][1])*.5,(p.bounds[0][2]+p.bounds[1][2])*.5);g.translate(-c.x,-c.y,-c.z);const mesh=new THREE.Mesh(g);mesh.position.copy(c);root.add(mesh);parts.push({mesh,system:p.system,name:p.name});}return{root,parts};})();return cache;}
const clamp01=(v:number)=>Math.max(0,Math.min(1,v));
function unpack(b:Uint8Array,j:number){return b[j]!/255+b[j+1]!/65025+b[j+2]!/16581375;}
function project(scene:THREE.Scene,a:TissueAtlas,test:(p:LoadedPart)=>boolean,c:THREE.OrthographicCamera,r:THREE.WebGLRenderer,t:THREE.WebGLRenderTarget,fm:THREE.ShaderMaterial,bm:THREE.ShaderMaterial,w:number,h:number){for(const p of a.parts)p.mesh.visible=test(p);a.root.updateMatrixWorld(true);const f=new Uint8Array(w*h*4),b=new Uint8Array(w*h*4);scene.overrideMaterial=fm;r.setRenderTarget(t);r.clear(true,true,true);r.render(scene,c);r.readRenderTargetPixels(t,0,0,w,h,f);scene.overrideMaterial=bm;r.clear(true,true,true);r.render(scene,c);r.readRenderTargetPixels(t,0,0,w,h,b);const out=new Float32Array(w*h),range=c.far-c.near;for(let i=0;i<out.length;i++){const j=i*4,x=unpack(f,j),y=unpack(b,j);if(x<.9999&&y<.9999){const cm=Math.abs(y-x)*range*100;if(cm>.001&&cm<60)out[i]=cm;}}return out;}
function parts(scene:THREE.Scene,a:TissueAtlas,test:(p:LoadedPart)=>boolean,c:THREE.OrthographicCamera,r:THREE.WebGLRenderer,t:THREE.WebGLRenderTarget,fm:THREE.ShaderMaterial,bm:THREE.ShaderMaterial,w:number,h:number,cap:number,total:number){const out=new Float32Array(w*h);for(const p of a.parts.filter(test)){const q=project(scene,a,x=>x===p,c,r,t,fm,bm,w,h);for(let i=0;i<out.length;i++)out[i]=Math.min(total,out[i]!+Math.min(cap,q[i]!));}return out;}
function blur(src:Float32Array,w:number,h:number,passes=1){let cur=src;for(let p=0;p<passes;p++){const tmp=new Float32Array(src.length),out=new Float32Array(src.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0,n=0;for(let d=-1;d<=1;d++){const xx=Math.max(0,Math.min(w-1,x+d)),wt=d?1:2;s+=cur[y*w+xx]!*wt;n+=wt;}tmp[y*w+x]=s/n;}for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0,n=0;for(let d=-1;d<=1;d++){const yy=Math.max(0,Math.min(h-1,y+d)),wt=d?1:2;s+=tmp[yy*w+x]!*wt;n+=wt;}out[y*w+x]=s/n;}cur=out;}return cur;}
function sample(s:Float32Array,w:number,h:number,x:number,y:number){x=Math.max(0,Math.min(w-1,x));y=Math.max(0,Math.min(h-1,y));const x0=Math.floor(x),x1=Math.min(w-1,x0+1),y0=Math.floor(y),y1=Math.min(h-1,y0+1),fx=x-x0,fy=y-y0;return s[y0*w+x0]!*(1-fx)*(1-fy)+s[y0*w+x1]!*fx*(1-fy)+s[y1*w+x0]!*(1-fx)*fy+s[y1*w+x1]!*fx*fy;}
function replace(target:number,lung:{v:number},soft:{v:number}){let d=0,t=Math.min(lung.v,target);lung.v-=t;d+=t;t=Math.min(soft.v,target-d);soft.v-=t;return d+t;}
function resample(src:Float32Array,rw:number,rh:number,width:number,height:number){const full=new Float32Array(width*height);for(let y=0;y<height;y++){const sy=(1-y/Math.max(1,height-1))*(rh-1);for(let x=0;x<width;x++)full[y*width+x]=sample(src,rw,rh,x/Math.max(1,width-1)*(rw-1),sy);}return full;}

export async function projectAtlasTissuePaths(args:{patient:Patient;projection:Projection;tube:TubeState;width:number;height:number;geometry:ProjectionGeometry;wholeBody?:boolean;}):Promise<AtlasTissueMaterialPaths|null>{
  if(typeof document==="undefined"||typeof window==="undefined")return null;
  const{patient,projection,tube,width,height,geometry,wholeBody=false}=args;
  try{
    const a=await loadAtlas();a.root.position.set(0,0,0);a.root.rotation.set(0,0,0);a.root.quaternion.identity();a.root.scale.setScalar(patient.heightCm/100/ATLAS_HEIGHT_M);for(const p of a.parts){p.mesh.visible=true;p.mesh.quaternion.identity();}a.root.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(a.root),centre=bounds.getCenter(new THREE.Vector3());centre.x=0;const rw=Math.min(640,Math.max(256,width)),rh=Math.min(1600,Math.max(512,height));let target=centre.clone();if(!wholeBody){const y=projection.cr.y*patient.heightCm/170;target=new THREE.Vector3(projection.cr.x/100,patient.heightCm/100-y/100,0);}const lateral=/torso-lat|cspine-lat|skull-lat/.test(projection.anatomy),camera=new THREE.OrthographicCamera(0,1,1,0,.01,5),halfW=tube.collimationW/geometry.magnification/200,halfH=tube.collimationH/geometry.magnification/200;camera.left=-halfW;camera.right=halfW;camera.top=halfH;camera.bottom=-halfH;camera.position.copy(lateral?new THREE.Vector3(target.x+2.5,target.y,target.z):new THREE.Vector3(target.x,target.y,target.z+2.5));camera.lookAt(target);camera.updateProjectionMatrix();const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,preserveDrawingBuffer:false});renderer.setSize(rw,rh,false);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.setClearColor(0xffffff,1);const scene=new THREE.Scene();scene.background=new THREE.Color(0xffffff);scene.add(a.root);const rt=new THREE.WebGLRenderTarget(rw,rh,{format:THREE.RGBAFormat,type:THREE.UnsignedByteType,depthBuffer:true,stencilBuffer:false}),vs=`varying float vDepth;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;vDepth=gl_Position.z/gl_Position.w*.5+.5;}`,fs=`varying float vDepth;vec3 packDepth24(float v){v=clamp(v,0.0,0.999999);vec3 e=fract(v*vec3(1.0,255.0,65025.0));e-=e.yzz*vec3(1.0/255.0,1.0/255.0,0.0);return e;}void main(){gl_FragColor=vec4(packDepth24(vDepth),1.0);}`,fm=new THREE.ShaderMaterial({vertexShader:vs,fragmentShader:fs,side:THREE.FrontSide,depthTest:true,depthWrite:true}),bm=new THREE.ShaderMaterial({vertexShader:vs,fragmentShader:fs,side:THREE.BackSide,depthTest:true,depthWrite:true});
    const P=(test:(p:LoadedPart)=>boolean,cap:number,total:number,passes:number)=>blur(parts(scene,a,test,camera,renderer,rt,fm,bm,rw,rh,cap,total),rw,rh,passes);
    // The integumentary mesh is the outer patient envelope. Project it alone first: combining it with
    // disconnected muscles can make front/back depth select unrelated surfaces and collapse the ray chord.
    const skinBody=blur(project(scene,a,p=>p.system==="integumentary",camera,renderer,rt,fm,bm,rw,rh),rw,rh,3);
    const muscleBody=blur(project(scene,a,p=>p.system==="muscular",camera,renderer,rt,fm,bm,rw,rh),rw,rh,3);
    const muscle=P(p=>p.system==="muscular"&&!/diaphragm/i.test(p.name),8,24,3);
    const left=P(p=>isAtlasLungParenchyma(p)&&p.mesh.getWorldPosition(new THREE.Vector3()).x<0,20,30,1);
    const right=P(p=>isAtlasLungParenchyma(p)&&p.mesh.getWorldPosition(new THREE.Vector3()).x>=0,20,30,1);
    const airway=P(p=>isAtlasAirway(p),1.8,5,1);
    const heart=blur(project(scene,a,p=>p.system==="cardiac",camera,renderer,rt,fm,bm,rw,rh),rw,rh,1);
    const vessels=P(p=>p.system==="arterial"||p.system==="venous",.70,3.0,1);
    const diaphragm=blur(project(scene,a,p=>p.system==="muscular"&&/diaphragm/i.test(p.name),camera,renderer,rt,fm,bm,rw,rh),rw,rh,1);
    const liver=P(p=>p.system==="digestive"&&/liver|hepat/i.test(p.name),10,12,1);
    const hollow=P(p=>p.system==="digestive"&&/stomach|colon|intestin|cecum|rect|duoden/i.test(p.name),4,8,1);
    const urinary=P(p=>p.system==="urinary"&&/kidney|renal|bladder/i.test(p.name),5,8,1);
    const brain=blur(project(scene,a,p=>p.system==="nervous"&&/brain|cerebr|encephal/i.test(p.name),camera,renderer,rt,fm,bm,rw,rh),rw,rh,1);
    const maps:AtlasTissueMaterialPaths={adipose:new Float32Array(rw*rh),muscle:new Float32Array(rw*rh),soft:new Float32Array(rw*rh),inflatedLung:new Float32Array(rw*rh),blood:new Float32Array(rw*rh),brain:new Float32Array(rw*rh),air:new Float32Array(rw*rh)};
    for(let i=0;i<skinBody.length;i++){
      // Prefer the closed skin envelope; muscle depth is a conservative fallback for atlas gaps in hands/feet.
      const skin=skinBody[i]!,muscleChord=muscleBody[i]!,B=skin>.12?skin:muscleChord;
      if(B<=.003)continue;
      const baseMuscle=Math.min(B*.28,Math.max(muscle[i]!*.12,B*.055));
      const fat=Math.min(B*.24,Math.max(B*.045,(B-baseMuscle)*.12));
      const internal=Math.max(0,B-baseMuscle-fat);
      // Each projected lung is already a physical chord. It replaces the soft-tissue envelope rather than
      // being added to it; using max preserves separate left/right fields without doubling overlap.
      const literalLung=Math.max(left[i]!,right[i]!);
      const lungPresence=clamp01((literalLung-.025)/.22);
      const lungTarget=Math.min(internal*.94,literalLung*lungPresence);
      const lung={v:lungTarget},soft={v:Math.max(0,internal-lungTarget)};
      let mp=baseMuscle,bp=0,brainp=0,airp=0;
      const heartTarget=Math.min(internal*.80,heart[i]!*1.00);
      const vesselTarget=Math.min(internal*.18,vessels[i]!*0.24);
      const diaphragmTarget=Math.min(internal*.28,diaphragm[i]!*0.72);
      let r=replace(heartTarget,lung,soft);mp+=r*.35;bp+=r*.65;
      r=replace(vesselTarget,lung,soft);bp+=r;
      r=replace(Math.min(internal*.12,airway[i]!*.78),lung,soft);airp+=r;
      r=replace(diaphragmTarget,lung,soft);mp+=r*.95;bp+=r*.05;
      const br=Math.min(soft.v,brain[i]!*0.94);soft.v-=br;brainp+=br;
      const lv=Math.min(soft.v,Math.min(internal*.52,liver[i]!*0.50));soft.v-=lv;mp+=lv*.50;bp+=lv*.50;
      const renal=Math.min(soft.v,Math.min(internal*.20,urinary[i]!*0.36));soft.v-=renal;mp+=renal*.40;bp+=renal*.60;
      const gas=Math.min(soft.v*.34,hollow[i]!*0.14);soft.v-=gas;airp+=gas;
      maps.adipose[i]=fat;maps.muscle[i]=mp;maps.soft[i]=soft.v;maps.inflatedLung[i]=lung.v;maps.blood[i]=bp;maps.brain[i]=brainp;maps.air[i]=airp;
    }
    for(const p of a.parts)p.mesh.visible=true;scene.overrideMaterial=null;renderer.dispose();rt.dispose();fm.dispose();bm.dispose();
    return{adipose:resample(maps.adipose,rw,rh,width,height),muscle:resample(maps.muscle,rw,rh,width,height),soft:resample(maps.soft,rw,rh,width,height),inflatedLung:resample(maps.inflatedLung,rw,rh,width,height),blood:resample(maps.blood,rw,rh,width,height),brain:resample(maps.brain,rw,rh,width,height),air:resample(maps.air,rw,rh,width,height)};
  }catch(err){console.warn("[Bucky Lab] Unified tissue atlas path projection failed",err);return null;}
}

export async function projectAtlasTissueOD(args:{patient:Patient;projection:Projection;tube:TubeState;exposureKvp:number;width:number;height:number;geometry:ProjectionGeometry;wholeBody?:boolean;}):Promise<Float32Array|null>{const paths=await projectAtlasTissuePaths(args);if(!paths)return null;const out=new Float32Array(args.width*args.height);for(let i=0;i<out.length;i++)out[i]=primaryOpticalDepth({adipose:paths.adipose[i]!,muscle:paths.muscle[i]!,soft:paths.soft[i]!,inflatedLung:paths.inflatedLung[i]!,blood:paths.blood[i]!,brain:paths.brain[i]!,air:paths.air[i]!},args.exposureKvp);return out;}
