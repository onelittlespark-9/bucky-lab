import * as THREE from "three";
import { useMemo } from "react";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { scaleLandmarkY } from "@/lib/sim/projections";

type V3 = [number, number, number];

function Material({ color, opacity }: { color: string; opacity: number }) {
  return <meshPhysicalMaterial color={color} transparent opacity={opacity} roughness={.62} metalness={0} depthWrite={false} side={THREE.DoubleSide} />;
}
function Organ({ position, scale, color, opacity }: { position: V3; scale: V3; color: string; opacity: number }) {
  return <mesh position={position} scale={scale} renderOrder={5}><sphereGeometry args={[1, 28, 20]} /><Material color={color} opacity={opacity} /></mesh>;
}
function Tube({ a, b, radius, color, opacity }: { a: V3; b: V3; radius: number; color: string; opacity: number }) {
  const { position, quaternion, length } = useMemo(() => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const d = end.clone().sub(start), length = d.length();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return { position: start.add(end).multiplyScalar(.5), quaternion, length };
  }, [a, b]);
  return <mesh position={position} quaternion={quaternion} renderOrder={6}><capsuleGeometry args={[radius, Math.max(.01, length - radius * 2), 8, 12]} /><Material color={color} opacity={opacity} /></mesh>;
}
function Bone({ position, scale, opacity }: { position: V3; scale: V3; opacity: number }) {
  return <mesh position={position} scale={scale} renderOrder={4}><sphereGeometry args={[1, 20, 12]} /><Material color="#e7dfc9" opacity={opacity} /></mesh>;
}

export function InternalAnatomy() {
  const patientId = useSim(s => s.patientId);
  const projectionId = useSim(s => s.projectionId);
  const exposing = useSim(s => s.exposing);
  const patient = patientById(patientId);
  const H = patient.heightCm / 100;
  const s = H / 1.7;
  const xScale = patient.morph.torsoWidth * s;
  const zScale = patient.morph.torsoDepth * s;
  const opacity = exposing ? .82 : .24;
  const Y = {
    head: .955 * H,
    neck: .86 * H,
    clavicle: H - scaleLandmarkY(26, patient.heightCm) / 100,
    heart: H - scaleLandmarkY(42, patient.heightCm) / 100,
    diaphragm: H - scaleLandmarkY(48, patient.heightCm) / 100,
    stomach: H - scaleLandmarkY(55, patient.heightCm) / 100,
    liver: H - scaleLandmarkY(56, patient.heightCm) / 100,
    kidneys: H - scaleLandmarkY(63, patient.heightCm) / 100,
    pelvis: H - scaleLandmarkY(72, patient.heightCm) / 100,
    pubis: H - scaleLandmarkY(82, patient.heightCm) / 100,
  };
  const lungDepth = Math.max(.035, zScale * .62);
  const organDepth = Math.max(.045, zScale * .55);
  const lateral = projectionId.includes("lat");
  const z = lateral ? .035 * zScale : -.005 * zScale;
  return <group>
    <Bone position={[0, Y.head, 0]} scale={[.09 * s, .105 * s, .08 * s]} opacity={opacity} />
    <Tube a={[0, Y.neck, -.015 * s]} b={[0, Y.clavicle + .03 * s, -.02 * s]} radius={.018 * s} color="#e7dfc9" opacity={opacity} />
    {Array.from({ length: 18 }, (_, i) => { const y = H - scaleLandmarkY(22 + i * 3.8, patient.heightCm) / 100; const lumbar = i > 11; return <Bone key={`v-${i}`} position={[0, y, -.025 * zScale]} scale={[(lumbar ? .027 : .021) * s, .018 * s, .026 * s]} opacity={opacity} />; })}
    {Array.from({ length: 9 }, (_, i) => { const y = H - scaleLandmarkY(28 + i * 2.9, patient.heightCm) / 100; const width = (.12 - i * .002) * patient.morph.torsoWidth * s; return <group key={`rib-${i}`}><Tube a={[-.015 * s, y, 0]} b={[-width, y - .006 * s, -.01 * s]} radius={.008 * s} color="#e7dfc9" opacity={opacity * .72} /><Tube a={[.015 * s, y, 0]} b={[width, y - .006 * s, -.01 * s]} radius={.008 * s} color="#e7dfc9" opacity={opacity * .72} /></group>; })}
    <Tube a={[0, Y.clavicle, .025 * zScale]} b={[0, Y.diaphragm + .025 * s, .025 * zScale]} radius={.012 * s} color="#e7dfc9" opacity={opacity} />
    <Tube a={[-.12 * xScale, Y.clavicle, 0]} b={[0, Y.clavicle - .008 * s, .02 * zScale]} radius={.009 * s} color="#e7dfc9" opacity={opacity} />
    <Tube a={[.12 * xScale, Y.clavicle, 0]} b={[0, Y.clavicle - .008 * s, .02 * zScale]} radius={.009 * s} color="#e7dfc9" opacity={opacity} />
    <Organ position={[-.062 * xScale, Y.diaphragm + .075 * H, z]} scale={[.105 * xScale, .18 * H, lungDepth]} color="#8bb9c5" opacity={opacity * .78} />
    <Organ position={[.062 * xScale, Y.diaphragm + .075 * H, z]} scale={[.105 * xScale, .18 * H, lungDepth]} color="#8bb9c5" opacity={opacity * .78} />
    <Tube a={[0, Y.clavicle - .01 * s, .02 * zScale]} b={[0, Y.diaphragm + .12 * H, .01 * zScale]} radius={.012 * s} color="#9bc7d0" opacity={opacity} />
    <Organ position={[.018 * xScale, Y.heart, .055 * zScale]} scale={[.065 * xScale, .085 * H, organDepth * .7]} color="#a84f58" opacity={opacity} />
    <Organ position={[.055 * xScale, Y.liver, .02 * zScale]} scale={[.12 * xScale, .065 * H, organDepth]} color="#8f6845" opacity={opacity * .88} />
    <Organ position={[-.055 * xScale, Y.stomach, .035 * zScale]} scale={[.055 * xScale, .045 * H, organDepth * .7]} color="#a56a58" opacity={opacity * .9} />
    <Organ position={[0, Y.stomach - .025 * H, .04 * zScale]} scale={[.105 * xScale, .045 * H, organDepth * .65]} color="#b38b63" opacity={opacity * .48} />
    <Organ position={[-.07 * xScale, Y.kidneys, -.015 * zScale]} scale={[.034 * xScale, .055 * H, .03 * zScale]} color="#9a6359" opacity={opacity * .88} />
    <Organ position={[.07 * xScale, Y.kidneys, -.015 * zScale]} scale={[.034 * xScale, .055 * H, .03 * zScale]} color="#9a6359" opacity={opacity * .88} />
    <Bone position={[-.075 * xScale, Y.pelvis, 0]} scale={[.065 * xScale, .075 * H, .035 * zScale]} opacity={opacity} />
    <Bone position={[.075 * xScale, Y.pelvis, 0]} scale={[.065 * xScale, .075 * H, .035 * zScale]} opacity={opacity} />
    <Bone position={[0, Y.pubis, .025 * zScale]} scale={[.045 * xScale, .025 * H, .025 * zScale]} opacity={opacity} />
    <Tube a={[-.075 * xScale, Y.pelvis - .02 * H, 0]} b={[-.065 * xScale, .245 * H, 0]} radius={.025 * s} color="#e7dfc9" opacity={opacity} />
    <Tube a={[.075 * xScale, Y.pelvis - .02 * H, 0]} b={[.065 * xScale, .245 * H, 0]} radius={.025 * s} color="#e7dfc9" opacity={opacity} />
  </group>;
}
