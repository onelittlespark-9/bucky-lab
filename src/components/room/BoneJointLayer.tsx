import * as THREE from "three";
import { useMemo } from "react";

type V3 = [number, number, number];

function Bone({ a, b, radius, opacity }: { a: V3; b: V3; radius: number; opacity: number }) {
  const { position, quaternion, length } = useMemo(() => {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const direction = end.clone().sub(start);
    const length = direction.length();
    const position = start.clone().add(end).multiplyScalar(0.5);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );
    return { position, quaternion, length };
  }, [a, b]);

  return (
    <mesh position={position} quaternion={quaternion} renderOrder={10}>
      <capsuleGeometry args={[radius, Math.max(0.01, length - radius * 2), 10, 18]} />
      <meshPhysicalMaterial color="#e8e1cd" transparent opacity={opacity} roughness={0.78} depthWrite={false} depthTest={false} />
    </mesh>
  );
}

function Joint({ position, radius, opacity }: { position: V3; radius: number; opacity: number }) {
  return (
    <group position={position} renderOrder={11}>
      <mesh><sphereGeometry args={[radius, 18, 12]} /><meshPhysicalMaterial color="#e8e1cd" transparent opacity={opacity} roughness={0.78} depthWrite={false} depthTest={false} /></mesh>
      <mesh scale={[1.12, 0.72, 1.12]}><sphereGeometry args={[radius, 14, 10]} /><meshPhysicalMaterial color="#d7e1d0" transparent opacity={opacity * 0.62} roughness={0.42} depthWrite={false} depthTest={false} /></mesh>
    </group>
  );
}

export function BoneJointLayer({
  H, s, torsoWidth, torsoDepth, shoulder, hip, patientMorph, pose, projectionId, opacity,
}: {
  H: number; s: number; torsoWidth: number; torsoDepth: number; shoulder: number; hip: number;
  patientMorph: { limb: number };
  pose: { elbowFlex: number; hipInternal: number; armRaise: number; shoulderRoll: number };
  projectionId: string; opacity: number;
}) {
  const Y = { head: 0.955 * H, neck: 0.86 * H, shoulder: 0.79 * H, chest: 0.70 * H, pelvis: 0.47 * H, knee: 0.245 * H, ankle: 0.055 * H };
  const limb = 0.043 * patientMorph.limb * s;
  const shoulderWidth = 0.205 * shoulder * s;
  const hipGap = 0.085 * hip * s;
  const elbow = (pose.elbowFlex * Math.PI) / 180;
  const hipInternal = (pose.hipInternal * Math.PI) / 180;
  const raise = Math.max(0, Math.min(1, pose.armRaise));
  const ribHalf = torsoWidth * 0.72;
  const lateralChest = projectionId === "lat-chest";
  const paChest = projectionId === "pa-chest";

  const armPoints = (side: -1 | 1): { shoulder: V3; upper: V3; elbow: V3; wrist: V3; hand: V3 } => {
    const shoulderPoint: V3 = [side * shoulderWidth, Y.shoulder, 0];
    let upper: V3, elbowPoint: V3, wrist: V3;
    if (lateralChest && raise > 0.35) {
      upper = [side * (shoulderWidth + 0.03 * s), Y.shoulder + 0.12 * H * raise, 0.02 * s];
      elbowPoint = [side * (shoulderWidth + 0.015 * s), Y.shoulder + 0.22 * H * raise, 0.035 * s];
      wrist = [side * 0.075 * s, Y.shoulder + 0.31 * H * raise, 0.04 * s];
    } else if (paChest && pose.shoulderRoll > 0.55) {
      upper = [side * (shoulderWidth + 0.02 * s), Y.shoulder - 0.045 * s, 0];
      elbowPoint = [side * (shoulderWidth + 0.015 * s), Y.shoulder - 0.12 * s, 0.055 * s];
      wrist = [side * (torsoWidth * 0.52), Y.pelvis + 0.02 * s, 0.07 * s];
    } else {
      upper = [side * (shoulderWidth + 0.055 * patientMorph.limb * s), Y.shoulder + 0.08 * H * raise, 0];
      elbowPoint = [upper[0] + side * 0.005 * s, upper[1] - 0.16 * s * Math.cos(elbow), 0.02 * s * Math.sin(elbow)];
      wrist = [elbowPoint[0] + side * 0.012 * s, elbowPoint[1] - 0.16 * s * Math.cos(elbow), 0.04 * s * Math.sin(elbow)];
    }
    const hand: V3 = [wrist[0] + side * 0.004 * s, wrist[1] - 0.055 * s, wrist[2]];
    return { shoulder: shoulderPoint, upper, elbow: elbowPoint, wrist, hand };
  };

  const bones = useMemo(() => {
    const out: { a: V3; b: V3; r: number }[] = [];
    out.push({ a: [0, Y.neck, 0], b: [0, Y.chest + 0.05 * s, 0], r: 0.012 * s });
    out.push({ a: [0, Y.chest + 0.05 * s, 0], b: [0, Y.pelvis + 0.03 * s, -0.01 * torsoDepth], r: 0.014 * s });
    out.push({ a: [-0.015 * s, Y.shoulder + 0.008 * s, 0.012 * torsoDepth], b: [-shoulderWidth, Y.shoulder, 0], r: 0.008 * s });
    out.push({ a: [0.015 * s, Y.shoulder + 0.008 * s, 0.012 * torsoDepth], b: [shoulderWidth, Y.shoulder, 0], r: 0.008 * s });
    out.push({ a: [0, Y.shoulder + 0.008 * s, 0.012 * torsoDepth], b: [0, Y.pelvis + 0.04 * s, 0.012 * torsoDepth], r: 0.010 * s });
    out.push({ a: [-hipGap, Y.pelvis, 0], b: [0, Y.pelvis - 0.04 * s, 0.018 * torsoDepth], r: 0.013 * s });
    out.push({ a: [hipGap, Y.pelvis, 0], b: [0, Y.pelvis - 0.04 * s, 0.018 * torsoDepth], r: 0.013 * s });

    ([-1, 1] as const).forEach((side) => {
      const arm = armPoints(side);
      out.push({ a: arm.shoulder, b: arm.upper, r: limb * 1.08 });
      out.push({ a: arm.upper, b: arm.elbow, r: limb * 0.82 });
      out.push({ a: arm.elbow, b: arm.wrist, r: limb * 0.68 });
      out.push({ a: arm.wrist, b: arm.hand, r: limb * 0.50 });

      const hipPoint: V3 = [side * hipGap, Y.pelvis - 0.01 * s, 0];
      const thigh: V3 = [side * (hipGap + 0.008 * s), Y.knee + 0.12 * H, side * 0.008 * s * Math.sin(hipInternal)];
      const knee: V3 = [side * (hipGap + 0.006 * s), Y.knee, side * 0.012 * s];
      const calf: V3 = [side * (hipGap + 0.006 * s), Y.ankle + 0.12 * H, side * 0.008 * s];
      const ankle: V3 = [side * (hipGap + 0.006 * s), Y.ankle, side * 0.01 * s];
      const foot: V3 = [ankle[0], ankle[1] - 0.012 * s, ankle[2] + 0.11 * s];
      out.push({ a: hipPoint, b: thigh, r: limb * 1.20 }, { a: thigh, b: knee, r: limb * 0.94 }, { a: knee, b: calf, r: limb * 0.82 }, { a: calf, b: ankle, r: limb * 0.70 }, { a: ankle, b: foot, r: limb * 0.52 });
    });
    return out;
  }, [H, s, torsoWidth, torsoDepth, shoulderWidth, hipGap, limb, elbow, hipInternal, raise, projectionId, pose.shoulderRoll, patientMorph.limb, Y.neck, Y.shoulder, Y.chest, Y.pelvis, Y.knee, Y.ankle]);

  const joints = useMemo(() => {
    const result: { p: V3; r: number }[] = [{ p: [0, Y.neck, 0], r: 0.018 * s }, { p: [0, Y.pelvis, 0], r: 0.035 * s }];
    ([-1, 1] as const).forEach((side) => {
      const arm = armPoints(side);
      const hipPoint: V3 = [side * hipGap, Y.pelvis - 0.01 * s, 0];
      const knee: V3 = [side * (hipGap + 0.006 * s), Y.knee, side * 0.012 * s];
      const ankle: V3 = [side * (hipGap + 0.006 * s), Y.ankle, side * 0.01 * s];
      result.push(
        { p: arm.shoulder, r: limb * 1.18 }, { p: arm.elbow, r: limb * 0.92 }, { p: arm.wrist, r: limb * 0.76 },
        { p: hipPoint, r: limb * 1.34 }, { p: knee, r: limb * 1.08 }, { p: ankle, r: limb * 0.84 },
      );
    });
    return result;
  }, [H, s, shoulderWidth, hipGap, limb, elbow, hipInternal, raise, projectionId, pose.shoulderRoll, patientMorph.limb, Y.neck, Y.shoulder, Y.pelvis, Y.knee, Y.ankle]);

  return (
    <group>
      <group position={[0, Y.head, 0]}>
        <mesh scale={[0.092 * s, 0.108 * s, 0.086 * s]} renderOrder={10}><sphereGeometry args={[1, 24, 16]} /><meshPhysicalMaterial color="#e8e1cd" transparent opacity={opacity} roughness={0.8} depthWrite={false} depthTest={false} /></mesh>
        <mesh position={[0, -0.052 * s, 0.02 * s]} scale={[0.058 * s, 0.047 * s, 0.058 * s]} renderOrder={10}><sphereGeometry args={[1, 20, 14]} /><meshPhysicalMaterial color="#e8e1cd" transparent opacity={opacity} roughness={0.8} depthWrite={false} depthTest={false} /></mesh>
      </group>
      {bones.map((bone, i) => <Bone key={`bone-${i}`} a={bone.a} b={bone.b} radius={bone.r} opacity={opacity} />)}
      {joints.map((joint, i) => <Joint key={`joint-${i}`} position={joint.p} radius={joint.r} opacity={opacity} />)}
      {Array.from({ length: 10 }, (_, i) => {
        const y = Y.chest + (9 - i) * 0.018 * s;
        const width = ribHalf * (0.92 - i * 0.035);
        const z = 0.015 * torsoDepth;
        return <group key={`rib-${i}`}>
          <Bone a={[0, y, z]} b={[-width * 0.58, y + 0.006 * s, z + 0.004 * s]} radius={0.0058 * s} opacity={opacity * 0.9} />
          <Bone a={[-width * 0.58, y + 0.006 * s, z + 0.004 * s]} b={[-width, y - 0.008 * s, z]} radius={0.0058 * s} opacity={opacity * 0.9} />
          <Bone a={[0, y, z]} b={[width * 0.58, y + 0.006 * s, z + 0.004 * s]} radius={0.0058 * s} opacity={opacity * 0.9} />
          <Bone a={[width * 0.58, y + 0.006 * s, z + 0.004 * s]} b={[width, y - 0.008 * s, z]} radius={0.0058 * s} opacity={opacity * 0.9} />
        </group>;
      })}
    </group>
  );
}
