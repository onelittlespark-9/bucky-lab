import { useEffect, useState, type ReactNode } from "react";
import * as THREE from "three";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { patientKinematics, type V3 } from "@/lib/sim/patient-kinematics";
import type { PlacementMode } from "@/lib/sim/types";

interface AtlasPart { id: string; name: string; system: string; chunk: number; positions: number; normals: number; indices: number; vertexCount: number; indexCount: number; bounds: [number[], number[]]; }
interface AtlasManifest { version: string; parts: AtlasPart[]; chunks: { url: string; bytes: number }[]; triangles: number; }
const MODEL_ROOT = "/models/human-atlas/";
const ATLAS_HEIGHT_M = 1.7;

type BoneRegion = "axial" | "scapula" | "clavicle" | "upperArm" | "forearm" | "hand" | "pelvis" | "thigh" | "lowerLeg" | "foot" | "rib";
function regionFor(name: string): BoneRegion {
  const n = name.toLowerCase();
  if (n.includes("rib") || n.includes("costal cartilage")) return "rib";
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

function atlasPivotFor(region: BoneRegion, side: -1 | 1, center: THREE.Vector3) {
  if (region === "scapula" || region === "clavicle" || region === "upperArm") return new THREE.Vector3(side * 0.19, 0.79, center.z);
  if (region === "forearm") return new THREE.Vector3(side * 0.31, 0.63, center.z);
  if (region === "hand") return new THREE.Vector3(side * 0.45, 0.48, center.z);
  if (region === "thigh") return new THREE.Vector3(side * 0.16, 0.47, center.z);
  if (region === "lowerLeg") return new THREE.Vector3(side * 0.16, 0.245, center.z);
  if (region === "foot") return new THREE.Vector3(side * 0.16, 0.055, center.z);
  return new THREE.Vector3(0, 0, 0);
}

function createAnatomicalRibs() {
  const root = new THREE.Group();
  root.name = "Bucky-Lab-natural-rib-cage";
  const material = new THREE.MeshStandardMaterial({ color: "#ded8c4", roughness: 0.78, metalness: 0.02, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: true });
  // Keep the cage inside the thoracic envelope. The old cage was too wide/tall.
  for (let level = 1; level <= 12; level += 1) {
    const y = 1.24 - (level - 1) * 0.038;
    const sidePoints = (side: -1 | 1): V3[] => {
      const posterior = [side * 0.040, y, -0.050] as V3;
      const lateral = [side * (0.112 + (level <= 6 ? 0.008 : 0)), y - 0.003 - level * 0.0008, 0.006] as V3;
      const anterolateral = [side * (0.160 - Math.max(0, level - 7) * 0.009), y - 0.014, 0.050] as V3;
      if (level <= 7) return [posterior, lateral, anterolateral, [side * 0.090, y - 0.028, 0.080], [side * 0.024, y - 0.038, 0.090]];
      if (level <= 10) return [posterior, lateral, anterolateral, [side * 0.066, y - 0.025, 0.078]];
      return [posterior, [side * 0.095, y - 0.006, 0.006], [side * 0.135, y - 0.014, 0.034], [side * 0.112, y - 0.024, 0.056]];
    };
    ([-1, 1] as const).forEach(side => {
      const curve = new THREE.CatmullRomCurve3(sidePoints(side).map(p => new THREE.Vector3(...p)), false, "centripetal", 0.5);
      const geometry = new THREE.TubeGeometry(curve, 24, level <= 10 ? 0.0048 : 0.0044, 8, false);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `Bucky Lab rib ${level}${side < 0 ? " left" : " right"}`;
      mesh.userData.atlasRegion = "rib";
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
    });
  }
  return root;
}

async function loadAtlas(): Promise<THREE.Group> {
  const response = await fetch(`${MODEL_ROOT}atlas.json`, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Human Atlas manifest failed to load (${response.status}).`);
  const atlas = (await response.json()) as AtlasManifest;
  const skeleton = atlas.parts.filter(part => part.system === "skeletal" && regionFor(part.name) !== "rib");
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
    const pivot = atlasPivotFor(region, side, center);
    if (region !== "axial" && region !== "pelvis") geometry.translate(-pivot.x, -pivot.y, -pivot.z);
    const material = new THREE.MeshStandardMaterial({ color: "#ded8c4", roughness: 0.78, metalness: 0.02, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: true });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Human Atlas bone ${part.name}`;
    mesh.userData.atlasRegion = region; mesh.userData.atlasSide = side; mesh.userData.atlasPivot = pivot;
    mesh.position.copy(pivot); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
  }
  root.add(createAnatomicalRibs());
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

function articulate(root: THREE.Group, pose: { shoulderRoll: number; armRaise: number; elbowFlex: number; hipInternal: number; kneeFlex: number }, patient: ReturnType<typeof patientById>, placement: PlacementMode) {
  const H = patient.heightCm / 100;
  const scale = H / ATLAS_HEIGHT_M;
  const kin = patientKinematics({
    H,
    s: 1,
    shoulder: patient.morph.shoulder,
    hip: patient.morph.hip,
    limb: patient.morph.limb,
    elbowFlex: pose.elbowFlex,
    hipInternal: pose.hipInternal,
    armRaise: pose.armRaise,
    shoulderRoll: pose.shoulderRoll,
    kneeFlex: pose.kneeFlex,
    projectionId: "pa-chest",
    placement,
    buckyTilt: 0,
  });
  const shoulderAngle = THREE.MathUtils.clamp(pose.shoulderRoll, 0, 1) * THREE.MathUtils.degToRad(28);
  const raiseAngle = THREE.MathUtils.clamp(pose.armRaise, 0, 1) * THREE.MathUtils.degToRad(65);
  const hipAngle = THREE.MathUtils.clamp(pose.hipInternal, -45, 45) * Math.PI / 180;
  const elbowAngle = THREE.MathUtils.clamp(pose.elbowFlex, 0, 135) * Math.PI / 180;
  const kneeAngle = THREE.MathUtils.clamp(pose.kneeFlex, 0, 135) * Math.PI / 180;
  const zAxis = new THREE.Vector3(0, 0, 1); const xAxis = new THREE.Vector3(1, 0, 0);
  const transformPoint = (point: THREE.Vector3, pivot: THREE.Vector3, q: THREE.Quaternion) => point.sub(pivot).applyQuaternion(q).add(pivot);
  const local = (p: V3) => new THREE.Vector3(p[0] / scale, p[1] / scale, p[2] / scale);
  root.children.forEach(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const region = object.userData.atlasRegion as BoneRegion; const side = object.userData.atlasSide as -1 | 1; const atlasPivot = object.userData.atlasPivot as THREE.Vector3;
    object.rotation.set(0, 0, 0); if (atlasPivot) object.position.copy(atlasPivot);
    if (region === "axial" || region === "pelvis" || region === "rib" || !atlasPivot) return;
    const sideIndex = side < 0 ? 0 : 1;
    const arm = kin.arms[sideIndex];
    const leg = kin.legs[sideIndex];
    const shoulderPivot = local(arm.shoulder);
    const elbowPivot = local(arm.elbow);
    const wristPivot = local(arm.wrist);
    const hipPivot = local(leg.hip);
    const kneePivot = local(leg.knee);
    const anklePivot = local(leg.ankle);
    if (region === "scapula") {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -side * shoulderAngle * 0.75, 0, "XYZ"));
      object.quaternion.copy(q); object.position.copy(shoulderPivot); return;
    }
    if (region === "clavicle") {
      object.rotation.z = -side * shoulderAngle * 0.35; object.position.copy(shoulderPivot); return;
    }
    const shoulderQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-shoulderAngle * 0.65, 0, -side * raiseAngle, "XYZ"));
    const elbowQ = new THREE.Quaternion().setFromAxisAngle(zAxis, -side * elbowAngle);
    if (region === "upperArm") { object.quaternion.copy(shoulderQ); object.position.copy(shoulderPivot); return; }
    if (region === "forearm") {
      const transformedElbow = elbowPivot.clone(); transformPoint(transformedElbow, shoulderPivot, shoulderQ);
      object.quaternion.copy(shoulderQ.clone().multiply(elbowQ)); object.position.copy(transformedElbow); return;
    }
    if (region === "hand") {
      const transformedElbow = elbowPivot.clone(); const transformedWrist = wristPivot.clone();
      transformPoint(transformedElbow, shoulderPivot, shoulderQ); transformPoint(transformedWrist, shoulderPivot, shoulderQ); transformPoint(transformedWrist, transformedElbow, elbowQ);
      object.quaternion.copy(shoulderQ.clone().multiply(elbowQ)); object.position.copy(transformedWrist); return;
    }
    if (region === "thigh" || region === "lowerLeg" || region === "foot") {
      const hipQ = new THREE.Quaternion().setFromAxisAngle(zAxis, side * hipAngle * 0.55);
      if (region === "thigh") { object.quaternion.copy(hipQ); object.position.copy(hipPivot); return; }
      const transformedKnee = kneePivot.clone(); transformPoint(transformedKnee, hipPivot, hipQ);
      const kneeQ = new THREE.Quaternion().setFromAxisAngle(xAxis, -kneeAngle);
      if (region === "lowerLeg") { object.quaternion.copy(hipQ.clone().multiply(kneeQ)); object.position.copy(transformedKnee); return; }
      const transformedAnkle = anklePivot.clone(); transformPoint(transformedAnkle, hipPivot, hipQ); transformPoint(transformedAnkle, transformedKnee, kneeQ);
      object.quaternion.copy(hipQ.clone().multiply(kneeQ)); object.position.copy(transformedAnkle); return;
    }
  });
}

export function HumanAtlasSkeletalOverlay() {
  const visible = useSim(s => s.anatomyVisibility.skeleton); const exposing = useSim(s => s.exposing); const patientId = useSim(s => s.patientId); const pose = useSim(s => s.pose); const equipment = useSim(s => s.equipment);
  const [atlas, setAtlas] = useState<THREE.Group | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { let cancelled = false; loadAtlas().then(group => { if (cancelled) { group.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); } }); return; } setAtlas(group); }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Human Atlas could not be loaded."); }); return () => { cancelled = true; }; }, []);
  useEffect(() => { if (!atlas) return; articulate(atlas, pose, patientById(patientId), equipment.placement); atlas.traverse(o => { if (!(o instanceof THREE.Mesh)) return; const materials = Array.isArray(o.material) ? o.material : [o.material]; materials.forEach(m => { m.transparent = true; m.opacity = exposing ? 0.96 : 0.32; m.needsUpdate = true; }); }); }, [atlas, pose, exposing, patientId, equipment.placement]);
  useEffect(() => () => { atlas?.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); } }); }, [atlas]);
  if (!visible || error || !atlas) return null;
  return <PatientTransform><primitive object={atlas} /></PatientTransform>;
}
