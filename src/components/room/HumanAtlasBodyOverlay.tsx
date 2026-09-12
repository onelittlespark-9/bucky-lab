import { useEffect, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { patientKinematics } from "@/lib/sim/patient-kinematics";

interface AtlasPart { id:string; name:string; system:string; chunk:number; positions:number; normals:number; indices:number; vertexCount:number; indexCount:number; }
interface AtlasManifest { parts:AtlasPart[]; chunks:{url:string;bytes:number}[]; }
const MODEL_ROOT="/models/human-atlas/";
const ATLAS_HEIGHT_M=1.7;

async function loadBodySurface():Promise<THREE.Group>{
  const response=await fetch(`${MODEL_ROOT}atlas.json`,{cache:"force-cache"});
  if(!response.ok)throw new Error(`Human Atlas manifest failed to load (${response.status}).`);
  const atlas=await response.json() as AtlasManifest;
  const surface=atlas.parts.filter(part=>part.system==="integumentary");
  if(!surface.length)throw new Error("Human Atlas contains no integumentary body-surface structures.");
  const byChunk=new Map<number,AtlasPart[]>();
  for(const part of surface){const list=byChunk.get(part.chunk)??[];list.push(part);byChunk.set(part.chunk,list);}
  const root=new THREE.Group();root.name="BodyParts3D-Human-Atlas-Body-Surface";
  await Promise.all([...byChunk.entries()].map(async([chunkIndex,parts])=>{
    const chunk=atlas.chunks[chunkIndex];if(!chunk)throw new Error(`Human Atlas chunk ${chunkIndex} is missing from the manifest.`);
    const chunkResponse=await fetch(chunk.url,{cache:"force-cache"});if(!chunkResponse.ok)throw new Error(`Human Atlas chunk ${chunkIndex} failed to load (${chunkResponse.status}).`);
    const buffer=await chunkResponse.arrayBuffer();if(buffer.byteLength!==chunk.bytes)throw new Error(`Human Atlas chunk ${chunkIndex} is incomplete.`);
    const geometries:THREE.BufferGeometry[]=[];
    try{for(const part of parts){const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.BufferAttribute(new Float32Array(buffer,part.positions,part.vertexCount*3),3));geometry.setAttribute("normal",new THREE.BufferAttribute(new Int16Array(buffer,part.normals,part.vertexCount*3),3,true));geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer,part.indices,part.indexCount),1));geometries.push(geometry);}const merged=mergeGeometries(geometries,false);if(!merged)throw new Error(`Human Atlas chunk ${chunkIndex} could not be merged.`);merged.computeBoundingSphere();const mesh=new THREE.Mesh(merged,new THREE.MeshPhysicalMaterial({color:"#b88970",roughness:.66,metalness:0,clearcoat:.03,side:THREE.DoubleSide,depthWrite:true}));mesh.name=`Human Atlas body surface chunk ${chunkIndex}`;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.basePositions=new Float32Array(merged.getAttribute("position").array as Float32Array);root.add(mesh);}finally{for(const geometry of geometries)geometry.dispose();}
  }));
  return root;
}

function smoothstep(edge0:number,edge1:number,x:number){const t=THREE.MathUtils.clamp((x-edge0)/(edge1-edge0),0,1);return t*t*(3-2*t);}
function rotateAround(point:THREE.Vector3,pivot:THREE.Vector3,quaternion:THREE.Quaternion){point.sub(pivot).applyQuaternion(quaternion).add(pivot);}

function deformSkin(root:THREE.Group,patient:ReturnType<typeof patientById>,pose:ReturnType<typeof useSim.getState>["pose"]){
  const H=patient.heightCm/100,scale=H/ATLAS_HEIGHT_M;
  const kin=patientKinematics({H,s:1,shoulder:patient.morph.shoulder,hip:patient.morph.hip,limb:patient.morph.limb,elbowFlex:pose.elbowFlex,hipInternal:pose.hipInternal,armRaise:pose.armRaise,armSide:pose.armSide,shoulderRoll:pose.shoulderRoll,armRotation:pose.armRotation,forearmRotation:pose.forearmRotation,kneeFlex:pose.kneeFlex,projectionId:"pa-chest",placement:"table",buckyTilt:0});
  const neutralArmAxis=new THREE.Vector3(0,-1,0);
  const neutralLegAxis=new THREE.Vector3(0,1,0);
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const attribute=object.geometry.getAttribute("position"),base=object.userData.basePositions as Float32Array|undefined;if(!base)return;
    const target=attribute.array as Float32Array;
    for(let i=0;i<target.length;i+=3){
      const original=new THREE.Vector3(base[i],base[i+1],base[i+2]),p=original.clone(),side: -1|1=p.x<0?-1:1,sideName=side<0?"left":"right";
      const arm=kin.arms[side<0?0:1],active=pose.armSide==null||pose.armSide===sideName;
      const shoulderPivot=new THREE.Vector3(...arm.shoulder),elbowPivot=new THREE.Vector3(...arm.elbow);
      const upperDir=new THREE.Vector3(...arm.elbow).sub(new THREE.Vector3(...arm.shoulder)).normalize();
      const forearmDir=new THREE.Vector3(...arm.wrist).sub(new THREE.Vector3(...arm.elbow)).normalize();
      const upperQ=new THREE.Quaternion().setFromUnitVectors(neutralArmAxis,upperDir),forearmQ=new THREE.Quaternion().setFromUnitVectors(neutralArmAxis,forearmDir);
      const ax=Math.abs(p.x);
      const shoulderEnvelope=smoothstep(.13*scale,.22*scale,ax)*smoothstep(.63*H,.70*H,p.y)*(1-smoothstep(.75*H,.80*H,p.y));
      const upperArm=smoothstep(.17*scale,.26*scale,ax)*smoothstep(.56*H,.68*H,p.y)*(1-smoothstep(.68*H,.78*H,p.y));
      const forearm=smoothstep(.23*scale,.33*scale,ax)*smoothstep(.41*H,.59*H,p.y)*(1-smoothstep(.57*H,.64*H,p.y));
      if(active&&upperArm>.001){rotateAround(p,shoulderPivot,upperQ);p.lerp(original,1-upperArm);}else if(active&&forearm>.001){const transformedElbow=elbowPivot.clone();rotateAround(p,shoulderPivot,upperQ);rotateAround(transformedElbow,shoulderPivot,upperQ);rotateAround(p,transformedElbow,forearmQ);p.lerp(original,1-forearm);}else if(active&&shoulderEnvelope>.001){rotateAround(p,shoulderPivot,upperQ);p.lerp(original,1-shoulderEnvelope);}
      const hipEnvelope=smoothstep(.10*scale,.18*scale,ax),thigh=hipEnvelope*smoothstep(.32*H,.40*H,p.y)*(1-smoothstep(.45*H,.55*H,p.y)),lowerLeg=hipEnvelope*smoothstep(.06*H,.20*H,p.y)*(1-smoothstep(.22*H,.31*H,p.y));
      if(thigh>.001){const leg=kin.legs[side<0?0:1],q=new THREE.Quaternion().setFromUnitVectors(neutralLegAxis,new THREE.Vector3(...leg.knee).sub(new THREE.Vector3(...leg.hip)).normalize());rotateAround(p,new THREE.Vector3(...leg.hip),q);p.lerp(original,1-thigh);}else if(lowerLeg>.001){const leg=kin.legs[side<0?0:1],hipQ=new THREE.Quaternion().setFromUnitVectors(neutralLegAxis,new THREE.Vector3(...leg.knee).sub(new THREE.Vector3(...leg.hip)).normalize()),kneeQ=new THREE.Quaternion().setFromUnitVectors(neutralLegAxis,new THREE.Vector3(...leg.ankle).sub(new THREE.Vector3(...leg.knee)).normalize()),transformedKnee=new THREE.Vector3(...leg.knee);rotateAround(p,new THREE.Vector3(...leg.hip),hipQ);rotateAround(transformedKnee,new THREE.Vector3(...leg.hip),hipQ);rotateAround(p,transformedKnee,kneeQ);p.lerp(original,1-lowerLeg);}
      target[i]=p.x;target[i+1]=p.y;target[i+2]=p.z;
    }
    attribute.needsUpdate=true;object.geometry.computeVertexNormals();object.geometry.computeBoundingSphere();
  });
}

export function HumanAtlasBodyOverlay(){
  const visible=useSim(s=>s.anatomyVisibility.skin),patientId=useSim(s=>s.patientId),pose=useSim(s=>s.pose);
  const [atlas,setAtlas]=useState<THREE.Group|null>(null),[error,setError]=useState<string|null>(null);
  useEffect(()=>{let cancelled=false;loadBodySurface().then(group=>{if(cancelled){group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}});return;}setAtlas(group);}).catch(reason=>{if(!cancelled)setError(reason instanceof Error?reason.message:"Human Atlas body surface could not be loaded.");});return()=>{cancelled=true;};},[]);
  useEffect(()=>{if(!atlas)return;deformSkin(atlas,patientById(patientId),pose);},[atlas,patientId,pose]);
  useEffect(()=>()=>{atlas?.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}});},[atlas]);
  if(!visible||error||!atlas)return null;return <primitive object={atlas}/>;
}
