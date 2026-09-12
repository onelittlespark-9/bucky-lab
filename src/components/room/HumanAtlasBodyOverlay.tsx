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
function localPoint(p:[number,number,number],scale:number){return new THREE.Vector3(p[0]/scale,p[1]/scale,p[2]/scale);}

function deformSkin(root:THREE.Group,patient:ReturnType<typeof patientById>,pose:ReturnType<typeof useSim.getState>["pose"]){
  const H=patient.heightCm/100,scale=H/ATLAS_HEIGHT_M;
  root.scale.setScalar(scale);
  const kin=patientKinematics({H,s:1,shoulder:patient.morph.shoulder,hip:patient.morph.hip,limb:patient.morph.limb,elbowFlex:pose.elbowFlex,hipInternal:pose.hipInternal,armRaise:pose.armRaise,armSide:pose.armSide,shoulderRoll:pose.shoulderRoll,armRotation:pose.armRotation,forearmRotation:pose.forearmRotation,kneeFlex:pose.kneeFlex,projectionId:"pa-chest",placement:"table",buckyTilt:0});
  // Atlas is in a standing neutral frame: arms and legs point down from the
  // shoulder/hip. The previous +Y leg axis inverted the femur/tibia rotation.
  const neutralArmAxis=new THREE.Vector3(0,-1,0),neutralLegAxis=new THREE.Vector3(0,-1,0);
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const attribute=object.geometry.getAttribute("position"),base=object.userData.basePositions as Float32Array|undefined;if(!base)return;
    const target=attribute.array as Float32Array;
    for(let i=0;i<target.length;i+=3){
      const original=new THREE.Vector3(base[i],base[i+1],base[i+2]),p=original.clone(),side:-1|1=p.x<0?-1:1,sideName=side<0?"left":"right";
      const arm=kin.arms[side<0?0:1],active=pose.armSide==null||pose.armSide===sideName;
      const shoulderPivot=localPoint(arm.shoulder,scale),elbowPivot=localPoint(arm.elbow,scale),wristPivot=localPoint(arm.wrist,scale);
      const upperDir=new THREE.Vector3(...arm.elbow).sub(new THREE.Vector3(...arm.shoulder)).normalize();
      const forearmDir=new THREE.Vector3(...arm.wrist).sub(new THREE.Vector3(...arm.elbow)).normalize();
      const upperQ=new THREE.Quaternion().setFromUnitVectors(neutralArmAxis,upperDir),forearmQ=new THREE.Quaternion().setFromUnitVectors(neutralArmAxis,forearmDir);
      const ax=Math.abs(p.x);
      const shoulderEnvelope=smoothstep(.13,.22,ax)*smoothstep(.63*H/scale,.70*H/scale,p.y)*(1-smoothstep(.75*H/scale,.80*H/scale,p.y));
      const upperArm=smoothstep(.17,.26,ax)*smoothstep(.55*H/scale,.68*H/scale,p.y)*(1-smoothstep(.67*H/scale,.78*H/scale,p.y));
      const forearm=smoothstep(.20,.32,ax)*smoothstep(.39*H/scale,.59*H/scale,p.y)*(1-smoothstep(.56*H/scale,.65*H/scale,p.y));
      const hand=smoothstep(.20,.31,ax)*smoothstep(.29*H/scale,.43*H/scale,p.y)*(1-smoothstep(.38*H/scale,.47*H/scale,p.y));
      if(active&&hand>.001){
        rotateAround(p,shoulderPivot,upperQ);
        const transformedElbow=elbowPivot.clone();rotateAround(transformedElbow,shoulderPivot,upperQ);
        rotateAround(p,transformedElbow,forearmQ);
        const transformedWrist=wristPivot.clone();rotateAround(transformedWrist,shoulderPivot,upperQ);rotateAround(transformedWrist,transformedElbow,forearmQ);
        const handQ=new THREE.Quaternion(...arm.handQuaternion);
        rotateAround(p,transformedWrist,handQ);
        p.lerp(original,1-hand);
      }else if(active&&forearm>.001){
        rotateAround(p,shoulderPivot,upperQ);
        const transformedElbow=elbowPivot.clone();rotateAround(transformedElbow,shoulderPivot,upperQ);
        rotateAround(p,transformedElbow,forearmQ);
        p.lerp(original,1-forearm);
      }else if(active&&upperArm>.001){
        rotateAround(p,shoulderPivot,upperQ);p.lerp(original,1-upperArm);
      }else if(active&&shoulderEnvelope>.001){
        rotateAround(p,shoulderPivot,upperQ);p.lerp(original,1-shoulderEnvelope);
      }

      const leg=kin.legs[side<0?0:1],hipPivot=localPoint(leg.hip,scale),kneePivot=localPoint(leg.knee,scale),anklePivot=localPoint(leg.ankle,scale);
      const hipQ=new THREE.Quaternion().setFromUnitVectors(neutralLegAxis,new THREE.Vector3(...leg.knee).sub(new THREE.Vector3(...leg.hip)).normalize());
      const kneeQ=new THREE.Quaternion().setFromUnitVectors(neutralLegAxis,new THREE.Vector3(...leg.ankle).sub(new THREE.Vector3(...leg.knee)).normalize());
      const thigh=smoothstep(.09,.17,ax)*smoothstep(.30*H/scale,.40*H/scale,p.y)*(1-smoothstep(.43*H/scale,.55*H/scale,p.y));
      const lowerLeg=smoothstep(.09,.18,ax)*smoothstep(.055*H/scale,.22*H/scale,p.y)*(1-smoothstep(.20*H/scale,.31*H/scale,p.y));
      const foot=smoothstep(.08,.19,ax)*(1-smoothstep(.09*H/scale,.20*H/scale,p.y));
      if(foot>.001){
        rotateAround(p,hipPivot,hipQ);
        const transformedKnee=kneePivot.clone();rotateAround(transformedKnee,hipPivot,hipQ);
        rotateAround(p,transformedKnee,kneeQ);
        const transformedAnkle=anklePivot.clone();rotateAround(transformedAnkle,hipPivot,hipQ);rotateAround(transformedAnkle,transformedKnee,kneeQ);
        p.sub(transformedAnkle).add(localPoint(leg.ankle,scale));
        p.lerp(original,1-foot);
      }else if(lowerLeg>.001){
        rotateAround(p,hipPivot,hipQ);
        const transformedKnee=kneePivot.clone();rotateAround(transformedKnee,hipPivot,hipQ);
        rotateAround(p,transformedKnee,kneeQ);
        p.lerp(original,1-lowerLeg);
      }else if(thigh>.001){
        rotateAround(p,hipPivot,hipQ);p.lerp(original,1-thigh);
      }
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
