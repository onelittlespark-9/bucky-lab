import * as THREE from "three";
import { useMemo } from "react";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { MUSCLE_SEGMENTS, type MuscleSegment } from "@/lib/sim/muscle-segmentation";

function Muscle({ segment, scale, visible }: { segment: MuscleSegment; scale: number; visible: boolean }) {
  const points = useMemo(() => {
    const a = new THREE.Vector3(segment.originCm[0] * scale / 100, (170 - segment.originCm[1]) * scale / 100, segment.originCm[2] * scale / 100);
    const b = new THREE.Vector3(segment.insertionCm[0] * scale / 100, (170 - segment.insertionCm[1]) * scale / 100, segment.insertionCm[2] * scale / 100);
    const d = b.clone().sub(a);
    const len = d.length();
    const mid = a.clone().add(b).multiplyScalar(.5);
    return { a, b, mid, len, q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()) };
  }, [segment, scale]);
  if (!visible) return null;
  const colour = segment.group === "chest" ? "#b96f62" : segment.group === "back" ? "#9e5e55" : segment.group === "abdomen" ? "#c27a68" : "#aa665e";
  return <mesh position={points.mid} quaternion={points.q} scale={[segment.widthCm * scale / 100 * .5, Math.max(.01, points.len * .5), segment.depthCm * scale / 100 * .5]} renderOrder={5}>
    <capsuleGeometry args={[1, 1, 12, 24]} />
    <meshPhysicalMaterial color={colour} transparent opacity={.7 * segment.bulk} roughness={.72} depthWrite={false} depthTest={false} />
  </mesh>;
}

export function SegmentedMuscles() {
  const patientId = useSim(s => s.patientId);
  const showMuscle = useSim(s => s.anatomyVisibility?.muscle ?? true);
  const patient = patientById(patientId);
  const scale = patient.heightCm / 170;
  return <group>{MUSCLE_SEGMENTS.map(segment => <Muscle key={segment.id} segment={segment} scale={scale} visible={showMuscle} />)}</group>;
}
