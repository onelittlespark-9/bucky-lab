import * as THREE from "three";
import { useMemo } from "react";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { SHARED_ORGANS, scaleAnatomyCm } from "@/lib/sim/anatomy-structures";
import { HeartMesh, KidneyMesh, LiverMesh, LungMesh, StomachMesh } from "./AnatomicalMeshes";
import { BoneJointLayer } from "./BoneJointLayer";

type V3 = [number, number, number];

function TissueMaterial({ color, opacity, roughness = .7 }: { color: string; opacity: number; roughness?: number }) {
  return <meshPhysicalMaterial color={color} transparent opacity={opacity} roughness={roughness} metalness={0} depthWrite={false} depthTest={false} side={THREE.DoubleSide} />;
}

function Ellipsoid({ position, scale, color, opacity, roughness = .7 }: { position: V3; scale: V3; color: string; opacity: number; roughness?: number }) {
  return <mesh position={position} scale={scale} renderOrder={3}><sphereGeometry args={[1, 28, 20]} /><TissueMaterial color={color} opacity={opacity} roughness={roughness} /></mesh>;
}

function Sleeve({ a, b, radius, color, opacity }: { a: V3; b: V3; radius: number; color: string; opacity: number }) {
  const { position, quaternion, length } = useMemo(() => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start);
    const length = direction.length();
    return { position: start.clone().add(end).multiplyScalar(.5), quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()), length };
  }, [a, b]);
  return <mesh position={position} quaternion={quaternion} renderOrder={3}><capsuleGeometry args={[radius, Math.max(.01, length - radius * 1.55), 12, 20]} /><TissueMaterial color={color} opacity={opacity} /></mesh>;
}

function AttachedSoftTissue({ H, s, torsoWidth, torsoDepth, shoulder, hip, limb, pose, showFat, showMuscle, showSkin, skin, exposing }: {
  H: number; s: number; torsoWidth: number; torsoDepth: number; shoulder: number; hip: number; limb: number;
  pose: { elbowFlex: number; hipInternal: number; armRaise: number; shoulderRoll: number };
  showFat: boolean; showMuscle: boolean; showSkin: boolean; skin: string; exposing: boolean;
}) {
  const Y = { head: .955 * H, neck: .86 * H, shoulder: .79 * H, chest: .70 * H, waist: .59 * H, pelvis: .47 * H, knee: .245 * H, ankle: .055 * H };
  const shoulderWidth = .205 * shoulder * s, hipGap = .085 * hip * s, limbR = .043 * limb * s;
  const elbow = pose.elbowFlex * Math.PI / 180, raise = Math.max(0, Math.min(1, pose.armRaise));
  const fatOpacity = exposing ? .18 : .055, muscleOpacity = exposing ? .20 : .06, skinOpacity = exposing ? .055 : .012;
  const armPoints = (side: -1 | 1) => {
    const shoulderPoint: V3 = [side * shoulderWidth, Y.shoulder, 0];
    let upper: V3, elbowPoint: V3, wrist: V3;
    if (raise > .35) {
      upper = [side * (shoulderWidth + .03 * s), Y.shoulder + .12 * H * raise, .02 * s];
      elbowPoint = [side * (shoulderWidth + .015 * s), Y.shoulder + .22 * H * raise, .035 * s];
      wrist = [side * .075 * s, Y.shoulder + .31 * H * raise, .04 * s];
    } else {
      upper = [side * (shoulderWidth + .055 * limb * s), Y.shoulder, 0];
      elbowPoint = [upper[0] + side * .005 * s, upper[1] - .16 * s * Math.cos(elbow), .02 * s * Math.sin(elbow)];
      wrist = [elbowPoint[0] + side * .012 * s, elbowPoint[1] - .16 * s * Math.cos(elbow), .04 * s * Math.sin(elbow)];
    }
    return { shoulderPoint, upper, elbowPoint, wrist };
  };
  return <group renderOrder={3}>
    {showFat && <>
      <Ellipsoid position={[0, Y.pelvis, 0]} scale={[.128 * hip * s, .102 * torsoWidth * s / .32, .116 * torsoDepth * s / .24]} color="#c18c68" opacity={fatOpacity} />
      <Ellipsoid position={[0, Y.waist, 0]} scale={[.151 * torsoWidth * s, .157 * torsoWidth * s, .108 * torsoDepth * s]} color="#c18c68" opacity={fatOpacity} />
      <Ellipsoid position={[0, Y.chest, 0]} scale={[.158 * torsoWidth * s, .218 * s, .116 * torsoDepth * s]} color="#c18c68" opacity={fatOpacity} />
    </>}
    {showMuscle && <>
      <Ellipsoid position={[0, Y.pelvis + .008 * s, -.004 * s]} scale={[.124 * hip * s, .097 * torsoWidth * s / .32, .108 * torsoDepth * s / .24]} color="#a85f56" opacity={muscleOpacity} />
      <Ellipsoid position={[0, Y.waist, -.004 * s]} scale={[.143 * torsoWidth * s, .148 * torsoWidth * s, .098 * torsoDepth * s]} color="#a85f56" opacity={muscleOpacity} />
      <Ellipsoid position={[0, Y.chest, -.005 * s]} scale={[.149 * torsoWidth * s, .205 * s, .105 * torsoDepth * s]} color="#a85f56" opacity={muscleOpacity} />
    </>}
    {showSkin && <>
      <Ellipsoid position={[0, Y.pelvis, 0]} scale={[.129 * hip * s, .104 * torsoWidth * s / .32, .121 * torsoDepth * s / .24]} color={skin} opacity={skinOpacity} />
      <Ellipsoid position={[0, Y.waist, 0]} scale={[.156 * torsoWidth * s, .163 * torsoWidth * s, .113 * torsoDepth * s]} color={skin} opacity={skinOpacity} />
      <Ellipsoid position={[0, Y.chest, 0]} scale={[.163 * torsoWidth * s, .223 * s, .121 * torsoDepth * s]} color={skin} opacity={skinOpacity} />
    </>}
    {([-1, 1] as const).map(side => {
      const a = armPoints(side);
      const muscle = showMuscle ? <><Sleeve a={a.shoulderPoint} b={a.upper} radius={limbR * 1.28} color="#a85f56" opacity={muscleOpacity} /><Sleeve a={a.upper} b={a.elbowPoint} radius={limbR} color="#a85f56" opacity={muscleOpacity} /><Sleeve a={a.elbowPoint} b={a.wrist} radius={limbR * .86} color="#a85f56" opacity={muscleOpacity} /></> : null;
      const fat = showFat ? <><Sleeve a={a.shoulderPoint} b={a.upper} radius={limbR * 1.52} color="#c18c68" opacity={fatOpacity} /><Sleeve a={a.upper} b={a.elbowPoint} radius={limbR * 1.24} color="#c18c68" opacity={fatOpacity} /><Sleeve a={a.elbowPoint} b={a.wrist} radius={limbR * 1.08} color="#c18c68" opacity={fatOpacity} /></> : null;
      const surface = showSkin ? <><Sleeve a={a.shoulderPoint} b={a.upper} radius={limbR * 1.60} color={skin} opacity={skinOpacity} /><Sleeve a={a.upper} b={a.elbowPoint} radius={limbR * 1.32} color={skin} opacity={skinOpacity} /><Sleeve a={a.elbowPoint} b={a.wrist} radius={limbR * 1.14} color={skin} opacity={skinOpacity} /></> : null;
      return <group key={`arm-tissue-${side}`}>{fat}{muscle}{surface}</group>;
    })}
    {([-1, 1] as const).map(side => {
      const hipPoint: V3 = [side * hipGap, Y.pelvis - .01 * s, 0];
      const thigh: V3 = [side * (hipGap + .008 * s), Y.knee + .12 * H, side * .008 * s];
      const knee: V3 = [side * (hipGap + .006 * s), Y.knee, side * .012 * s];
      const calf: V3 = [side * (hipGap + .006 * s), Y.ankle + .12 * H, side * .008 * s];
      return <group key={`leg-tissue-${side}`}>
        {showFat && <><Sleeve a={hipPoint} b={thigh} radius={limbR * 1.72} color="#c18c68" opacity={fatOpacity} /><Sleeve a={thigh} b={knee} radius={limbR * 1.42} color="#c18c68" opacity={fatOpacity} /><Sleeve a={knee} b={calf} radius={limbR * 1.22} color="#c18c68" opacity={fatOpacity} /></>}
        {showMuscle && <><Sleeve a={hipPoint} b={thigh} radius={limbR * 1.48} color="#a85f56" opacity={muscleOpacity} /><Sleeve a={thigh} b={knee} radius={limbR * 1.20} color="#a85f56" opacity={muscleOpacity} /><Sleeve a={knee} b={calf} radius={limbR * 1.02} color="#a85f56" opacity={muscleOpacity} /></>}
        {showSkin && <><Sleeve a={hipPoint} b={thigh} radius={limbR * 1.80} color={skin} opacity={skinOpacity} /><Sleeve a={thigh} b={knee} radius={limbR * 1.50} color={skin} opacity={skinOpacity} /><Sleeve a={knee} b={calf} radius={limbR * 1.28} color={skin} opacity={skinOpacity} /></>}
      </group>;
    })}
  </group>;
}

function Tube({ points, radius, color, opacity }: { points: V3[]; radius: number; color: string; opacity: number }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), [points]);
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 18, radius, 8, false), [curve, radius]);
  return <mesh geometry={geometry} renderOrder={9}><TissueMaterial color={color} opacity={opacity} /></mesh>;
}

export function InternalAnatomy() {
  const patientId = useSim(s => s.patientId), projectionId = useSim(s => s.projectionId), exposing = useSim(s => s.exposing), vis = useSim(s => s.anatomyVisibility), pose = useSim(s => s.pose), equipment = useSim(s => s.equipment), patient = patientById(patientId);
  const H = patient.heightCm / 100, s = H / 1.7, torsoW = .32 * patient.morph.torsoWidth * s, torsoD = .24 * patient.morph.torsoDepth * s, anatomyOpacity = exposing ? .96 : .34, lateral = projectionId.includes("lat");
  const point = (cm: number) => H - scaleAnatomyCm(cm, patient.heightCm) / 100, organScale = (cm: number) => scaleAnatomyCm(cm, patient.heightCm) / 100;
  const organs = Object.fromEntries(SHARED_ORGANS.map(o => [o.id, o])), lungY = point(43.5), lungHeight = organScale(24) * .5, lungWidth = organScale(10) * .5, lungDepth = organScale(8.3) * .5, lungZ = lateral ? .015 * torsoD : 0;
  const heart = organs.heart!, liver = organs.liver!, stomach = organs.stomach!, rightKidney = organs["kidney-right"]!, leftKidney = organs["kidney-left"]!;
  const kyphosis = patient.morph.kyphosis * .22, oblique = pose.oblique * Math.PI / 180, yaw = pose.rotationY * Math.PI / 180, wall = equipment.placement !== "table", bodyThickness = Math.max(.13 * s, .12 * patient.morph.torsoDepth * s * 1.05), footRadiusY = .045 * s, footSole = .055 * H - .012 * s - footRadiusY;
  let groupPos: V3, groupRot: V3;
  if (wall) { const floorY = equipment.placement === "seated" ? .38 : 0, requestedY = floorY + equipment.patientY, floorLockedY = equipment.placement === "seated" ? requestedY : Math.max(floorY - footSole, requestedY); groupPos = [equipment.patientX, floorLockedY, (equipment.placement === "upright-bucky" ? -.48 : -.32) + equipment.patientZ]; groupRot = [0, yaw, 0]; }
  else { const tableTop = equipment.tableHeight + .075; groupPos = [equipment.tableX + equipment.patientX, tableTop + bodyThickness + equipment.patientY, equipment.tableZ + H * .5 + equipment.patientZ]; groupRot = [-Math.PI / 2, 0, yaw]; }
  return <group position={groupPos} rotation={groupRot}>
    <group rotation={[kyphosis, oblique, 0]}>
      <AttachedSoftTissue H={H} s={s} torsoWidth={torsoW} torsoDepth={torsoD} shoulder={patient.morph.shoulder} hip={patient.morph.hip} limb={patient.morph.limb} pose={{ elbowFlex: pose.elbowFlex, hipInternal: pose.hipInternal, armRaise: pose.armRaise, shoulderRoll: pose.shoulderRoll }} showFat={vis.fat} showMuscle={vis.muscle} showSkin={vis.skin} skin={patient.skin} exposing={exposing} />
      {vis.skeleton && <BoneJointLayer H={H} s={s} torsoWidth={patient.morph.torsoWidth} torsoDepth={patient.morph.torsoDepth} shoulder={patient.morph.shoulder} hip={patient.morph.hip} patientMorph={{ limb: patient.morph.limb }} pose={{ elbowFlex: pose.elbowFlex, hipInternal: pose.hipInternal, armRaise: pose.armRaise, shoulderRoll: pose.shoulderRoll }} projectionId={projectionId} opacity={anatomyOpacity} />}
      {vis.organs && <>
        <LungMesh position={[organScale(-7.2) * patient.morph.torsoWidth, lungY, lungZ]} scale={[lungWidth, lungHeight, lungDepth]} color="#709daa" opacity={anatomyOpacity * .70} />
        <LungMesh position={[organScale(7) * patient.morph.torsoWidth, lungY + .002 * s, lungZ]} scale={[organScale(9.1) * .5, organScale(23) * .5, organScale(8) * .5]} color="#709daa" opacity={anatomyOpacity * .70} />
        <HeartMesh position={[organScale(heart.xCm), point(heart.yCm), lateral ? .028 * torsoD : .035 * torsoD]} scale={[organScale(heart.widthCm) * .52, organScale(heart.heightCm) * .53, organScale(heart.depthCm) * .48]} color="#a74f5d" opacity={anatomyOpacity * .92} />
        <LiverMesh position={[organScale(liver.xCm), point(liver.yCm), .018 * torsoD]} scale={[organScale(liver.widthCm) * .54, organScale(liver.heightCm) * .48, organScale(liver.depthCm) * .46]} color="#8c6245" opacity={anatomyOpacity * .82} />
        <StomachMesh position={[organScale(stomach.xCm), point(stomach.yCm), .012 * torsoD]} scale={[organScale(stomach.widthCm) * .54, organScale(stomach.heightCm) * .52, organScale(stomach.depthCm) * .48]} color="#a76558" opacity={anatomyOpacity * .78} />
        <KidneyMesh position={[organScale(rightKidney.xCm), point(rightKidney.yCm), -.018 * torsoD]} scale={[organScale(rightKidney.widthCm) * .55, organScale(rightKidney.heightCm) * .54, organScale(rightKidney.depthCm) * .52]} color="#9a655b" opacity={anatomyOpacity * .78} />
        <KidneyMesh position={[organScale(leftKidney.xCm), point(leftKidney.yCm), -.018 * torsoD]} scale={[organScale(leftKidney.widthCm) * .55, organScale(leftKidney.heightCm) * .54, organScale(leftKidney.depthCm) * .52]} color="#9a655b" opacity={anatomyOpacity * .78} />
        <Tube points={[[0, point(20), .02 * torsoD], [0, point(28), .02 * torsoD], [0, point(35), .018 * torsoD], [0, point(44), .012 * torsoD]]} radius={.009 * s} color="#78aeb7" opacity={anatomyOpacity * .85} />
      </>}
    </group>
  </group>;
}
