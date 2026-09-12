import { useEffect, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";

interface AtlasPart { id: string; name: string; system: string; chunk: number; positions: number; normals: number; indices: number; vertexCount: number; indexCount: number; }
interface AtlasManifest { parts: AtlasPart[]; chunks: { url: string; bytes: number }[]; }
const MODEL_ROOT = "/models/human-atlas/";
const ATLAS_HEIGHT_M = 1.7;

async function loadBodySurface(): Promise<THREE.Group> {
  const response = await fetch(`${MODEL_ROOT}atlas.json`, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Human Atlas manifest failed to load (${response.status}).`);
  const atlas = (await response.json()) as AtlasManifest;
  const surface = atlas.parts.filter(part => part.system === "integumentary");
  if (!surface.length) throw new Error("Human Atlas contains no integumentary body-surface structures.");
  const byChunk = new Map<number, AtlasPart[]>();
  for (const part of surface) { const list = byChunk.get(part.chunk) ?? []; list.push(part); byChunk.set(part.chunk, list); }
  const root = new THREE.Group(); root.name = "BodyParts3D-Human-Atlas-Body-Surface";
  await Promise.all([...byChunk.entries()].map(async ([chunkIndex, parts]) => {
    const chunk = atlas.chunks[chunkIndex]; if (!chunk) throw new Error(`Human Atlas chunk ${chunkIndex} is missing from the manifest.`);
    const chunkResponse = await fetch(chunk.url, { cache: "force-cache" }); if (!chunkResponse.ok) throw new Error(`Human Atlas chunk ${chunkIndex} failed to load (${chunkResponse.status}).`);
    const buffer = await chunkResponse.arrayBuffer(); if (buffer.byteLength !== chunk.bytes) throw new Error(`Human Atlas chunk ${chunkIndex} is incomplete.`);
    const geometries: THREE.BufferGeometry[] = [];
    try {
      for (const part of parts) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(buffer, part.positions, part.vertexCount * 3), 3));
        geometry.setAttribute("normal", new THREE.BufferAttribute(new Int16Array(buffer, part.normals, part.vertexCount * 3), 3, true));
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer, part.indices, part.indexCount), 1));
        geometries.push(geometry);
      }
      const merged = mergeGeometries(geometries, false); if (!merged) throw new Error(`Human Atlas chunk ${chunkIndex} could not be merged.`);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, new THREE.MeshPhysicalMaterial({ color: "#b88970", roughness: 0.66, metalness: 0, clearcoat: 0.03, side: THREE.DoubleSide, depthWrite: true }));
      mesh.name = `Human Atlas body surface chunk ${chunkIndex}`; mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.basePositions = new Float32Array(merged.getAttribute("position").array as Float32Array);
      root.add(mesh);
    } finally { for (const geometry of geometries) geometry.dispose(); }
  }));
  return root;
}

function smoothstep(edge0: number, edge1: number, x: number) { const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); }
function rotateAround(point: THREE.Vector3, pivot: THREE.Vector3, quaternion: THREE.Quaternion) { point.sub(pivot).applyQuaternion(quaternion).add(pivot); }

function deformSkin(root: THREE.Group, H: number, pose: { shoulderRoll: number; armRaise: number; elbowFlex: number; hipInternal: number; kneeFlex: number }) {
  const scale = H / ATLAS_HEIGHT_M, shoulderY = 0.75 * H, elbowY = 0.60 * H, pelvisY = 0.47 * H, kneeY = 0.245 * H;
  const shoulderRoll = THREE.MathUtils.clamp(pose.shoulderRoll, 0, 1) * THREE.MathUtils.degToRad(28);
  const raise = THREE.MathUtils.clamp(pose.armRaise, 0, 1) * THREE.MathUtils.degToRad(65);
  const elbow = THREE.MathUtils.clamp(pose.elbowFlex, 0, 135) * Math.PI / 180, hip = THREE.MathUtils.clamp(pose.hipInternal, -45, 45) * Math.PI / 180, knee = THREE.MathUtils.clamp(pose.kneeFlex, 0, 135) * Math.PI / 180;
  const shoulderAxis = new THREE.Vector3(0, 0, 1), kneeAxis = new THREE.Vector3(1, 0, 0);
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const attribute = object.geometry.getAttribute("position"), base = object.userData.basePositions as Float32Array | undefined;
    if (!base) return;
    const target = attribute.array as Float32Array;
    for (let i = 0; i < target.length; i += 3) {
      const original = new THREE.Vector3(base[i], base[i + 1], base[i + 2]), p = original.clone();
      const side: -1 | 1 = p.x < 0 ? -1 : 1, ax = Math.abs(p.x);
      const shoulderPivot = new THREE.Vector3(side * 0.18, shoulderY, 0), elbowPivot = new THREE.Vector3(side * 0.29, elbowY, 0), hipPivot = new THREE.Vector3(side * 0.15, pelvisY, 0), kneePivot = new THREE.Vector3(side * 0.15, kneeY, 0);
      const shoulderQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-shoulderRoll * 0.65, 0, -side * raise, "XYZ")), elbowQ = new THREE.Quaternion().setFromAxisAngle(shoulderAxis, -side * elbow), hipQ = new THREE.Quaternion().setFromAxisAngle(shoulderAxis, side * hip * 0.55), kneeQ = new THREE.Quaternion().setFromAxisAngle(kneeAxis, -knee);
      const shoulderEnvelope = smoothstep(0.13 * scale, 0.22 * scale, ax) * smoothstep(0.63 * H, 0.70 * H, p.y) * (1 - smoothstep(0.75 * H, 0.80 * H, p.y));
      const upperArm = smoothstep(0.17 * scale, 0.26 * scale, ax) * smoothstep(0.56 * H, 0.68 * H, p.y) * (1 - smoothstep(0.68 * H, 0.78 * H, p.y));
      const forearm = smoothstep(0.23 * scale, 0.33 * scale, ax) * smoothstep(0.41 * H, 0.59 * H, p.y) * (1 - smoothstep(0.57 * H, 0.64 * H, p.y));
      if (upperArm > 0.001) { rotateAround(p, shoulderPivot, shoulderQ); p.lerp(original, 1 - upperArm); }
      else if (forearm > 0.001) { const transformedElbow = elbowPivot.clone(); rotateAround(transformedElbow, shoulderPivot, shoulderQ); rotateAround(p, shoulderPivot, shoulderQ); rotateAround(p, transformedElbow, elbowQ); p.lerp(original, 1 - forearm); }
      else if (shoulderEnvelope > 0.001) { rotateAround(p, shoulderPivot, shoulderQ); p.lerp(original, 1 - shoulderEnvelope); }
      const hipEnvelope = smoothstep(0.10 * scale, 0.18 * scale, ax), thigh = hipEnvelope * smoothstep(0.32 * H, 0.40 * H, p.y) * (1 - smoothstep(0.45 * H, 0.55 * H, p.y)), lowerLeg = hipEnvelope * smoothstep(0.06 * H, 0.20 * H, p.y) * (1 - smoothstep(0.22 * H, 0.31 * H, p.y));
      if (thigh > 0.001) { rotateAround(p, hipPivot, hipQ); p.lerp(original, 1 - thigh); }
      else if (lowerLeg > 0.001) { const transformedKnee = kneePivot.clone(); rotateAround(transformedKnee, hipPivot, hipQ); rotateAround(p, hipPivot, hipQ); rotateAround(p, transformedKnee, kneeQ); p.lerp(original, 1 - lowerLeg); }
      target[i] = p.x; target[i + 1] = p.y; target[i + 2] = p.z;
    }
    attribute.needsUpdate = true; object.geometry.computeVertexNormals(); object.geometry.computeBoundingSphere();
  });
}

export function HumanAtlasBodyOverlay() {
  const visible = useSim(s => s.anatomyVisibility.skin), patientId = useSim(s => s.patientId), pose = useSim(s => s.pose);
  const [atlas, setAtlas] = useState<THREE.Group | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => { let cancelled = false; loadBodySurface().then(group => { if (cancelled) { group.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); } }); return; } setAtlas(group); }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Human Atlas body surface could not be loaded."); }); return () => { cancelled = true; }; }, []);
  useEffect(() => { if (!atlas) return; const patient = patientById(patientId); deformSkin(atlas, patient.heightCm / 100, pose); }, [atlas, patientId, pose]);
  useEffect(() => () => { atlas?.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); } }); }, [atlas]);
  if (!visible || error || !atlas) return null;
  return <primitive object={atlas} />;
}
