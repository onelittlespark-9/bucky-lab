import * as THREE from "three";
import { useMemo } from "react";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { scaleLandmarkY } from "@/lib/sim/projections";
import { SHARED_ORGANS, SPINE_LEVELS_CM, RIB_LEVELS_CM, scaleAnatomyCm } from "@/lib/sim/anatomy-structures";

type V3 = [number, number, number];
function Material({ color, opacity, roughness = .65 }: { color: string; opacity: number; roughness?: number }) { return <meshPhysicalMaterial color={color} transparent opacity={opacity} roughness={roughness} metalness={0} depthWrite={false} depthTest={false} side={THREE.DoubleSide} />; }
function Organ({ position, scale, color, opacity, rotation = [0, 0, 0] as V3 }: { position: V3; scale: V3; color: string; opacity: number; rotation?: V3 }) { return <mesh position={position} rotation={rotation} scale={scale} renderOrder={8}><sphereGeometry args={[1, 36, 24]} /><Material color={color} opacity={opacity} /></mesh>; }
function Tube({ a, b, radius, color, opacity }: { a: V3; b: V3; radius: number; color: string; opacity: number }) { const { position, quaternion, length } = useMemo(() => { const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), d = end.clone().sub(start), length = d.length(), quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return { position: start.add(end).multiplyScalar(.5), quaternion, length }; }, [a, b]); return <mesh position={position} quaternion={quaternion} renderOrder={9}><capsuleGeometry args={[radius, Math.max(.01, length - radius * 2), 10, 16]} /><Material color={color} opacity={opacity} /></mesh>; }
function Bone({ position, scale, opacity, color = "#e8dfc8" }: { position: V3; scale: V3; opacity: number; color?: string }) { return <mesh position={position} scale={scale} renderOrder={7}><sphereGeometry args={[1, 24, 16]} /><Material color={color} opacity={opacity} roughness={.78} /></mesh>; }
function LayeredTorso({ H, s, width, depth, exposing, skin }: { H: number; s: number; width: number; depth: number; exposing: boolean; skin: string }) {
  const muscleOpacity = exposing ? .18 : .055, fatOpacity = exposing ? .11 : .035;
  const profile = (w: number, h: number, d: number) => [[w * .48, .44 * h], [w * .78, .50 * h], [w * .94, .59 * h], [w * 1.0, .68 * h], [w * .97, .76 * h], [w * .76, .82 * h], [w * .45, .86 * h]] as V3[];
  return <group renderOrder={2}>
    <mesh scale={[1, 1, Math.max(.5, depth / Math.max(.001, width))]}><latheGeometry args={[profile(width * .98, H, depth), 40]} /><Material color="#b88763" opacity={fatOpacity} /></mesh>
    <mesh scale={[1, 1, Math.max(.5, depth * .82 / Math.max(.001, width * .92))]}><latheGeometry args={[profile(width * .90, H, depth * .82), 40]} /><Material color="#a75d55" opacity={muscleOpacity} /></mesh>
    <mesh scale={[1, 1, Math.max(.5, depth * .66 / Math.max(.001, width * .82))]}><latheGeometry args={[profile(width * .80, H, depth * .66), 40]} /><Material color={skin} opacity={exposing ? .025 : .01} /></mesh>
  </group>;
}

export function InternalAnatomy() {
  const patientId = useSim(s => s.patientId), projectionId = useSim(s => s.projectionId), exposing = useSim(s => s.exposing);
  const patient = patientById(patientId), H = patient.heightCm / 100, s = H / 1.7, xScale = patient.morph.torsoWidth * s, zScale = patient.morph.torsoDepth * s;
  const anatomyOpacity = exposing ? .9 : .32, lateral = projectionId.includes("lat");
  const Y = { head: .955 * H, neck: .86 * H, clavicle: H - scaleLandmarkY(26, patient.heightCm) / 100, pelvis: H - scaleLandmarkY(72, patient.heightCm) / 100, pubis: H - scaleLandmarkY(82, patient.heightCm) / 100 };
  const point = (cm: number) => H - scaleAnatomyCm(cm, patient.heightCm) / 100;
  const organScale = (v: number) => scaleAnatomyCm(v, patient.heightCm) / 100;
  const zFront = lateral ? .035 * zScale : .015 * zScale;
  return <group>
    <LayeredTorso H={H} s={s} width={xScale} depth={zScale} exposing={exposing} skin={patient.skin} />

    <Bone position={[0, Y.head, 0]} scale={[.09 * s, .105 * s, .08 * s]} opacity={anatomyOpacity} />
    <Tube a={[0, Y.neck, -.015 * s]} b={[0, Y.clavicle + .03 * s, -.02 * s]} radius={.018 * s} color="#e7dfc9" opacity={anatomyOpacity} />

    {SPINE_LEVELS_CM.map((cm, i) => { const y = point(cm), lumbar = i > 10; return <Bone key={`v-${i}`} position={[0, y, -.028 * zScale]} scale={[(lumbar ? .030 : .022) * s, .018 * s, .027 * s]} opacity={anatomyOpacity} />; })}
    {RIB_LEVELS_CM.map((cm, i) => { const y = point(cm), width = (.125 - i * .003) * patient.morph.torsoWidth * s; return <group key={`rib-${i}`}><Tube a={[-.012 * s, y, 0]} b={[-width, y - .008 * s, -.015 * s]} radius={.0075 * s} color="#e7dfc9" opacity={anatomyOpacity * .78} /><Tube a={[.012 * s, y, 0]} b={[width, y - .008 * s, -.015 * s]} radius={.0075 * s} color="#e7dfc9" opacity={anatomyOpacity * .78} /></group>; })}
    <Tube a={[-.12 * xScale, Y.clavicle, 0]} b={[0, Y.clavicle - .008 * s, .02 * zScale]} radius={.009 * s} color="#e7dfc9" opacity={anatomyOpacity} />
    <Tube a={[.12 * xScale, Y.clavicle, 0]} b={[0, Y.clavicle - .008 * s, .02 * zScale]} radius={.009 * s} color="#e7dfc9" opacity={anatomyOpacity} />
    <Tube a={[0, Y.clavicle, .015 * zScale]} b={[0, point(48), .015 * zScale]} radius={.012 * s} color="#e7dfc9" opacity={anatomyOpacity} />

    {SHARED_ORGANS.map(o => {
      const x = organScale(o.xCm) * 100 / 100 * patient.morph.torsoWidth;
      const y = point(o.yCm);
      const sx = organScale(o.widthCm) * .5 * patient.morph.torsoWidth;
      const sy = organScale(o.heightCm) * .5;
      const sz = organScale(o.depthCm) * .5;
      const color = o.id.startsWith("lung") ? "#82aeb9" : o.id === "heart" ? "#9f4d59" : o.id === "liver" ? "#8d6849" : o.id === "stomach" ? "#a56859" : "#99635b";
      const organOpacity = o.density === "lung" ? anatomyOpacity * .72 : anatomyOpacity * .88;
      const xPos = o.xCm * s / 100;
      return <Organ key={o.id} position={[xPos * patient.morph.torsoWidth, y, zFront]} scale={[Math.max(.025, sx), Math.max(.03, sy), Math.max(.025, sz)]} color={color} opacity={organOpacity} rotation={o.id === "heart" ? [0, 0, -.18] : [0, 0, 0]} />;
    })}

    <Tube a={[0, point(20), .02 * zScale]} b={[0, point(48), .02 * zScale]} radius={.011 * s} color="#8bbbc5" opacity={anatomyOpacity * .9} />
    <Bone position={[-.075 * xScale, Y.pelvis, 0]} scale={[.075 * xScale, .085 * H, .038 * zScale]} opacity={anatomyOpacity} />
    <Bone position={[.075 * xScale, Y.pelvis, 0]} scale={[.075 * xScale, .085 * H, .038 * zScale]} opacity={anatomyOpacity} />
    <Bone position={[0, Y.pubis, .025 * zScale]} scale={[.045 * xScale, .025 * H, .025 * zScale]} opacity={anatomyOpacity} />
    <Tube a={[-.075 * xScale, Y.pelvis - .02 * H, 0]} b={[-.065 * xScale, .245 * H, 0]} radius={.025 * s} color="#e7dfc9" opacity={anatomyOpacity} />
    <Tube a={[.075 * xScale, Y.pelvis - .02 * H, 0]} b={[.065 * xScale, .245 * H, 0]} radius={.025 * s} color="#e7dfc9" opacity={anatomyOpacity} />
  </group>;
}
