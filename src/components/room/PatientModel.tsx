import * as THREE from "three";
import { useMemo, type ReactNode } from "react";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { scaleLandmarkY, LANDMARKS } from "@/lib/sim/projections";

const SKIN_ROUGHNESS = 0.58;
type V3 = [number, number, number];

function Skin({ color, children }: { color: string; children?: ReactNode }) { return <meshPhysicalMaterial color={color} roughness={SKIN_ROUGHNESS} metalness={0} clearcoat={0.035}>{children}</meshPhysicalMaterial>; }
function Ellipsoid({ position, scale, color, rotation = [0, 0, 0], castShadow = true }: { position: V3; scale: V3; color: string; rotation?: V3; castShadow?: boolean }) { return <mesh position={position} rotation={rotation} scale={scale} castShadow={castShadow}><sphereGeometry args={[1, 24, 16]} /><Skin color={color} /></mesh>; }
function Segment({ a, b, radius, color }: { a: V3; b: V3; radius: number; color: string }) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b); const direction = end.clone().sub(start); const length = direction.length(); const midpoint = start.clone().add(end).multiplyScalar(0.5); const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return <mesh position={midpoint} quaternion={quat} castShadow><capsuleGeometry args={[radius, Math.max(0.02, length - radius * 1.55), 8, 16]} /><Skin color={color} /></mesh>;
}
function Hand({ position, side, color, scale }: { position: V3; side: -1 | 1; color: string; scale: number }) {
  const fingers = [0, 1, 2, 3].map(i => -0.035 * scale + i * 0.022 * scale);
  return <group position={position}><Ellipsoid position={[0, 0, 0]} scale={[0.055 * scale, 0.085 * scale, 0.035 * scale]} color={color} />{fingers.map((x, i) => <Segment key={i} a={[x, -0.01 * scale, 0]} b={[x + side * 0.004 * scale, -0.075 * scale, 0]} radius={0.009 * scale} color={color} />)}<Segment a={[side * 0.045 * scale, 0.01 * scale, 0]} b={[side * 0.075 * scale, -0.045 * scale, 0]} radius={0.011 * scale} color={color} /></group>;
}
function Foot({ position, color, scale }: { position: V3; color: string; scale: number }) {
  return <group position={position}><Ellipsoid position={[0, 0, 0]} scale={[0.065 * scale, 0.045 * scale, 0.145 * scale]} color={color} /><Ellipsoid position={[0, -0.006, 0.115 * scale]} scale={[0.062 * scale, 0.04 * scale, 0.075 * scale]} color={color} />{[0, 1, 2, 3, 4].map(i => <Ellipsoid key={i} position={[(i - 2) * 0.018 * scale, 0.006, 0.18 * scale]} scale={[0.013 * scale, 0.018 * scale, 0.025 * scale]} color={color} />)}</group>;
}
function Head({ skin, hair, chin, scale }: { skin: string; hair: string; chin: number; scale: number }) {
  return <group rotation={[-chin, 0, 0]} scale={scale}><Ellipsoid position={[0, 0.92, 0]} scale={[0.095, 0.12, 0.09]} color={skin} /><Ellipsoid position={[0, 0.865, 0.015]} scale={[0.065, 0.055, 0.072]} color={skin} /><Ellipsoid position={[0, 0.855, 0.075]} scale={[0.025, 0.018, 0.028]} color={skin} /><Ellipsoid position={[-0.052, 0.938, 0.079]} scale={[0.012, 0.009, 0.006]} color="#24303a" /><Ellipsoid position={[0.052, 0.938, 0.079]} scale={[0.012, 0.009, 0.006]} color="#24303a" /><Ellipsoid position={[0, 0.916, 0.088]} scale={[0.012, 0.025, 0.012]} color={skin} /><Ellipsoid position={[0, 0.878, 0.09]} scale={[0.025, 0.008, 0.006]} color="#9d6262" /><Ellipsoid position={[-0.103, 0.925, 0]} scale={[0.012, 0.028, 0.022]} color={skin} /><Ellipsoid position={[0.103, 0.925, 0]} scale={[0.012, 0.028, 0.022]} color={skin} /><Ellipsoid position={[0, 1.015, -0.005]} scale={[0.101, 0.07, 0.088]} color={hair} castShadow={false} /><Ellipsoid position={[0, 0.986, 0.07]} scale={[0.085, 0.04, 0.045]} color={hair} castShadow={false} /></group>;
}

export function PatientModel() {
  const patientId = useSim(s => s.patientId); const pose = useSim(s => s.pose); const equipment = useSim(s => s.equipment); const showLandmarks = useSim(s => s.showLandmarks); const setLandmarkCR = useSim(s => s.setLandmarkCR); const patient = patientById(patientId); const m = patient.morph; const h = patient.heightCm / 100; const skin = patient.skin;
  const bodyWidth = 0.16 * m.torsoWidth, chestDepth = 0.12 * m.torsoDepth, shoulderWidth = 0.205 * m.shoulder, limb = 0.043 * m.limb, scale = h / 1.70;
  const kyphosis = m.kyphosis * 0.22, yaw = (pose.rotationY * Math.PI) / 180, armRaise = pose.armRaise * 0.55, elbow = (pose.elbowFlex * Math.PI) / 180, hipInt = (pose.hipInternal * Math.PI) / 180;
  const landmarks = LANDMARKS.filter(l => l.y > 0 && !["3rd-mcp", "midcarpal", "elbow", "patella-apex", "medial-epicondyle-knee", "malleoli", "3rd-mt"].includes(l.id));
  const bodyGeometry = useMemo(() => ({ pelvis: [0.13 * m.hip, 0.105 * m.abdomen, 0.12 * m.torsoDepth] as V3, abdomen: [0.155 * m.torsoWidth, 0.16 * m.abdomen, 0.11 * m.torsoDepth] as V3, chest: [bodyWidth, 0.22 * m.torsoLength, chestDepth] as V3 }), [bodyWidth, chestDepth, m.abdomen, m.hip, m.torsoDepth, m.torsoLength, m.torsoWidth]);
  const place = equipment.placement, wall = place === "upright-bucky" || place === "standing" || place === "seated", tableTop = equipment.tableHeight + 0.075, bodyThickness = Math.max(0.13, chestDepth * 1.05);
  let groupPos: V3, groupRot: V3;
  if (wall) { const standY = place === "seated" ? 0.38 : 0.01; groupPos = [equipment.patientX, standY + equipment.patientY, (place === "upright-bucky" ? -0.48 : -0.32) + equipment.patientZ]; groupRot = [0, yaw, 0]; }
  else { groupPos = [equipment.tableX + equipment.patientX, tableTop + bodyThickness + equipment.patientY, equipment.tableZ + h * 0.5 + equipment.patientZ]; groupRot = [-Math.PI / 2, 0, yaw]; }
  const y = (cm: number) => (cm / patient.heightCm) * h; const pelvisY = y(82), waistY = y(69), chestY = y(49), shoulderY = y(31), neckY = y(18); const hipGap = 0.085 * m.hip; const kneeY = y(45), ankleY = y(5), handDrop = 0.34 * m.limb;

  return <group position={groupPos} rotation={groupRot}>
    <group rotation={[kyphosis, 0, 0]}>
      <Ellipsoid position={[0, pelvisY, 0]} scale={bodyGeometry.pelvis} color={skin} /><Ellipsoid position={[0, waistY, 0]} scale={bodyGeometry.abdomen} color={skin} /><Ellipsoid position={[0, chestY, 0]} scale={bodyGeometry.chest} color={skin} />
      <Ellipsoid position={[-0.065 * m.torsoWidth, chestY + 0.005, chestDepth * 0.68]} scale={[0.075 * m.breast, 0.09 * m.breast, 0.045 * m.breast]} color={skin} /><Ellipsoid position={[0.065 * m.torsoWidth, chestY + 0.005, chestDepth * 0.68]} scale={[0.075 * m.breast, 0.09 * m.breast, 0.045 * m.breast]} color={skin} />
      <Ellipsoid position={[0, y(53), 0]} scale={[bodyGeometry.chest[0] * 1.035, bodyGeometry.chest[1] * 1.12, bodyGeometry.chest[2] * 1.035]} color={patient.gown} castShadow={false} />
      <Ellipsoid position={[0, neckY, 0]} scale={[0.055 * m.shoulder, 0.075, 0.06]} color={skin} /><Head skin={skin} hair={patient.hair} chin={pose.chinUp * 0.16} scale={scale} />
      {([-1, 1] as const).map(side => { const shoulder: V3 = [side * shoulderWidth, shoulderY, 0]; const upper: V3 = [side * (shoulderWidth + 0.055 * m.limb), shoulderY - 0.13 * m.limb * Math.cos(armRaise), 0]; const elbowPoint: V3 = [upper[0] + side * 0.005, upper[1] - 0.21 * m.limb * Math.cos(elbow), 0.02 * Math.sin(elbow)]; const wrist: V3 = [elbowPoint[0] + side * 0.012, elbowPoint[1] - handDrop * Math.cos(elbow), 0.04 * Math.sin(elbow)]; return <group key={side}><Ellipsoid position={shoulder} scale={[0.065 * m.shoulder, 0.065, 0.065]} color={skin} /><Segment a={shoulder} b={upper} radius={limb * 1.28} color={skin} /><Ellipsoid position={elbowPoint} scale={[limb * 1.28, limb * 1.18, limb * 1.2]} color={skin} /><Segment a={upper} b={elbowPoint} radius={limb} color={skin} /><Segment a={elbowPoint} b={wrist} radius={limb * 0.86} color={skin} /><Hand position={wrist} side={side} color={skin} scale={m.limb} /></group>; })}
      {([-1, 1] as const).map(side => { const hip: V3 = [side * hipGap, pelvisY - 0.01, 0]; const thigh: V3 = [side * (hipGap + 0.008), kneeY + 0.025, side * 0.008 * Math.sin(hipInt)]; const kneePoint: V3 = [side * (hipGap + 0.006), kneeY, side * 0.012 * Math.sin(hipInt)]; const calf: V3 = [side * (hipGap + 0.006), ankleY + 0.14 * m.limb, side * 0.008]; const ankle: V3 = [side * (hipGap + 0.006), ankleY, side * 0.01]; return <group key={side}><Ellipsoid position={hip} scale={[limb * 1.75, limb * 1.8, limb * 1.7]} color={skin} /><Segment a={hip} b={thigh} radius={limb * 1.45} color={skin} /><Ellipsoid position={kneePoint} scale={[limb * 1.38, limb * 1.28, limb * 1.35]} color={skin} /><Segment a={thigh} b={kneePoint} radius={limb * 1.12} color={skin} /><Segment a={kneePoint} b={calf} radius={limb * 0.94} color={skin} /><Ellipsoid position={ankle} scale={[limb * 0.8, limb * 0.72, limb * 0.82]} color={skin} /><Foot position={[ankle[0], ankle[1] - 0.012, ankle[2] + 0.025]} color={skin} scale={m.limb} /></group>; })}
    </group>
    {showLandmarks ? landmarks.map(lm => { const yy = (1 - scaleLandmarkY(lm.y, patient.heightCm) / patient.heightCm) * h; const xx = (lm.x / 100) * m.torsoWidth; return <mesh key={lm.id} position={[xx, yy, bodyThickness + 0.01]} onClick={e => { e.stopPropagation(); setLandmarkCR(scaleLandmarkY(lm.y, patient.heightCm), lm.x * m.torsoWidth); }}><sphereGeometry args={[0.012, 10, 8]} /><meshBasicMaterial color="#e2c35a" /></mesh>; }) : null}
  </group>;
}
