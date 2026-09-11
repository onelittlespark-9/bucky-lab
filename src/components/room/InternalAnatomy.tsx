import * as THREE from "three";
import { useMemo } from "react";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { scaleLandmarkY } from "@/lib/sim/projections";
import { SHARED_ORGANS, scaleAnatomyCm } from "@/lib/sim/anatomy-structures";
import { HeartMesh, KidneyMesh, LiverMesh, LungMesh, StomachMesh } from "./AnatomicalMeshes";
import { BoneJointLayer } from "./BoneJointLayer";

type V3=[number,number,number];
function Material({color,opacity,roughness=.65}:{color:string;opacity:number;roughness?:number}){return <meshPhysicalMaterial color={color} transparent opacity={opacity} roughness={roughness} metalness={0} depthWrite={false} depthTest={false} side={THREE.DoubleSide}/>;}
function Tube({points,radius,color,opacity}:{points:V3[];radius:number;color:string;opacity:number}){const curve=useMemo(()=>new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),[points]),geometry=useMemo(()=>new THREE.TubeGeometry(curve,18,radius,8,false),[curve,radius]);return <mesh geometry={geometry} renderOrder={9}><Material color={color} opacity={opacity}/></mesh>;}
function LayeredTorso({H,width,depth,exposing,skin,showFat,showMuscle,showSkin}:{H:number;width:number;depth:number;exposing:boolean;skin:string;showFat:boolean;showMuscle:boolean;showSkin:boolean}){const muscleOpacity=exposing?.22:.065,fatOpacity=exposing?.14:.045,profile=(w:number,h:number)=>[[w*.44,.42*h],[w*.70,.48*h],[w*.91,.57*h],[w*1,.66*h],[w*.98,.74*h],[w*.82,.80*h],[w*.53,.85*h]] as [number,number][];return <group renderOrder={2}>{showFat&&<mesh scale={[1,1,Math.max(.5,depth/Math.max(.001,width))]}><latheGeometry args={[profile(width*.98,H),48]}/><Material color="#c18c68" opacity={fatOpacity}/></mesh>}{showMuscle&&<mesh scale={[1,1,Math.max(.5,depth*.80/Math.max(.001,width*.90))]}><latheGeometry args={[profile(width*.90,H),48]}/><Material color="#a85f56" opacity={muscleOpacity}/></mesh>}{showSkin&&<mesh scale={[1,1,Math.max(.5,depth*.62/Math.max(.001,width*.80))]}><latheGeometry args={[profile(width*.80,H),48]}/><Material color={skin} opacity={exposing?.035:.012}/></mesh>}</group>;}

export function InternalAnatomy(){
 const patientId=useSim(s=>s.patientId),projectionId=useSim(s=>s.projectionId),exposing=useSim(s=>s.exposing),vis=useSim(s=>s.anatomyVisibility),pose=useSim(s=>s.pose),equipment=useSim(s=>s.equipment),patient=patientById(patientId),H=patient.heightCm/100,s=H/1.7,torsoW=.32*patient.morph.torsoWidth*s,torsoD=.24*patient.morph.torsoDepth*s,anatomyOpacity=exposing?.96:.34,lateral=projectionId.includes("lat"),point=(cm:number)=>H-scaleAnatomyCm(cm,patient.heightCm)/100,organScale=(cm:number)=>scaleAnatomyCm(cm,patient.heightCm)/100,Y={head:.955*H,neck:.86*H,shoulder:.79*H,pelvis:H-scaleLandmarkY(72,patient.heightCm)/100};
 const organs=Object.fromEntries(SHARED_ORGANS.map(o=>[o.id,o])),lungY=point(43.5),lungHeight=organScale(24)*.5,lungWidth=organScale(10)*.5,lungDepth=organScale(8.3)*.5,lungZ=lateral?.015*torsoD:0,heart=organs.heart!,liver=organs.liver!,stomach=organs.stomach!,rightKidney=organs["kidney-right"]!,leftKidney=organs["kidney-left"]!;
 const kyphosis=patient.morph.kyphosis*.22,oblique=pose.oblique*Math.PI/180,yaw=pose.rotationY*Math.PI/180,wall=equipment.placement!=="table",bodyThickness=Math.max(.13*s,.12*patient.morph.torsoDepth*s*1.05),footRadiusY=.045*s,footSole=.055*H-.012*s-footRadiusY;
 let groupPos:V3,groupRot:V3;
 if(wall){const floorY=equipment.placement==="seated"?.38:0,requestedY=floorY+equipment.patientY,floorLockedY=equipment.placement==="seated"?requestedY:Math.max(floorY-footSole,requestedY);groupPos=[equipment.patientX,floorLockedY,(equipment.placement==="upright-bucky"?-.48:-.32)+equipment.patientZ];groupRot=[0,yaw,0];}else{const tableTop=equipment.tableHeight+.075;groupPos=[equipment.tableX+equipment.patientX,tableTop+bodyThickness+equipment.patientY,equipment.tableZ+H*.5+equipment.patientZ];groupRot=[-Math.PI/2,0,yaw];}
 return <group position={groupPos} rotation={groupRot}>
  <group rotation={[kyphosis,oblique,0]}>
   <LayeredTorso H={H} width={torsoW} depth={torsoD} exposing={exposing} skin={patient.skin} showFat={vis.fat} showMuscle={vis.muscle} showSkin={vis.skin}/>
   {vis.skeleton&&<BoneJointLayer H={H} s={s} torsoWidth={patient.morph.torsoWidth} torsoDepth={patient.morph.torsoDepth} shoulder={patient.morph.shoulder} hip={patient.morph.hip} patientMorph={{limb:patient.morph.limb}} pose={{elbowFlex:pose.elbowFlex,hipInternal:pose.hipInternal,armRaise:pose.armRaise,shoulderRoll:pose.shoulderRoll}} opacity={anatomyOpacity}/>} 
   {vis.organs&&<>
    <LungMesh position={[organScale(-7.2)*patient.morph.torsoWidth,lungY,lungZ]} scale={[lungWidth,lungHeight,lungDepth]} color="#709daa" opacity={anatomyOpacity*.70}/>
    <LungMesh position={[organScale(7)*patient.morph.torsoWidth,lungY+.002*s,lungZ]} scale={[organScale(9.1)*.5,organScale(23)*.5,organScale(8)*.5]} color="#709daa" opacity={anatomyOpacity*.70}/>
    <HeartMesh position={[organScale(heart.xCm),point(heart.yCm),lateral?.028*torsoD:.035*torsoD]} scale={[organScale(heart.widthCm)*.52,organScale(heart.heightCm)*.53,organScale(heart.depthCm)*.48]} color="#a74f5d" opacity={anatomyOpacity*.92}/>
    <LiverMesh position={[organScale(liver.xCm),point(liver.yCm),.018*torsoD]} scale={[organScale(liver.widthCm)*.54,organScale(liver.heightCm)*.48,organScale(liver.depthCm)*.46]} color="#8c6245" opacity={anatomyOpacity*.82}/>
    <StomachMesh position={[organScale(stomach.xCm),point(stomach.yCm),.012*torsoD]} scale={[organScale(stomach.widthCm)*.54,organScale(stomach.heightCm)*.52,organScale(stomach.depthCm)*.48]} color="#a76558" opacity={anatomyOpacity*.78}/>
    <KidneyMesh position={[organScale(rightKidney.xCm),point(rightKidney.yCm),-.018*torsoD]} scale={[organScale(rightKidney.widthCm)*.55,organScale(rightKidney.heightCm)*.54,organScale(rightKidney.depthCm)*.52]} color="#9a655b" opacity={anatomyOpacity*.78}/>
    <KidneyMesh position={[organScale(leftKidney.xCm),point(leftKidney.yCm),-.018*torsoD]} scale={[organScale(leftKidney.widthCm)*.55,organScale(leftKidney.heightCm)*.54,organScale(leftKidney.depthCm)*.52]} color="#9a655b" opacity={anatomyOpacity*.78}/>
    <Tube points={[[0,point(20),.02*torsoD],[0,point(28),.02*torsoD],[0,point(35),.018*torsoD],[0,point(44),.012*torsoD]]} radius={.009*s} color="#78aeb7" opacity={anatomyOpacity*.85}/>
   </>}
  </group>
 </group>;
}
