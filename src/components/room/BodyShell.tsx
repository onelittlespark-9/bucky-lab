import { useMemo } from "react";
import { Vector2 } from "three";
import { patientById } from "@/lib/sim/patients";
import { useSim } from "@/lib/sim/store";

export function BodyShell() {
  const patientId = useSim(s => s.patientId);
  const patient = patientById(patientId);
  const H = patient.heightCm / 100;
  const s = H / 1.7;
  const width = patient.morph.torsoWidth * s;
  const depth = patient.morph.torsoDepth * s;
  const points = useMemo<Vector2[]>(() => [
    new Vector2(width * .56, .40 * H),
    new Vector2(width * .78, .45 * H),
    new Vector2(width * .92, .53 * H),
    new Vector2(width * .98, .61 * H),
    new Vector2(width * 1.0, .69 * H),
    new Vector2(width * 1.02, .75 * H),
    new Vector2(width * .92, .80 * H),
    new Vector2(width * .48, .855 * H),
  ], [H, width]);
  return <mesh position={[0, 0, 0]} scale={[1, 1, Math.max(.55, depth / Math.max(.001, width))]} castShadow receiveShadow>
    <latheGeometry args={[points, 32]} />
    <meshPhysicalMaterial color={patient.skin} roughness={.58} metalness={0} clearcoat={.035} />
  </mesh>;
}