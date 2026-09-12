import * as THREE from "three";
import { useMemo } from "react";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { MUSCLE_SEGMENTS, type MuscleSegment } from "@/lib/sim/muscle-segmentation";
import { patientKinematics, type V3 } from "@/lib/sim/patient-kinematics";

function Muscle({ segment, scale, start, end, visible }: { segment: MuscleSegment; scale: number; start: V3; end: V3; visible: boolean }) {
  const points = useMemo(() => { const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end), d = b.clone().sub(a), len = Math.max(.006, d.length()); return { mid: a.clone().add(b).multiplyScalar(.5), len, q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()) }; }, [start, end]);
  if (!visible) return null;
  const colour = segment.group === "chest" ? "#b96f62" : segment.group === "back" ? "#9e5e55" : segment.group === "abdomen" ? "#c27a68" : "#aa665e";
  return <mesh position={points.mid} quaternion={points.q} scale={[segment.widthCm * scale / 100 * .5, points.len * .5, segment.depthCm * scale / 100 * .5]} renderOrder={5}><capsuleGeometry args={[1, 1, 12, 24]} /><meshPhysicalMaterial color={colour} transparent opacity={.7 * segment.bulk} roughness={.72} depthWrite={false} depthTest={false} /></mesh>;
}

/** Limb muscles follow the same articulated joint chain as the skeleton and skin. */
export function SegmentedMuscles() {
  const patientId = useSim(s => s.patientId), pose = useSim(s => s.pose), projectionId = useSim(s => s.projectionId), equipment = useSim(s => s.equipment), showMuscle = useSim(s => s.anatomyVisibility?.muscle ?? true);
  const patient = patientById(patientId), H = patient.heightCm / 100, scale = H / 1.7;
  const kin = patientKinematics({ H, s: scale, shoulder: patient.morph.shoulder, hip: patient.morph.hip, limb: patient.morph.limb, elbowFlex: pose.elbowFlex, hipInternal: pose.hipInternal, armRaise: pose.armRaise, armSide: pose.armSide, shoulderRoll: pose.shoulderRoll, kneeFlex: pose.kneeFlex, projectionId, placement: equipment.placement, buckyTilt: equipment.buckyTilt });
  const pointsFor = (segment: MuscleSegment): [V3, V3] => {
    const side = segment.side === "left" ? -1 : 1, arm = kin.arms[side < 0 ? 0 : 1], leg = kin.legs[side < 0 ? 0 : 1];
    const torso = (p: [number, number, number]): V3 => [p[0] * scale / 100, (170 - p[1]) * scale / 100, p[2] * scale / 100];
    if (segment.group === "arm") { if (segment.id.startsWith("forearm")) return [arm.elbow, arm.wrist]; if (segment.id.startsWith("deltoid")) return [arm.shoulder, arm.upper]; return [arm.upper, arm.elbow]; }
    if (segment.group === "gluteal") return [leg.hip, leg.thigh];
    if (segment.group === "thigh") return [leg.thigh, leg.knee];
    if (segment.group === "calf") return [leg.knee, leg.ankle];
    return [torso(segment.originCm), torso(segment.insertionCm)];
  };
  return <group name="BuckyLab-cohesive-muscles">{MUSCLE_SEGMENTS.map(segment => { const [start, end] = pointsFor(segment); return <Muscle key={segment.id} segment={segment} scale={scale} start={start} end={end} visible={showMuscle} />; })}</group>;
}
