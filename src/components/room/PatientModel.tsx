import { useMemo } from "react";
import * as THREE from "three";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { scaleLandmarkY, LANDMARKS } from "@/lib/sim/projections";

function latheTorso(width: number, depth: number, length: number, abdomen: number) {
  const pts: THREE.Vector2[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = t * length;
    let r = 0.11;
    if (t < 0.07) r = 0.075;
    else if (t < 0.18) r = 0.11 + width * 0.018;
    else if (t < 0.38) r = 0.155 * width;
    else if (t < 0.55) r = 0.16 * width;
    else if (t < 0.72) r = 0.15 * width * (0.72 + abdomen * 0.38);
    else r = 0.16 * width * (0.84 + abdomen * 0.2);
    pts.push(new THREE.Vector2(r, y));
  }
  const geo = new THREE.LatheGeometry(pts, 32);
  geo.scale(1, 1, depth / Math.max(0.5, width));
  geo.computeVertexNormals();
  return geo;
}

function Limb({ radius, length, skin }: { radius: number; length: number; skin: string }) {
  return <mesh position={[0, -length * 0.5, 0]} castShadow>
    <capsuleGeometry args={[radius, length * 0.72, 8, 16]} />
    <meshPhysicalMaterial color={skin} roughness={0.58} metalness={0} clearcoat={0.04} />
  </mesh>;
}

export function PatientModel() {
  const patientId = useSim((s) => s.patientId);
  const pose = useSim((s) => s.pose);
  const equipment = useSim((s) => s.equipment);
  const showLandmarks = useSim((s) => s.showLandmarks);
  const setLandmarkCR = useSim((s) => s.setLandmarkCR);
  const patient = patientById(patientId);
  const m = patient.morph;
  const h = patient.heightCm / 100;
  const torsoLength = Math.max(0.62, 0.58 * m.torsoLength);
  const torsoGeo = useMemo(() => latheTorso(m.torsoWidth, m.torsoDepth, torsoLength, m.abdomen), [m.abdomen, m.torsoDepth, m.torsoLength, m.torsoWidth, torsoLength]);
  const gownGeo = useMemo(() => latheTorso(m.torsoWidth * 1.045, m.torsoDepth * 1.055, torsoLength * 0.98, m.abdomen * 1.03), [m.abdomen, m.torsoDepth, m.torsoLength, m.torsoWidth, torsoLength]);
  const skin = patient.skin;
  const yaw = (pose.rotationY * Math.PI) / 180;
  const place = equipment.placement;
  const wall = place === "upright-bucky" || place === "standing" || place === "seated";
  const ox = equipment.patientX;
  const oy = equipment.patientY;
  const oz = equipment.patientZ;

  let groupPos: [number, number, number];
  let groupRot: [number, number, number];
  if (wall) {
    const standY = place === "seated" ? 0.45 : 0.02;
    const standZ = place === "upright-bucky" ? -0.48 : -0.32;
    groupPos = [ox, standY + oy, Math.min(standZ + oz, -0.42)];
    groupRot = [0, yaw, 0];
  } else {
    // Patient anatomy is authored on a true 0..height local body axis. Rotating -90° maps
    // head/feet onto table Z. The vertical offset is derived from the maximum body radius,
    // not an arbitrary fraction of torso depth, so every habitus rests on the mattress.
    const tableTop = equipment.tableHeight + 0.075;
    const bodyRadius = Math.max(0.12, m.torsoDepth * 0.30, m.torsoWidth * 0.12);
    const localBodyCentre = h * 0.5;
    groupPos = [equipment.tableX + ox, tableTop + bodyRadius + oy, equipment.tableZ + localBodyCentre + oz];
    groupRot = [-Math.PI / 2, 0, yaw];
  }

  const shoulder = 0.22 * m.shoulder;
  const limbR = 0.045 * m.limb;
  const armRaise = pose.armRaise * 1.5;
  const elbow = (pose.elbowFlex * Math.PI) / 180;
  const knee = (pose.kneeFlex * Math.PI) / 180;
  const hipInt = (pose.hipInternal * Math.PI) / 180;
  const chin = pose.chinUp * 0.35;
  const kyph = m.kyphosis * 0.35;
  const bodyShift = -0.34;
  const landmarks = LANDMARKS.filter((l) => l.y > 0 && !["3rd-mcp", "midcarpal", "elbow", "patella-apex", "medial-epicondyle-knee", "malleoli", "3rd-mt"].includes(l.id));

  return (
    <group position={groupPos} rotation={groupRot}>
      <group position={[0, bodyShift, 0]} rotation={[kyph, 0, 0]}>
        <group position={[0, h * 0.48, 0]}>
          <mesh geometry={torsoGeo} castShadow><meshPhysicalMaterial color={skin} roughness={0.56} metalness={0} clearcoat={0.05} /></mesh>
          <mesh geometry={gownGeo} position={[0, -0.018, 0]}><meshLambertMaterial color={patient.gown} transparent opacity={0.88} /></mesh>
          <group position={[0, torsoLength + 0.025, kyph * 0.04]} rotation={[-chin * 0.3, 0, 0]}>
            <mesh position={[0, 0.045, 0]}><cylinderGeometry args={[0.045, 0.055, 0.09, 20]} /><meshPhysicalMaterial color={skin} roughness={0.56} /></mesh>
            <group position={[0, 0.15, 0]} rotation={[-chin, 0, 0]}>
              <mesh castShadow><sphereGeometry args={[0.095, 28, 20]} /><meshPhysicalMaterial color={skin} roughness={0.5} clearcoat={0.06} /></mesh>
              <mesh position={[0, 0.065, 0]} rotation={[0.2, 0, 0]}><sphereGeometry args={[0.098, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5]} /><meshStandardMaterial color={patient.hair} roughness={0.8} /></mesh>
            </group>
          </group>
          {([-1, 1] as const).map((side) => (
            <group key={side} position={[side * shoulder, torsoLength * 0.72, 0]} rotation={[0.15 - armRaise, 0, side * (0.15 + pose.shoulderRoll * 0.5)]}>
              <Limb radius={limbR} length={0.25 * m.limb} skin={skin} />
              <group position={[0, -0.25 * m.limb, 0]} rotation={[elbow, 0, 0]}><Limb radius={limbR * 0.86} length={0.23 * m.limb} skin={skin} /></group>
              <mesh position={[0, -0.38 * m.limb, 0]} castShadow><sphereGeometry args={[limbR * 1.08, 16, 12]} /><meshPhysicalMaterial color={skin} roughness={0.6} /></mesh>
            </group>
          ))}
        </group>
        {([-1, 1] as const).map((side) => (
          <group key={side} position={[side * 0.09 * m.hip, h * 0.43, 0]} rotation={[0, side * hipInt, side * 0.04]}>
            <Limb radius={limbR * 1.18} length={0.36 * m.limb} skin={skin} />
            <group position={[0, -0.36 * m.limb, 0]} rotation={[knee, 0, 0]}>
              <Limb radius={limbR} length={0.34 * m.limb} skin={skin} />
              <mesh position={[0, -0.36 * m.limb, 0]} castShadow><sphereGeometry args={[limbR * 1.08, 16, 12]} /><meshPhysicalMaterial color={skin} roughness={0.6} /></mesh>
            </group>
          </group>
        ))}
      </group>
      {showLandmarks ? landmarks.map((lm) => {
        const y = (1 - scaleLandmarkY(lm.y, patient.heightCm) / patient.heightCm) * h;
        const x = (lm.x / 100) * m.torsoWidth;
        return <mesh key={lm.id} position={[x, y + bodyShift, 0.12 * m.torsoDepth]} onClick={(e) => { e.stopPropagation(); setLandmarkCR(scaleLandmarkY(lm.y, patient.heightCm), lm.x * m.torsoWidth); }}><sphereGeometry args={[0.012, 10, 8]} /><meshBasicMaterial color="#e2c35a" /></mesh>;
      }) : null}
    </group>
  );
}
