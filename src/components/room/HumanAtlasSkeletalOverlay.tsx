import { useEffect, useState, type ReactNode } from "react";
import * as THREE from "three";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import type { V3 } from "@/lib/sim/patient-kinematics";

interface AtlasPart { id: string; name: string; system: string; chunk: number; positions: number; normals: number; indices: number; vertexCount: number; indexCount: number; bounds: [number[], number[]]; }
interface AtlasManifest { version: string; parts: AtlasPart[]; chunks: { url: string; bytes: number }[]; triangles: number; }
const MODEL_ROOT = "/models/human-atlas/";
const ATLAS_HEIGHT_M = 1.7;

type BoneRegion = "axial" | "scapula" | "clavicle" | "upperArm" | "forearm" | "hand" | "pelvis" | "thigh" | "lowerLeg" | "foot";
function regionFor(name: string): BoneRegion {
  const n = name.toLowerCase();
  if (n.includes("scapula")) return "scapula";
  if (n.includes("clavicle")) return "clavicle";
  if (n.includes("humerus")) return "upperArm";
  if (n.includes("radius") || n.includes("ulna")) return "forearm";
  if (n.includes("hand") || n.includes("metacarp") || n.includes("phalanx") || n.includes("carpal")) return "hand";
  if (n.includes("femur")) return "thigh";
  if (n.includes("tibia") || n.includes("fibula")) return "lowerLeg";
  if (n.includes("foot") || n.includes("metatars") || n.includes("talus") || n.includes("calcaneus") || n.includes("phalanges")) return "foot";
  if (n.includes("pelvis") || n.includes("ilium") || n.includes("ischium") || n.includes("pubis") || n.includes("sacrum")) return "pelvis";
  return "axial";
}
function sideFor(bounds: [number[], number[]]): -1 | 1 { return ((bounds[0][0] + bounds[1][0]) * 0.5) < 0 ? -1 : 1; }
function pivotFor(region: BoneRegion, side: -1 | 1, center: THREE.Vector3, H: number) {
  const shoulderY = 0.79 * H; const pelvisY = 0.47 * H; const kneeY = 0.245 * H;
  if (region === "scapula" || region === "clavicle" || region === "upperArm") return new THREE.Vector3(side * Math.max(0.10, Math.abs(center.x)), shoulderY, center.z);
  if (region === "forearm") return new THREE.Vector3(side * Math.max(0.09, Math.abs(center.x)), shoulderY - 0.16 * (H / ATLAS_HEIGHT_M), center.z);
  if (region === "hand") return new THREE.Vector3(side * Math.max(0.07, Math.abs(center.x)), shoulderY - 0.31 * (H / ATLAS_HEIGHT_M), center.z);
  if (region === "thigh") return new THREE.Vector3(side * Math.max(0.08, Math.abs(center.x)), pelvisY, center.z);
  if (region === "lowerLeg") return new THREE.Vector3(side * Math.max(0.08, Math.abs(center.x)), kneeY, center.z);
  if (region === "foot") return new THREE.Vector3(side * Math.max(0.08, Math.abs(center.x)), 0.055 * H, center.z);
  return new THREE.Vector3(0, 0, 0);
}

async function loadAtlas(): Promise<THREE.Group> {
  const response = await fetch(`${MODEL_ROOT}atlas.json`, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Human Atlas manifest failed to load (${response.status}).`);
  const atlas = (await response.json()) as AtlasManifest;
  const skeleton = atlas.parts.filter(part => part.system === "skeletal");
  if (!skeleton.length) throw new Error("Human Atlas contains no skeletal structures.");
  const root = new THREE.Group(); root.name = "BodyParts3D-Human-Atlas-Skeleton";
  const chunks = new Map<number, Array<{ part: AtlasPart; buffer: ArrayBuffer }>>();
  await Promise.all([...new Set(skeleton.map(p => p.chunk))].map(async chunkIndex => {
    const chunk = atlas.chunks[chunkIndex]; if (!chunk) throw new Error(`Human Atlas chunk ${chunkIndex} is missing from the manifest.`);
    const r = await fetch(chunk.url, { cache: "force-cache" }); if (!r.ok) throw new Error(`Human Atlas chunk ${chunkIndex} failed to load (${r.status}).`);
    const buffer = await r.arrayBuffer(); if (buffer.byteLength !== chunk.bytes) throw new Error(`Human Atlas chunk ${chunkIndex} is incomplete.`);
    chunks.set(chunkIndex, skeleton.filter(p => p.chunk === chunkIndex).map(part => ({ part, buffer })));
  }));
  for (const { part, buffer } of [...chunks.values()].flat()) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(buffer, part.positions, part.vertexCount * 3), 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Int16Array(buffer, part.normals, part.vertexCount * 3), 3, true));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer, part.indices, part.indexCount), 1));
    geometry.computeBoundingSphere();
    const region = regionFor(part.name); const side = sideFor(part.bounds);
    const center = new THREE.Vector3((part.bounds[0][0] + part.bounds[1][0]) / 2, (part.bounds[0][1] + part.bounds[1][1]) / 2, (part.bounds[0][2] + part.bounds[1][2]) / 2);
    const pivot = pivotFor(region, side, center, ATLAS_HEIGHT_M);
    if (region !== "axial" && region !== "pelvis") geometry.translate(-pivot.x, -pivot.y, -pivot.z);
    const material = new THREE.MeshStandardMaterial({ color: "#ded8c4", roughness: 0.78, metalness: 0.02, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: true });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Human Atlas bone ${part.name}`;
    mesh.userData.atlasRegion = region; mesh.userData.atlasSide = side; mesh.userData.atlasPivot = pivot;
    mesh.position.copy(pivot); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
  }
  return root;
}

function PatientTransform({ children }: { children: ReactNode }) {
  const patientId = useSim(s => s.patientId); const pose = useSim(s => s.pose); const equipment = useSim(s => s.equipment);
  const patient = patientById(patientId); const H = patient.heightCm / 100; const scale = H / ATLAS_HEIGHT_M;
  const bodyThickness = Math.max(0.13 * scale, 0.12 * patient.morph.torsoDepth * scale * 1.05); const footRadiusY = 0.045 * scale; const footSole = 0.055 * H - 0.012 * scale - footRadiusY;
  const kyphosis = patient.morph.kyphosis * 0.22; const oblique = pose.oblique * Math.PI / 180; const yaw = pose.rotationY * Math.PI / 180; const wall = equipment.placement !== "table";
  let groupPos: V3; let groupRot: V3;
  if (wall) { const floorY = equipment.placement === "seated" ? 0.38 : 0; const requestedY = floorY + equipment.patientY; const floorLockedY = equipment.placement === "seated" ? requestedY : Math.max(floorY - footSole, requestedY); groupPos = [equipment.patientX, floorLockedY, (equipment.placement === "upright-bucky" ? -0.48 : -0.32) + equipment.patientZ]; groupRot = [0, yaw, 0]; }
  else { const tableTop = equipment.tableHeight + 0.075; groupPos = [equipment.tableX + equipment.patientX, tableTop + bodyThickness + equipment.patientY, equipment.tableZ + H * 0.5 + equipment.patientZ]; groupRot = [-Math.PI / 2, 0, yaw]; }
  return <group position={groupPos} rotation={groupRot}><group rotation={[kyphosis, oblique, 0]} scale={scale}>{children}</group></group>;
}

function articulate(root: THREE.Group, pose: { shoulderRoll: number; armRaise: number; elbowFlex: number; hipInternal: number; kneeFlex: number }) {
  const shoulderAngle = THREE.MathUtils.clamp(pose.shoulderRoll, 0, 1) * THREE.MathUtils.degToRad(28);
  const raiseAngle = THREE.MathUtils.clamp(pose.armRaise, 0, 1) * THREE.MathUtils.degToRad(65);
  const elbowAngle = THREE.MathUtils.clamp(pose.elbowFlex, 0, 135) * Math.PI / 180;
  const hipAngle = THREE.MathUtils.clamp(pose.hipInternal, -45, 45) * Math.PI / 180;
  const kneeAngle = THREE.MathUtils.clamp(pose.kneeFlex, 0, 135) * Math.PI / 180;
  const zAxis = new THREE.Vector3(0, 0, 1); const xAxis = new THREE.Vector3(1, 0, 0);
  const transformPoint = (point: THREE.Vector3, pivot: THREE.Vector3, q: THREE.Quaternion) => point.sub(pivot).applyQuaternion(q).add(pivot);
  root.children.forEach(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const region = object.userData.atlasRegion as BoneRegion; const side = object.userData.atlasSide as -1 | 1; const pivot = object.userData.atlasPivot as THREE.Vector3;
    object.rotation.set(0, 0, 0); object.position.copy(pivot);
    if (region === "axial" || region === "pelvis") return;

    if (region === "scapula") {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -side * shoulderAngle * 0.75, 0, "XYZ"));
      object.quaternion.copy(q); object.position.z = pivot.z + 0.035 * (shoulderAngle / THREE.MathUtils.degToRad(28)); object.position.x = pivot.x + side * 0.018 * (shoulderAngle / THREE.MathUtils.degToRad(28));
      return;
    }
    if (region === "clavicle") {
      object.rotation.z = -side * shoulderAngle * 0.35; object.position.z = pivot.z + 0.018 * (shoulderAngle / THREE.MathUtils.degToRad(28));
      return;
    }

    const shoulderQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-shoulderAngle * 0.65, 0, -side * raiseAngle, "XYZ"));
    const shoulderPivot = new THREE.Vector3(pivot.x, 0.79 * (ATLAS_HEIGHT_M), pivot.z);
    const elbowPivot = new THREE.Vector3(side * Math.max(0.09, Math.abs(pivot.x)), 0.63 * ATLAS_HEIGHT_M, pivot.z);
    const elbowQ = new THREE.Quaternion().setFromAxisAngle(zAxis, -side * elbowAngle);

    if (region === "upperArm") {
      object.quaternion.copy(shoulderQ); object.position.copy(pivot); transformPoint(object.position, shoulderPivot, shoulderQ); return;
    }
    if (region === "forearm" || region === "hand") {
      const chainQ = shoulderQ.clone().multiply(elbowQ);
      const chainPivot = elbowPivot.clone(); transformPoint(chainPivot, shoulderPivot, shoulderQ);
      object.quaternion.copy(chainQ); object.position.copy(pivot); transformPoint(object.position, shoulderPivot, shoulderQ); transformPoint(object.position, chainPivot, elbowQ); return;
    }
    if (region === "thigh" || region === "lowerLeg" || region === "foot") {
      const hipQ = new THREE.Quaternion().setFromAxisAngle(zAxis, side * hipAngle * 0.55);
      const hipPivot = new THREE.Vector3(pivot.x, 0.47 * ATLAS_HEIGHT_M, pivot.z);
      if (region === "thigh") { object.quaternion.copy(hipQ); transformPoint(object.position, hipPivot, hipQ); return; }
      const kneePivot = new THREE.Vector3(pivot.x, 0.245 * ATLAS_HEIGHT_M, pivot.z); transformPoint(kneePivot, hipPivot, hipQ);
      const kneeQ = new THREE.Quaternion().setFromAxisAngle(xAxis, -kneeAngle);
      object.quaternion.copy(hipQ.clone().multiply(kneeQ)); transformPoint(object.position, hipPivot, hipQ); transformPoint(object.position, kneePivot, kneeQ);
    }
  });
}

export function HumanAtlasSkeletalOverlay() {
  const visible = useSim(s => s.anatomyVisibility.skeleton); const exposing = useSim(s => s.exposing); const patientId = useSim(s => s.patientId); const pose = useSim(s => s.pose);
  const [atlas, setAtlas] = useState<THREE.Group | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { let cancelled = false; loadAtlas().then(group => { if (cancelled) { group.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); } }); return; } setAtlas(group); }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Human Atlas could not be loaded."); }); return () => { cancelled = true; }; }, []);
  useEffect(() => { if (!atlas) return; articulate(atlas, pose); atlas.traverse(o => { if (!(o instanceof THREE.Mesh)) return; const materials = Array.isArray(o.material) ? o.material : [o.material]; materials.forEach(m => { m.transparent = true; m.opacity = exposing ? 0.96 : 0.32; m.needsUpdate = true; }); }); }, [atlas, pose, exposing]);
  useEffect(() => () => { atlas?.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); } }); }, [atlas]);
  if (!visible || error || !atlas) return null;
  return <PatientTransform><primitive object={atlas} /></PatientTransform>;
}
