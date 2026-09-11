import { useMemo } from "react";
import { patientById } from "@/lib/sim/patients";
import { useSim } from "@/lib/sim/store";

type V2 = [number, number];

export function BodyShell() {
  const patientId = useSim(s => s.patientId);
  const patient = patientById(patientId);
  const H = patient.heightCm / 100;
  const s = H / 1.7;
  const width = patient.morph.torsoWidth * s;
  const depth = patient.morph.torsoDepth * s;
  const points = useMemo<V2[]>(() => [
    [width * .56, .40 * H],
    [width * .78, .45 * H],
    [width * .92, .53 * H],
    [width * .98, .61 * H],
    [width * 1.0, .69 * H],
    [width * 1.02, .75 * H],
    [width * .92, .80 * H],
    [width * .48, .855 * H],
  ], [H, width]);
  return <mesh position={[0, 0, 0]} scale={[1, 1, Math.max(.55, depth / Math.max(.001, width))]} castShadow receiveShadow>
    <latheGeometry args={[points, 32]} />
    <meshPhysicalMaterial color={patient.skin} roughness={.58} metalness={0} clearcoat={.035} />
  </mesh>;
}
