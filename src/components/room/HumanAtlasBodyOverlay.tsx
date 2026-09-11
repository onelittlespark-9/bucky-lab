import { useEffect, useState, type ReactNode } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import type { V3 } from "@/lib/sim/patient-kinematics";

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
      mesh.name = `Human Atlas body surface chunk ${chunkIndex}`; mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.basePositions = new Float32Array(merged.getAttribute("position").array as Float32Array); root.add(mesh);
    } finally { for (const geometry of geometries) geometry.dispose(); }
  }));
  return root;
}

function PatientTransform({ children }: { children: ReactNode }) {
  const patientId = useSim(s => s.patientId); const pose = useSim(s => s.pose); const equipment = useSim(s => s.equipment); const patient = patientById(patientId);
  const H = patient.heightCm / 100; const scale = H / ATLAS_HEIGHT_M; const bodyThickness = Math.max(0.13 * scale, 0.12 * patient.morph.torsoDepth * scale * 1.05); const footRadiusY = 0.045 * scale; const footSole = 0.055 * H - 0.012 * scale - footRadiusY;
  const kyphosis = patient.morph.kyphosis * 0.22; const oblique = pose.oblique * Math.PI / 180; const yaw = pose.rotationY * Math.PI / 180; const wall = equipment.placement !== "table";
  let groupPos: V3; let groupRot: V3;
  if (wall) { const floorY = equipment.placement === "seated" ? 0.38 : 0; const requestedY = floorY + equipment.patientY; const floorLockedY = equipment.placement === "seated" ? requestedY : Math.max(floorY - footSole, requestedY); groupPos = [equipment.patientX, floorLockedY, (equipment.placement === "upright-bucky" ? -0.48 : -0.32) + equipment.patientZ]; groupRot = [0, yaw, 0]; }
  else { const tableTop = equipment.tableHeight + 0.075; groupPos = [equipment.tableX + equipment.patientX, tableTop + bodyThickness + equipment.patientY, equipment.tableZ + H * 0.5 + equipment.patientZ]; groupRot = [-Math.PI / 2, 0, yaw]; }
  return <group position={groupPos} rotation={groupRot}><group rotation={[kyphosis, oblique, 0]} scale={scale}>{children}</group></group>;
}

function rotateWeighted(point: THREE.Vector3, pivot: THREE.Vector3, axis: THREE.Vector3, angle: number, weight: number) {
  if (weight <= 0.001) return;
  const q = new THREE.Quaternion().setFromAxisAngle(axis, angle * weight); point.sub(pivot).applyQuaternion(q).add(pivot);
}
function smoothstep(edge0: number, edge1: number, x: number) { const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); }

function deformSkin(root: THREE.Group, H: number, pose: { shoulderRoll: number; armRaise: number; elbowFlex: number; hipInternal: number; kneeFlex: number }) {
  const shoulder = 0.79 * H; const pelvis = 0.47 * H; const knee = 0.245 * H; const scale = H / ATLAS_HEIGHT_M;
  const shoulderRoll = THREE.MathUtils.clamp(pose.shoulderRoll, 0, 1) * THREE.MathUtils.degToRad(28);
  const raise = THREE.MathUtils.clamp(pose.armRaise, 0, 1) * THREE.MathUtils.degToRad(65);
  const elbow = THREE.MathUtils.clamp(pose.elbowFlex, 0, 135) * Math.PI / 180;
  const hip = THREE.MathUtils.clamp(pose.hipInternal, -45, 45) * Math.PI / 180;
  const kneeAngle = THREE.MathUtils.clamp(pose.kneeFlex, 0, 135) * Math.PI / 180;
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const attribute = object.geometry.getAttribute("position"); const base = object.userData.basePositions as Float32Array | undefined; if (!base) return;
    const target = attribute.array as Float32Array;
    for (let i = 0; i < target.length; i += 3) {
      const p = new THREE.Vector3(base[i], base[i + 1], base[i + 2]); const side: -1 | 1 = p.x < 0 ? -1 : 1; const ax = Math.abs(p.x);
      const armEnvelope = smoothstep(0.085 * scale, 0.14 * scale, ax);
      const upper = armEnvelope * smoothstep(0.64 * H, 0.79 * H, p.y) * (1 - smoothstep(0.78 * H, 0.86 * H, p.y));
      const lower = armEnvelope * smoothstep(0.43 * H, 0.64 * H, p.y) * (1 - smoothstep(0.63 * H, 0.71 * H, p.y));
      const hand = armEnvelope * smoothstep(0.35 * H, 0.47 * H, p.y) * (1 - smoothstep(0.46 * H, 0.54 * H, p.y));
      const shoulderPivot = new THREE.Vector3(side * Math.max(0.105 * scale, ax * 0.62), shoulder, p.z);
      rotateWeighted(p, shoulderPivot, new THREE.Vector3(0, 0, 1), -side * raise, upper);
      rotateWeighted(p, shoulderPivot, new THREE.Vector3(1, 0, 0), -shoulderRoll * 0.65, Math.max(upper, lower, hand));
      const elbowPivot = new THREE.Vector3(shoulderPivot.x, shoulder - 0.16 * scale, p.z);
      rotateWeighted(p, elbowPivot, new THREE.Vector3(0, 0, 1), -side * elbow, lower + hand);
      const hipEnvelope = smoothstep(0.065 * scale, 0.12 * scale, ax);
      const thigh = hipEnvelope * smoothstep(0.32 * H, 0.48 * H, p.y) * (1 - smoothstep(0.46 * H, 0.58 * H, p.y));
      const lowerLeg = hipEnvelope * smoothstep(0.06 * H, 0.26 * H, p.y) * (1 - smoothstep(0.23 * H, 0.34 * H, p.y));
      const hipPivot = new THREE.Vector3(side * Math.max(0.075 * scale, ax * 0.5), pelvis, p.z);
      rotateWeighted(p, hipPivot, new THREE.Vector3(0, 0, 1), side * hip * 0.55, thigh);
      const kneePivot = new THREE.Vector3(hipPivot.x, knee, p.z);
      rotateWeighted(p, kneePivot, new THREE.Vector3(1, 0, 0), -kneeAngle, lowerLeg);
      target[i] = p.x; target[i + 1] = p.y; target[i + 2] = p.z;
    }
    attribute.needsUpdate = true; object.geometry.computeVertexNormals(); object.geometry.computeBoundingSphere();
  });
}

export function HumanAtlasBodyOverlay() {
  const visible = useSim(s => s.anatomyVisibility.skin); const patientId = useSim(s => s.patientId); const pose = useSim(s => s.pose);
  const [atlas, setAtlas] = useState<THREE.Group | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { let cancelled = false; loadBodySurface().then(group => { if (cancelled) { group.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); } }); return; } setAtlas(group); }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Human Atlas body surface could not be loaded."); }); return () => { cancelled = true; }; }, []);
  useEffect(() => { if (!atlas) return; const patient = patientById(patientId); deformSkin(atlas, patient.heightCm / 100, pose); }, [atlas, patientId, pose]);
  useEffect(() => () => { atlas?.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); } }); }, [atlas]);
  if (!visible || error || !atlas) return null;
  return <PatientTransform><primitive object={atlas} /></PatientTransform>;
}
