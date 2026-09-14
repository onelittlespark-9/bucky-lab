import * as THREE from "three";
import type { Patient, Projection, SimPose, TubeState, PlacementMode } from "./types";
import type { ProjectionGeometry } from "./projection-physics";
import { patientKinematics, type V3 } from "./patient-kinematics";
import { linearAttenuation } from "./nist-attenuation";

const MODEL_ROOT = "/models/human-atlas/";
const ATLAS_HEIGHT_M = 1.7;

type BoneRegion = "rib"|"scapula"|"clavicle"|"humerus"|"forearm"|"hand"|"femur"|"patella"|"lowerleg"|"foot"|"pelvis"|"axial"|"skull"|"other";
type Side = -1|1;

interface AtlasPart { name:string; system:string; chunk:number; positions:number; normals:number; indices:number; vertexCount:number; indexCount:number; bounds:[number[],number[]]; }
interface AtlasManifest { parts:AtlasPart[]; chunks:{url:string;bytes:number}[]; }
interface LoadedPart { mesh:THREE.Mesh; region:BoneRegion; side:Side; sourceName:string; center:V3; }
interface LoadedAtlas { root:THREE.Group; parts:LoadedPart[]; }

let atlasCache: Promise<LoadedAtlas> | null = null;

function clamp01(v:number){ return Math.max(0, Math.min(1, v)); }
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
      g.setAttribute("normal",new THREE.BufferAttribute(new Int16Array(buffer,part.normals,part.vertexCount*3),3,true));
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

function seedFor(s:string){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function hash2(x:number,y:number,seed:number){let h=Math.imul((x|0)^seed,374761393)^Math.imul((y|0)+seed,668265263);h=(h^(h>>>13))*1274126177;return((h^(h>>>16))>>>0)/4294967295;}
function noise(x:number,y:number,seed:number,scale:number){const sx=x/scale,sy=y/scale,x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0,ux=fx*fx*(3-2*fx),uy=fy*fy*(3-2*fy),a=hash2(x0,y0,seed),b=hash2(x0+1,y0,seed),c=hash2(x0,y0+1,seed),d=hash2(x0+1,y0+1,seed);return(a+(b-a)*ux)*(1-uy)+(c+(d-c)*ux)*uy;}
function unpackDepth(b:Uint8Array,j:number){return b[j]!/255+b[j+1]!/65025+b[j+2]!/16581375;}
function projectThickness(scene:THREE.Scene,atlas:LoadedAtlas,part:LoadedPart,camera:THREE.OrthographicCamera,renderer:THREE.WebGLRenderer,target:THREE.WebGLRenderTarget,fm:THREE.ShaderMaterial,bm:THREE.ShaderMaterial,w:number,h:number){
  for(const p of atlas.parts)p.mesh.visible=p===part;atlas.root.updateMatrixWorld(true);
  const front=new Uint8Array(w*h*4),back=new Uint8Array(w*h*4);
  scene.overrideMaterial=fm;renderer.setRenderTarget(target);renderer.clear(true,true,true);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,w,h,front);
  scene.overrideMaterial=bm;renderer.clear(true,true,true);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,w,h,back);
  const out=new Float32Array(w*h),range=camera.far-camera.near;
  for(let i=0;i<out.length;i++){const j=i*4,f=unpackDepth(front,j),b=unpackDepth(back,j);if(f>=.9999||b>=.9999)continue;const cm=Math.abs(b-f)*range*100;if(cm>.002&&cm<15)out[i]=cm;}
  return out;
}
function blur(src:Float32Array,w:number,h:number){const out=new Float32Array(src.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0,n=0;for(let yy=Math.max(0,y-1);yy<=Math.min(h-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++){const wt=xx===x&&yy===y?8:xx===x||yy===y?1:.35;s+=src[yy*w+xx]!*wt;n+=wt;}out[y*w+x]=s/n;}return out;}
function distanceToBoundary(src:Float32Array,w:number,h:number){const inf=1e6,d=new Float32Array(src.length);for(let i=0;i<d.length;i++)d[i]=src[i]>.001?inf:0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!d[i])continue;let v=d[i]!;if(x)v=Math.min(v,d[i-1]!+1);if(y)v=Math.min(v,d[i-w]!+1);if(x&&y)v=Math.min(v,d[i-w-1]!+1.414);if(x<w-1&&y)v=Math.min(v,d[i-w+1]!+1.414);d[i]=v;}for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;if(!d[i])continue;let v=d[i]!;if(x<w-1)v=Math.min(v,d[i+1]!+1);if(y<h-1)v=Math.min(v,d[i+w]!+1);if(x<w-1&&y<h-1)v=Math.min(v,d[i+w+1]!+1.414);if(x&&y<h-1)v=Math.min(v,d[i+w-1]!+1.414);d[i]=v;}return d;}

interface BoneProfile { gain:number; cap:number; shellPx:number; marrow:number; texture:number; overlap:number; heterogeneity:number; }
function profile(region:BoneRegion):BoneProfile{switch(region){case"skull":return{gain:.142,cap:.58,shellPx:1.18,marrow:.66,texture:.92,overlap:.14,heterogeneity:.26};case"pelvis":return{gain:.154,cap:.56,shellPx:1.46,marrow:.76,texture:.72,overlap:.30,heterogeneity:.16};case"axial":return{gain:.071,cap:.24,shellPx:.90,marrow:.87,texture:1.18,overlap:.62,heterogeneity:.45};case"rib":return{gain:.060,cap:.13,shellPx:.62,marrow:.88,texture:1.24,overlap:.68,heterogeneity:.52};case"clavicle":return{gain:.150,cap:.36,shellPx:1.05,marrow:.62,texture:.60,overlap:.30,heterogeneity:.12};case"scapula":return{gain:.112,cap:.29,shellPx:.96,marrow:.76,texture:.76,overlap:.34,heterogeneity:.18};case"femur":return{gain:.195,cap:.70,shellPx:1.48,marrow:.97,texture:.44,overlap:.30,heterogeneity:.10};case"lowerleg":return{gain:.178,cap:.60,shellPx:1.34,marrow:.97,texture:.48,overlap:.30,heterogeneity:.10};case"humerus":return{gain:.184,cap:.62,shellPx:1.40,marrow:.96,texture:.46,overlap:.30,heterogeneity:.10};case"forearm":return{gain:.168,cap:.52,shellPx:1.22,marrow:.96,texture:.50,overlap:.28,heterogeneity:.12};case"patella":return{gain:.150,cap:.34,shellPx:.88,marrow:.74,texture:.72,overlap:.26,heterogeneity:.18};case"hand":case"foot":return{gain:.205,cap:.38,shellPx:.46,marrow:.68,texture:.96,overlap:.14,heterogeneity:.28};default:return{gain:.155,cap:.40,shellPx:1.08,marrow:.70,texture:.64,overlap:.32,heterogeneity:.14};}}
function bulkDensity(region:BoneRegion,name:string){const n=name.toLowerCase();if(region==="skull")return n.includes("mandible")?1.60:n.includes("temporal")?1.58:1.47;if(region==="rib")return 1.27;if(region==="humerus")return 1.40;if(region==="femur")return 1.33;if(region==="pelvis")return n.includes("sacrum")?1.25:1.20;if(region==="axial")return 1.21;if(region==="forearm"||region==="lowerleg")return 1.34;if(region==="hand"||region==="foot")return 1.25;if(region==="scapula"||region==="clavicle")return 1.28;return 1.20;}
function isLong(region:BoneRegion){return region==="femur"||region==="lowerleg"||region==="humerus"||region==="forearm";}
function isFlat(region:BoneRegion){return region==="skull"||region==="pelvis"||region==="axial"||region==="scapula"||region==="rib";}

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
    const optical=new Float32Array(rw*rh),overlap=new Float32Array(rw*rh),muCort=linearAttenuation("corticalBone",exposureKvp),muTrab=linearAttenuation("trabecularBone",exposureKvp),muMarrow=linearAttenuation("adipose",exposureKvp),muSoft=linearAttenuation("soft",exposureKvp);
    for(const part of atlas.parts){
      if(part.region==="other")continue;
      const raw=projectThickness(scene,atlas,part,camera,renderer,targetRT,fm,bm,rw,rh),smooth=blur(raw,rw,rh),distance=distanceToBoundary(raw,rw,rh),p=profile(part.region),long=isLong(part.region),flat=isFlat(part.region),small=part.region==="hand"||part.region==="foot"||part.region==="patella",seed=seedFor(part.sourceName),partVariation=.90+.20*((seed%997)/996),densityScale=Math.max(.76,Math.min(1.34,bulkDensity(part.region,part.sourceName)/1.18))*partVariation;
      for(let i=0;i<optical.length;i++){
        const r=raw[i]!;if(r<=0)continue;
        const projected=Math.min(p.cap,r*.94+smooth[i]!*.06),x=i%rw,y=(i/rw)|0,dist=distance[i]!;
        const interior=clamp01((dist-p.shellPx*.20)/Math.max(.75,p.shellPx*3.15)),rim=1-interior;
        const fine=noise(x,y,seed,small?1.8:3.5)-.5,mid=noise(x,y,seed^0x85ebca6b,small?4.2:7.6)-.5,coarse=noise(x,y,seed^0x9e3779b9,small?8:17)-.5,macro=noise(x,y,seed^0x27d4eb2d,small?14:29)-.5;
        const structure=clamp01(.5+fine*.46+mid*.34+coarse*.20),ripple=1+(structure-.5)*p.texture+macro*p.heterogeneity,regionalTrab=muMarrow+(muTrab-muMarrow)*densityScale;

        let corticalFraction=flat?.050+.32*Math.pow(rim,.82):.11+.47*Math.pow(rim,.76);
        if(part.region==="skull")corticalFraction=.050+.31*Math.pow(rim,.74);
        if(part.region==="axial"||part.region==="rib")corticalFraction=.026+.23*Math.pow(rim,.86);
        if(long)corticalFraction=.090+.57*Math.pow(rim,.68);
        if(small)corticalFraction=.082+.48*Math.pow(rim,.70);

        const canal=long?Math.pow(interior,1.36)*clamp01((projected-.055)/.18):0;
        let corticalPath=Math.min(projected*.66,projected*corticalFraction);
        if(long)corticalPath=Math.min(projected*.60,corticalPath*(.78+.22*(1-interior)));
        const inner=Math.max(0,projected-corticalPath);
        let marrowFraction=flat?p.marrow*(.78+.24*interior):p.marrow*(.52+.46*interior);
        if(long)marrowFraction=p.marrow*(.035+.965*canal);
        if(small)marrowFraction=p.marrow*(.28+.58*interior);
        marrowFraction=clamp01(marrowFraction+(.5-structure)*(part.region==="axial"||part.region==="rib"?.44:flat?.25:small?.13:.08));
        const marrowPath=inner*marrowFraction,trabPath=inner-marrowPath;

        let central=1;
        if(part.region==="skull")central=1-.32*interior*(.28+.72*structure);
        else if(part.region==="axial"||part.region==="rib")central=1-.82*interior*(.38+.62*structure);
        else if(flat)central=1-.52*interior*(.44+.56*structure);
        else if(long)central=1-.88*canal*(.72+.28*structure);
        else if(small)central=1-.17*interior*(.55+.45*structure);

        const corticalDelta=Math.max(0,muCort-muSoft),trabDelta=Math.max(0,regionalTrab*Math.max(.46,ripple)*Math.max(.09,central)-muSoft),marrowDelta=muMarrow-muSoft;
        let regionalVariation=1;
        if(part.region==="rib"||part.region==="axial")regionalVariation=(.61+.68*structure+.18*coarse)*partVariation;
        else if(part.region==="skull")regionalVariation=(.82+.34*structure+.14*macro)*partVariation;
        else if(small)regionalVariation=(.91+.26*structure+.08*fine)*partVariation;
        const materialOD=(corticalPath*corticalDelta+trabPath*trabDelta+marrowPath*marrowDelta)*p.gain*regionalVariation;
        const base=Math.max(0,materialOD),scale=1/(1+overlap[i]!*p.overlap);
        optical[i]+=base*scale;
        overlap[i]+=Math.min(1,base/.020);
      }
    }
    for(const p of atlas.parts)p.mesh.visible=true;scene.overrideMaterial=null;renderer.dispose();targetRT.dispose();fm.dispose();bm.dispose();
    const full=new Float32Array(width*height);for(let y=0;y<height;y++){const sy=(1-y/Math.max(1,height-1))*(rh-1),y0=Math.floor(sy),y1=Math.min(rh-1,y0+1),fy=sy-y0;for(let x=0;x<width;x++){const sx=x/Math.max(1,width-1)*(rw-1),x0=Math.floor(sx),x1=Math.min(rw-1,x0+1),fx=sx-x0,a=optical[y0*rw+x0]!,b=optical[y0*rw+x1]!,c=optical[y1*rw+x0]!,d=optical[y1*rw+x1]!;full[y*width+x]=Math.min(.235,a*(1-fx)*(1-fy)+b*fx*(1-fy)+c*(1-fx)*fy+d*fx*fy);}}
    return full;
  }catch(err){console.warn("[Bucky Lab] Unified skeletal atlas projection failed",err);return null;}
}