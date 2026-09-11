import * as THREE from "three";
import { useMemo } from "react";
import { patientKinematics, type V3 } from "@/lib/sim/patient-kinematics";

type BoneSpec = { a: V3; b: V3; r: number };
type Landmark = { p: V3; scale: V3; rotation?: [number, number, number] };

const V = (x: number, y: number, z: number): V3 => [x, y, z];

function Bone({ a, b, radius, opacity }: { a: V3; b: V3; radius: number; opacity: number }) {
  const { position, quaternion, length } = useMemo(() => {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const direction = end.clone().sub(start);
    const length = direction.length();
    return {
      position: start.clone().add(end).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()),
      length,
    };
  }, [a, b]);
  return (
    <mesh position={position} quaternion={quaternion} renderOrder={10}>
      <capsuleGeometry args={[radius, Math.max(0.01, length - radius * 2), 10, 18]} />
      <meshPhysicalMaterial color="#e8e1cd" transparent opacity={opacity} roughness={0.78} depthWrite={false} depthTest={false} />
    </mesh>
  );
}

function LandmarkBone({ position, scale, rotation = [0, 0, 0], opacity }: Landmark & { opacity: number }) {
  return (
    <mesh position={position} scale={scale} rotation={rotation} renderOrder={10}>
      <sphereGeometry args={[1, 20, 12]} />
      <meshPhysicalMaterial color="#e8e1cd" transparent opacity={opacity} roughness={0.8} depthWrite={false} depthTest={false} />
    </mesh>
  );
}

function addSegment(out: BoneSpec[], a: V3, b: V3, r: number) {
  out.push({ a, b, r });
}

function addDisc(out: BoneSpec[], y: number, s: number, depth: number, width: number, bodyRadius: number) {
  addSegment(out, V(-width, y, depth * 0.12), V(width, y, depth * 0.12), bodyRadius);
}

function cervicalVertebra(out: BoneSpec[], y: number, s: number, depth: number, i: number) {
  const bodyW = (0.015 + (i / 7) * 0.004) * s;
  const bodyD = 0.018 * depth;
  const ped = 0.006 * s;
  const trans = 0.012 * s;
  addSegment(out, V(-bodyW, y, bodyD), V(bodyW, y, bodyD), 0.007 * s);
  addSegment(out, V(-bodyW, y, bodyD), V(-0.032 * s, y - 0.002 * s, 0), ped);
  addSegment(out, V(bodyW, y, bodyD), V(0.032 * s, y - 0.002 * s, 0), ped);
  addSegment(out, V(-0.032 * s, y - 0.002 * s, 0), V(-0.052 * s, y + 0.006 * s, 0.006 * depth), trans);
  addSegment(out, V(0.032 * s, y - 0.002 * s, 0), V(0.052 * s, y + 0.006 * s, 0.006 * depth), trans);
  addSegment(out, V(-0.032 * s, y - 0.002 * s, 0), V(0, y + 0.012 * s, -0.006 * depth), 0.006 * s);
  addSegment(out, V(0.032 * s, y - 0.002 * s, 0), V(0, y + 0.012 * s, -0.006 * depth), 0.006 * s);
}

function thoracicVertebra(out: BoneSpec[], y: number, s: number, depth: number, i: number) {
  const bodyW = (0.020 + Math.sin((i / 11) * Math.PI) * 0.004) * s;
  const bodyD = 0.018 * depth;
  addSegment(out, V(-bodyW, y, bodyD), V(bodyW, y, bodyD), 0.009 * s);
  addSegment(out, V(-bodyW, y, bodyD), V(-0.046 * s, y - 0.004 * s, 0), 0.0065 * s);
  addSegment(out, V(bodyW, y, bodyD), V(0.046 * s, y - 0.004 * s, 0), 0.0065 * s);
  addSegment(out, V(-0.046 * s, y - 0.004 * s, 0), V(-0.074 * s, y + 0.004 * s, 0.006 * depth), 0.008 * s);
  addSegment(out, V(0.046 * s, y - 0.004 * s, 0), V(0.074 * s, y + 0.004 * s, 0.006 * depth), 0.008 * s);
  addSegment(out, V(-0.074 * s, y + 0.004 * s, 0.006 * depth), V(0, y + 0.015 * s, -0.004 * depth), 0.007 * s);
  addSegment(out, V(0.074 * s, y + 0.004 * s, 0.006 * depth), V(0, y + 0.015 * s, -0.004 * depth), 0.007 * s);
  addSegment(out, V(-0.024 * s, y + 0.005 * s, 0.004 * depth), V(-0.031 * s, y + 0.012 * s, -0.002 * depth), 0.004 * s);
  addSegment(out, V(0.024 * s, y + 0.005 * s, 0.004 * depth), V(0.031 * s, y + 0.012 * s, -0.002 * depth), 0.004 * s);
}

function lumbarVertebra(out: BoneSpec[], y: number, s: number, depth: number, i: number) {
  const bodyW = (0.026 + i * 0.002) * s;
  const bodyD = 0.020 * depth;
  addSegment(out, V(-bodyW, y, bodyD), V(bodyW, y, bodyD), 0.012 * s);
  addSegment(out, V(-bodyW, y, bodyD), V(-0.056 * s, y - 0.005 * s, 0), 0.009 * s);
  addSegment(out, V(bodyW, y, bodyD), V(0.056 * s, y - 0.005 * s, 0), 0.009 * s);
  addSegment(out, V(-0.056 * s, y - 0.005 * s, 0), V(-0.086 * s, y + 0.003 * s, 0.006 * depth), 0.010 * s);
  addSegment(out, V(0.056 * s, y - 0.005 * s, 0), V(0.086 * s, y + 0.003 * s, 0.006 * depth), 0.010 * s);
  addSegment(out, V(-0.086 * s, y + 0.003 * s, 0.006 * depth), V(0, y + 0.018 * s, -0.005 * depth), 0.009 * s);
  addSegment(out, V(0.086 * s, y + 0.003 * s, 0.006 * depth), V(0, y + 0.018 * s, -0.005 * depth), 0.009 * s);
}

function pelvisBones(out: BoneSpec[], landmarks: Landmark[], k: ReturnType<typeof patientKinematics>, s: number, depth: number) {
  const y = k.Y.pelvis;
  const hw = k.hipGap * 2.5;
  for (const side of [-1, 1] as const) {
    const x = side * hw;
    addSegment(out, V(0, y + 0.018 * s, 0.018 * depth), V(x * 0.58, y + 0.032 * s, 0.014 * depth), 0.015 * s);
    addSegment(out, V(x * 0.58, y + 0.032 * s, 0.014 * depth), V(x, y - 0.005 * s, 0.012 * depth), 0.014 * s);
    addSegment(out, V(x, y - 0.005 * s, 0.012 * depth), V(x * 0.72, y - 0.070 * s, 0.006 * depth), 0.011 * s);
    addSegment(out, V(x * 0.72, y - 0.070 * s, 0.006 * depth), V(0, y - 0.095 * s, 0.004 * depth), 0.010 * s);
    landmarks.push({ p: V(x * 0.58, y + 0.032 * s, 0.014 * depth), scale: V(0.018 * s, 0.010 * s, 0.012 * depth) });
  }
  addSegment(out, V(-0.025 * s, y + 0.018 * s, 0.020 * depth), V(0.025 * s, y + 0.018 * s, 0.020 * depth), 0.013 * s);
  addSegment(out, V(0, y - 0.095 * s, 0.004 * depth), V(0, y - 0.135 * s, 0), 0.009 * s);
}

function skullBones(out: BoneSpec[], landmarks: Landmark[], H: number, s: number) {
  const y = 0.955 * H;
  const z = 0.01 * s;
  // Cranial vault landmarks and cranial base.
  addSegment(out, V(-0.065 * s, y + 0.002 * s, z), V(0.065 * s, y + 0.002 * s, z), 0.026 * s);
  addSegment(out, V(-0.058 * s, y - 0.035 * s, z), V(-0.035 * s, y - 0.078 * s, 0), 0.018 * s);
  addSegment(out, V(0.058 * s, y - 0.035 * s, z), V(0.035 * s, y - 0.078 * s, 0), 0.018 * s);
  addSegment(out, V(-0.035 * s, y - 0.078 * s, 0), V(0, y - 0.090 * s, -0.006 * s), 0.014 * s);
  addSegment(out, V(0.035 * s, y - 0.078 * s, 0), V(0, y - 0.090 * s, -0.006 * s), 0.014 * s);
  // Zygomatic arches, maxilla/mandible and nasal bridge.
  addSegment(out, V(-0.065 * s, y - 0.035 * s, 0.030 * s), V(-0.100 * s, y - 0.045 * s, 0.018 * s), 0.009 * s);
  addSegment(out, V(0.065 * s, y - 0.035 * s, 0.030 * s), V(0.100 * s, y - 0.045 * s, 0.018 * s), 0.009 * s);
  addSegment(out, V(-0.048 * s, y - 0.062 * s, 0.038 * s), V(-0.018 * s, y - 0.070 * s, 0.042 * s), 0.008 * s);
  addSegment(out, V(0.048 * s, y - 0.062 * s, 0.038 * s), V(0.018 * s, y - 0.070 * s, 0.042 * s), 0.008 * s);
  addSegment(out, V(-0.018 * s, y - 0.070 * s, 0.042 * s), V(0, y - 0.043 * s, 0.050 * s), 0.006 * s);
  addSegment(out, V(0.018 * s, y - 0.070 * s, 0.042 * s), V(0, y - 0.043 * s, 0.050 * s), 0.006 * s);
  addSegment(out, V(-0.045 * s, y - 0.078 * s, 0.032 * s), V(0, y - 0.098 * s, 0.030 * s), 0.009 * s);
  addSegment(out, V(0.045 * s, y - 0.078 * s, 0.032 * s), V(0, y - 0.098 * s, 0.030 * s), 0.009 * s);
  landmarks.push({ p: V(-0.072 * s, y - 0.020 * s, 0.050 * s), scale: V(0.010 * s, 0.018 * s, 0.012 * s) });
  landmarks.push({ p: V(0.072 * s, y - 0.020 * s, 0.050 * s), scale: V(0.010 * s, 0.018 * s, 0.012 * s) });
}

function longBone(out: BoneSpec[], landmarks: Landmark[], proximal: V3, distal: V3, radius: number, s: number, side: -1 | 1, kind: "humerus" | "forearm" | "femur" | "tibia") {
  const p = new THREE.Vector3(...proximal);
  const d = new THREE.Vector3(...distal);
  const axis = d.clone().sub(p).normalize();
  const perp = new THREE.Vector3(-axis.z, 0, axis.x).normalize();
  addSegment(out, proximal, distal, radius);
  if (kind === "humerus") {
    const head = p.clone().add(axis.clone().multiplyScalar(-0.010 * s));
    landmarks.push({ p: [head.x, head.y, head.z], scale: [radius * 1.7, radius * 1.35, radius * 1.5] });
    const tub = p.clone().add(perp.clone().multiplyScalar(side * radius * 1.8));
    landmarks.push({ p: [tub.x, tub.y, tub.z], scale: [radius * 0.8, radius, radius * 0.9] });
    const condyle = d.clone().add(perp.clone().multiplyScalar(side * radius * 0.7));
    landmarks.push({ p: [condyle.x, condyle.y, condyle.z], scale: [radius * 1.2, radius * 0.8, radius] });
  } else if (kind === "femur") {
    const head = p.clone().add(axis.clone().multiplyScalar(-0.012 * s)).add(perp.clone().multiplyScalar(side * radius * 0.9));
    landmarks.push({ p: [head.x, head.y, head.z], scale: [radius * 1.8, radius * 1.6, radius * 1.6] });
    const neck = p.clone().add(axis.clone().multiplyScalar(0.018 * s)).add(perp.clone().multiplyScalar(side * radius));
    addSegment(out, proximal, [neck.x, neck.y, neck.z], radius * 0.8);
    landmarks.push({ p: [d.x, d.y, d.z], scale: [radius * 1.35, radius * 0.95, radius * 1.15] });
  } else if (kind === "forearm") {
    const radial = d.clone().add(perp.clone().multiplyScalar(side * radius * 0.7));
    landmarks.push({ p: [radial.x, radial.y, radial.z], scale: [radius * 0.85, radius * 0.9, radius * 1.2] });
  } else if (kind === "tibia") {
    landmarks.push({ p: [d.x, d.y, d.z], scale: [radius * 1.25, radius * 1.15, radius * 1.1] });
    const plateau = p.clone().add(perp.clone().multiplyScalar(side * radius * 0.6));
    landmarks.push({ p: [plateau.x, plateau.y, plateau.z], scale: [radius * 1.4, radius * 0.7, radius * 1.2] });
  }
}

function handBones(out: BoneSpec[], landmarks: Landmark[], wrist: V3, hand: V3, s: number, side: -1 | 1) {
  const w = new THREE.Vector3(...wrist);
  const h = new THREE.Vector3(...hand);
  const dir = h.clone().sub(w).normalize();
  const normal = new THREE.Vector3(-dir.y, dir.x, 0).normalize();
  const palmBase = w.clone().add(dir.clone().multiplyScalar(0.010 * s));
  const palmTip = w.clone().add(dir.clone().multiplyScalar(0.050 * s));
  for (let c = 0; c < 5; c++) {
    const offset = (c - 2) * 0.012 * s;
    const mc = palmBase.clone().add(normal.clone().multiplyScalar(offset));
    const mt = palmTip.clone().add(normal.clone().multiplyScalar(offset));
    addSegment(out, [mc.x, mc.y, mc.z], [mt.x, mt.y, mt.z], 0.0042 * s);
    for (let p = 0; p < 3; p++) {
      const a = mt.clone().add(dir.clone().multiplyScalar(p * 0.020 * s));
      const b = mt.clone().add(dir.clone().multiplyScalar((p + 1) * 0.020 * s));
      addSegment(out, [a.x, a.y, a.z], [b.x, b.y, b.z], 0.0032 * s);
    }
  }
  landmarks.push({ p: [palmTip.x, palmTip.y, palmTip.z], scale: [0.010 * s, 0.006 * s, 0.008 * s] });
  void side;
}

function footBones(out: BoneSpec[], landmarks: Landmark[], ankle: V3, foot: V3, s: number) {
  const a = new THREE.Vector3(...ankle);
  const f = new THREE.Vector3(...foot);
  const dir = f.clone().sub(a).normalize();
  const across = new THREE.Vector3(1, 0, 0);
  const base = a.clone().add(dir.clone().multiplyScalar(0.012 * s));
  const met = a.clone().add(dir.clone().multiplyScalar(0.055 * s));
  addSegment(out, ankle, [met.x, met.y, met.z], 0.007 * s);
  for (let c = 0; c < 5; c++) {
    const offset = (c - 2) * 0.012 * s;
    const start = base.clone().add(across.clone().multiplyScalar(offset));
    const end = met.clone().add(across.clone().multiplyScalar(offset));
    addSegment(out, [start.x, start.y, start.z], [end.x, end.y, end.z], 0.004 * s);
    const toe = end.clone().add(dir.clone().multiplyScalar(0.035 * s));
    addSegment(out, [end.x, end.y, end.z], [toe.x, toe.y, toe.z], 0.003 * s);
  }
  landmarks.push({ p: [met.x, met.y, met.z], scale: [0.012 * s, 0.008 * s, 0.010 * s] });
}

export function BoneJointLayer({ H, s, torsoWidth, torsoDepth, shoulder, hip, patientMorph, pose, projectionId, placement, buckyTilt, opacity }: {
  H: number; s: number; torsoWidth: number; torsoDepth: number; shoulder: number; hip: number; patientMorph: { limb: number };
  pose: { elbowFlex: number; hipInternal: number; armRaise: number; shoulderRoll: number; kneeFlex: number };
  projectionId: string; placement: "standing" | "seated" | "upright-bucky" | "table"; buckyTilt: number; opacity: number;
}) {
  const Y = { head: 0.955 * H, neck: 0.86 * H, shoulder: 0.79 * H, chest: 0.70 * H, pelvis: 0.47 * H };
  const k = patientKinematics({ H, s, shoulder, hip, limb: patientMorph.limb, elbowFlex: pose.elbowFlex, hipInternal: pose.hipInternal, armRaise: pose.armRaise, shoulderRoll: pose.shoulderRoll, kneeFlex: pose.kneeFlex, projectionId, placement, buckyTilt });
  const limb = 0.043 * patientMorph.limb * s;
  const ribHalf = torsoWidth * 0.72;
  const ribDepth = Math.max(0.06 * s, torsoDepth * 0.42);

  const { bones, landmarks } = useMemo(() => {
    const out: BoneSpec[] = [];
    const marks: Landmark[] = [];
    const cStart = Y.neck + 0.015 * s;
    const cEnd = Y.shoulder - 0.020 * s;
    for (let i = 0; i < 7; i++) cervicalVertebra(out, cStart + (i / 6) * (cEnd - cStart), s, torsoDepth, i);
    const tStart = cEnd - 0.008 * s;
    const tEnd = Y.chest + 0.015 * s;
    for (let i = 0; i < 12; i++) thoracicVertebra(out, tStart + (i / 11) * (tEnd - tStart), s, torsoDepth, i);
    const lStart = Y.chest - 0.005 * s;
    const lEnd = Y.pelvis + 0.055 * s;
    for (let i = 0; i < 5; i++) lumbarVertebra(out, lStart + (i / 4) * (lEnd - lStart), s, torsoDepth, i);
    // Intervertebral spaces/plates are kept as bone-adjacent landmarks only; no connective tissue is rendered here.
    for (let i = 0; i < 13; i++) addDisc(out, lStart + (i / 12) * (lEnd - lStart), s, torsoDepth, 0.018 * s, 0.0025 * s);

    pelvisBones(out, marks, k, s, torsoDepth);
    skullBones(out, marks, H, s);

    // Sternum: manubrium, body and xiphoid are separate bony regions.
    addSegment(out, V(0, Y.chest + 0.050 * s, ribDepth * 0.82), V(0, Y.chest + 0.012 * s, ribDepth * 0.88), 0.012 * s);
    addSegment(out, V(0, Y.chest + 0.012 * s, ribDepth * 0.88), V(0, Y.chest - 0.075 * s, ribDepth * 0.90), 0.010 * s);
    addSegment(out, V(0, Y.chest - 0.075 * s, ribDepth * 0.90), V(0, Y.chest - 0.105 * s, ribDepth * 0.88), 0.006 * s);

    // Clavicles with medial ends and acromial/lateral ends; scapular spine/acromion/inferior angle.
    for (const side of [-1, 1] as const) {
      const x = side * k.shoulderWidth;
      addSegment(out, V(0, Y.shoulder + 0.012 * s, ribDepth * 0.62), V(x * 0.50, Y.shoulder + 0.018 * s, ribDepth * 0.56), 0.007 * s);
      addSegment(out, V(x * 0.50, Y.shoulder + 0.018 * s, ribDepth * 0.56), V(x * 0.98, Y.shoulder - 0.004 * s, ribDepth * 0.48), 0.006 * s);
      addSegment(out, V(x * 0.78, Y.shoulder - 0.005 * s, ribDepth * 0.18), V(x * 1.10, Y.shoulder - 0.040 * s, ribDepth * 0.24), 0.006 * s);
      addSegment(out, V(x * 0.80, Y.shoulder - 0.018 * s, ribDepth * 0.18), V(x * 0.66, Y.shoulder - 0.090 * s, ribDepth * 0.16), 0.005 * s);
      marks.push({ p: V(x * 1.02, Y.shoulder - 0.005 * s, ribDepth * 0.46), scale: V(0.012 * s, 0.009 * s, 0.010 * s) });
    }

    // Ribs: posterior arch, angle, shaft and anterior costal segment. Twelve pairs.
    for (let i = 0; i < 12; i++) {
      const y = Y.chest + (11 - i) * 0.018 * s;
      const width = ribHalf * (0.94 - i * 0.018);
      const depth = ribDepth * (0.98 - i * 0.012);
      const posterior = V(0, y, -depth * 0.12);
      const angle = V(width * 0.30, y - 0.004 * s, depth * 0.25);
      const lateral = V(width * 0.78, y - 0.012 * s, depth * 0.55);
      const anterior = V(width * 0.94, y - 0.018 * s, depth * 0.80);
      addSegment(out, posterior, angle, 0.0062 * s);
      addSegment(out, angle, lateral, 0.0058 * s);
      addSegment(out, lateral, anterior, 0.0053 * s);
      addSegment(out, posterior, V(-angle[0], angle[1], angle[2]), 0.0062 * s);
      addSegment(out, V(-angle[0], angle[1], angle[2]), V(-lateral[0], lateral[1], lateral[2]), 0.0058 * s);
      addSegment(out, V(-lateral[0], lateral[1], lateral[2]), V(-anterior[0], anterior[1], anterior[2]), 0.0053 * s);
      marks.push({ p: angle, scale: V(0.009 * s, 0.007 * s, 0.009 * s) });
      if (i < 7) addSegment(out, anterior, V(anterior[0] * 0.72, anterior[1] - 0.006 * s, ribDepth * 0.86), 0.0032 * s);
    }

    k.arms.forEach((a, index) => {
      const side: -1 | 1 = index === 0 ? -1 : 1;
      longBone(out, marks, a.upper, a.elbow, limb * 1.02, s, side, "humerus");
      const foreRadius = limb * 0.62;
      addSegment(out, a.elbow, V(a.wrist[0] + side * 0.004 * s, a.wrist[1], a.wrist[2] + 0.006 * s), foreRadius);
      addSegment(out, a.elbow, V(a.wrist[0] - side * 0.006 * s, a.wrist[1], a.wrist[2] - 0.004 * s), foreRadius * 0.88);
      handBones(out, marks, a.wrist, a.hand, s, side);
      marks.push({ p: a.elbow, scale: V(limb * 1.05, limb * 0.78, limb * 0.95) });
    });

    k.legs.forEach((l, index) => {
      const side: -1 | 1 = index === 0 ? -1 : 1;
      longBone(out, marks, l.hip, l.thigh, limb * 1.15, s, side, "femur");
      marks.push({ p: l.knee, scale: V(limb * 1.12, limb * 0.80, limb * 0.98) });
      longBone(out, marks, l.knee, l.ankle, limb * 0.78, s, side, "tibia");
      addSegment(out, l.knee, [l.ankle[0] + side * 0.018 * s, l.ankle[1], l.ankle[2] + 0.005 * s], limb * 0.36); // fibula
      addSegment(out, l.knee, [l.knee[0] + side * 0.012 * s, l.knee[1] + 0.010 * s, l.knee[2] + 0.022 * s], limb * 0.32); // patella body
      footBones(out, marks, l.ankle, l.foot, s);
    });
    return { bones: out, landmarks: marks };
  }, [H, s, torsoDepth, Y, k, limb, ribDepth, ribHalf]);

  return (
    <group>
      {bones.map((b, i) => <Bone key={`bone-${i}`} a={b.a} b={b.b} radius={b.r} opacity={opacity} />)}
      {landmarks.map((m, i) => <LandmarkBone key={`landmark-${i}`} position={m.p} scale={m.scale} rotation={m.rotation} opacity={opacity} />)}
    </group>
  );
}
