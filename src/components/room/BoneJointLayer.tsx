import * as THREE from "three";
import { useMemo } from "react";
import { patientKinematics, type V3 } from "@/lib/sim/patient-kinematics";

type BoneSpec = { a: V3; b: V3; r: number };

function Bone({ a, b, radius, opacity }: { a: V3; b: V3; radius: number; opacity: number }) {
  const { position, quaternion, length } = useMemo(() => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start), length = direction.length();
    return { position: start.clone().add(end).multiplyScalar(.5), quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()), length };
  }, [a, b]);
  return <mesh position={position} quaternion={quaternion} renderOrder={10}><capsuleGeometry args={[radius, Math.max(.01, length - radius * 2), 10, 18]} /><meshPhysicalMaterial color="#e8e1cd" transparent opacity={opacity} roughness={.78} depthWrite={false} depthTest={false} /></mesh>;
}

function Joint({ position, radius, opacity }: { position: V3; radius: number; opacity: number }) {
  return <group position={position} renderOrder={11}><mesh><sphereGeometry args={[radius, 18, 12]} /><meshPhysicalMaterial color="#e8e1cd" transparent opacity={opacity} roughness={.78} depthWrite={false} depthTest={false} /></mesh><mesh scale={[1.12, .72, 1.12]}><sphereGeometry args={[radius, 14, 10]} /><meshPhysicalMaterial color="#d7e1d0" transparent opacity={opacity * .62} roughness={.42} depthWrite={false} depthTest={false} /></mesh></group>;
}

export function BoneJointLayer({ H, s, torsoWidth, torsoDepth, shoulder, hip, patientMorph, pose, projectionId, placement, buckyTilt, opacity }: {
  H: number; s: number; torsoWidth: number; torsoDepth: number; shoulder: number; hip: number; patientMorph: { limb: number };
  pose: { elbowFlex: number; hipInternal: number; armRaise: number; shoulderRoll: number; kneeFlex: number };
  projectionId: string; placement: "standing" | "seated" | "upright-bucky" | "table"; buckyTilt: number; opacity: number;
}) {
  const Y = { head: .955 * H, neck: .86 * H, shoulder: .79 * H, chest: .70 * H, pelvis: .47 * H };
  const k = patientKinematics({ H, s, shoulder, hip, limb: patientMorph.limb, elbowFlex: pose.elbowFlex, hipInternal: pose.hipInternal, armRaise: pose.armRaise, shoulderRoll: pose.shoulderRoll, kneeFlex: pose.kneeFlex, projectionId, placement, buckyTilt });
  const limb = .043 * patientMorph.limb * s;
  const ribHalf = torsoWidth * .72, ribDepth = Math.max(.06 * s, torsoDepth * .42);

  const bones = useMemo(() => {
    const out: BoneSpec[] = [
      { a: [0, Y.neck, 0], b: [0, Y.chest + .05 * s, 0], r: .012 * s },
      { a: [0, Y.chest + .05 * s, 0], b: [0, Y.pelvis + .03 * s, -.01 * torsoDepth], r: .014 * s },
      { a: [-.015 * s, Y.shoulder + .008 * s, .012 * torsoDepth], b: [-k.shoulderWidth, Y.shoulder, 0], r: .008 * s },
      { a: [.015 * s, Y.shoulder + .008 * s, .012 * torsoDepth], b: [k.shoulderWidth, Y.shoulder, 0], r: .008 * s },
      { a: [0, Y.shoulder + .008 * s, .012 * torsoDepth], b: [0, Y.pelvis + .04 * s, .012 * torsoDepth], r: .01 * s },
      { a: [-k.hipGap, Y.pelvis, 0], b: [0, Y.pelvis - .04 * s, .018 * torsoDepth], r: .013 * s },
      { a: [k.hipGap, Y.pelvis, 0], b: [0, Y.pelvis - .04 * s, .018 * torsoDepth], r: .013 * s },
    ];
    k.arms.forEach(arm => out.push({ a: arm.shoulder, b: arm.upper, r: limb * 1.08 }, { a: arm.upper, b: arm.elbow, r: limb * .82 }, { a: arm.elbow, b: arm.wrist, r: limb * .68 }, { a: arm.wrist, b: arm.hand, r: limb * .5 }));
    k.legs.forEach(leg => out.push({ a: leg.hip, b: leg.thigh, r: limb * 1.2 }, { a: leg.thigh, b: leg.knee, r: limb * .94 }, { a: leg.knee, b: leg.calf, r: limb * .82 }, { a: leg.calf, b: leg.ankle, r: limb * .7 }, { a: leg.ankle, b: leg.foot, r: limb * .52 }));
    return out;
  }, [H, s, torsoDepth, k, limb, Y.neck, Y.shoulder, Y.chest, Y.pelvis]);

  const joints = useMemo(() => [
    { p: [0, Y.neck, 0] as V3, r: .018 * s }, { p: [0, Y.pelvis, 0] as V3, r: .035 * s },
    ...k.arms.flatMap(a => [{ p: a.shoulder, r: limb * 1.18 }, { p: a.elbow, r: limb * .92 }, { p: a.wrist, r: limb * .76 }]),
    ...k.legs.flatMap(l => [{ p: l.hip, r: limb * 1.34 }, { p: l.knee, r: limb * 1.08 }, { p: l.ankle, r: limb * .84 }]),
  ], [k, limb, s, Y.neck, Y.pelvis]);

  const ribs = useMemo(() => Array.from({ length: 10 }, (_, i) => {
    const y = Y.chest + (9 - i) * .018 * s, width = ribHalf * (.96 - i * .035), depth = ribDepth * (.96 - i * .015);
    return Array.from({ length: 13 }, (_, j) => { const theta = (j / 12) * Math.PI; return [Math.sin(theta) * width, y - .012 * s * Math.sin(theta), Math.cos(theta) * depth] as V3; });
  }), [Y.chest, s, ribHalf, ribDepth]);

  return <group><group position={[0, Y.head, 0]}><mesh scale={[.092 * s, .108 * s, .086 * s]} renderOrder={10}><sphereGeometry args={[1, 24, 16]} /><meshPhysicalMaterial color="#e8e1cd" transparent opacity={opacity} roughness={.8} depthWrite={false} depthTest={false} /></mesh><mesh position={[0, -.052 * s, .02 * s]} scale={[.058 * s, .047 * s, .058 * s]} renderOrder={10}><sphereGeometry args={[1, 20, 14]} /><meshPhysicalMaterial color="#e8e1cd" transparent opacity={opacity} roughness={.8} depthWrite={false} depthTest={false} /></mesh></group>{bones.map((b, i) => <Bone key={`bone-${i}`} a={b.a} b={b.b} radius={b.r} opacity={opacity} />)}{joints.map((j, i) => <Joint key={`joint-${i}`} position={j.p} radius={j.r} opacity={opacity} />)}{ribs.map((points, i) => <group key={`rib-${i}`}>{points.slice(0, -1).map((p, j) => <Bone key={j} a={p} b={points[j + 1]} radius={.0058 * s} opacity={opacity * .9} />)}</group>)}<Bone a={[0, Y.chest + .06 * s, ribDepth]} b={[0, Y.pelvis + .03 * s, -.01 * torsoDepth]} radius={.009 * s} opacity={opacity * .9} /></group>;
}
