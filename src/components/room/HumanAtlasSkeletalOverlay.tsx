import { useEffect, useState, type ReactNode } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import type { V3 } from "@/lib/sim/patient-kinematics";

interface AtlasPart {
  id: string;
  name: string;
  system: string;
  chunk: number;
  positions: number;
  normals: number;
  indices: number;
  vertexCount: number;
  indexCount: number;
  bounds: [number[], number[]];
}

interface AtlasManifest {
  version: string;
  parts: AtlasPart[];
  chunks: { url: string; bytes: number }[];
  triangles: number;
}

const MODEL_ROOT = "/models/human-atlas/";
const ATLAS_HEIGHT_M = 1.7;

async function loadAtlas(): Promise<THREE.Group> {
  const response = await fetch(`${MODEL_ROOT}atlas.json`, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Human Atlas manifest failed to load (${response.status}).`);
  const atlas = (await response.json()) as AtlasManifest;
  const skeleton = atlas.parts.filter(part => part.system === "skeletal");
  if (!skeleton.length) throw new Error("Human Atlas contains no skeletal structures.");

  const byChunk = new Map<number, AtlasPart[]>();
  for (const part of skeleton) {
    const list = byChunk.get(part.chunk) ?? [];
    list.push(part);
    byChunk.set(part.chunk, list);
  }

  const root = new THREE.Group();
  root.name = "BodyParts3D-Human-Atlas-Skeleton";

  await Promise.all(
    [...byChunk.entries()].map(async ([chunkIndex, parts]) => {
      const chunk = atlas.chunks[chunkIndex];
      if (!chunk) throw new Error(`Human Atlas chunk ${chunkIndex} is missing from the manifest.`);
      const chunkResponse = await fetch(chunk.url, { cache: "force-cache" });
      if (!chunkResponse.ok) throw new Error(`Human Atlas chunk ${chunkIndex} failed to load (${chunkResponse.status}).`);
      const buffer = await chunkResponse.arrayBuffer();
      if (buffer.byteLength !== chunk.bytes) throw new Error(`Human Atlas chunk ${chunkIndex} is incomplete.`);

      const geometries: THREE.BufferGeometry[] = [];
      try {
        for (const part of parts) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(buffer, part.positions, part.vertexCount * 3), 3));
          geometry.setAttribute("normal", new THREE.BufferAttribute(new Int16Array(buffer, part.normals, part.vertexCount * 3), 3, true));
          geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer, part.indices, part.indexCount), 1));
          geometries.push(geometry);
        }

        const merged = mergeGeometries(geometries, false);
        if (!merged) throw new Error(`Human Atlas chunk ${chunkIndex} could not be merged.`);
        merged.computeBoundingSphere();
        const material = new THREE.MeshStandardMaterial({
          color: "#ded8c4",
          roughness: 0.78,
          metalness: 0.02,
          transparent: true,
          opacity: 0.32,
          side: THREE.DoubleSide,
          depthWrite: true,
        });
        const mesh = new THREE.Mesh(merged, material);
        mesh.name = `Human Atlas skeleton chunk ${chunkIndex}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        root.add(mesh);
      } finally {
        for (const geometry of geometries) geometry.dispose();
      }
    }),
  );

  return root;
}

function PatientTransform({ children }: { children: ReactNode }) {
  const patientId = useSim(s => s.patientId);
  const pose = useSim(s => s.pose);
  const equipment = useSim(s => s.equipment);
  const patient = patientById(patientId);
  const H = patient.heightCm / 100;
  const scale = H / ATLAS_HEIGHT_M;
  const bodyThickness = Math.max(0.13 * scale, 0.12 * patient.morph.torsoDepth * scale * 1.05);
  const footRadiusY = 0.045 * scale;
  const footSole = 0.055 * H - 0.012 * scale - footRadiusY;
  const kyphosis = patient.morph.kyphosis * 0.22;
  const oblique = pose.oblique * Math.PI / 180;
  const yaw = pose.rotationY * Math.PI / 180;
  const wall = equipment.placement !== "table";

  let groupPos: V3;
  let groupRot: V3;
  if (wall) {
    const floorY = equipment.placement === "seated" ? 0.38 : 0;
    const requestedY = floorY + equipment.patientY;
    const floorLockedY = equipment.placement === "seated" ? requestedY : Math.max(floorY - footSole, requestedY);
    groupPos = [equipment.patientX, floorLockedY, (equipment.placement === "upright-bucky" ? -0.48 : -0.32) + equipment.patientZ];
    groupRot = [0, yaw, 0];
  } else {
    const tableTop = equipment.tableHeight + 0.075;
    groupPos = [equipment.tableX + equipment.patientX, tableTop + bodyThickness + equipment.patientY, equipment.tableZ + H * 0.5 + equipment.patientZ];
    groupRot = [-Math.PI / 2, 0, yaw];
  }

  return <group position={groupPos} rotation={groupRot}><group rotation={[kyphosis, oblique, 0]} scale={scale}>{children}</group></group>;
}

export function HumanAtlasSkeletalOverlay() {
  const visible = useSim(s => s.anatomyVisibility.skeleton);
  const exposing = useSim(s => s.exposing);
  const [atlas, setAtlas] = useState<THREE.Group | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadAtlas().then(group => {
      if (cancelled) {
        group.traverse(object => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
            else object.material.dispose();
          }
        });
        return;
      }
      setAtlas(group);
    }).catch(reason => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Human Atlas could not be loaded.");
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!atlas) return;
    atlas.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        material.transparent = true;
        material.opacity = exposing ? 0.96 : 0.32;
        material.needsUpdate = true;
      }
    });
  }, [atlas, exposing]);

  useEffect(() => () => {
    atlas?.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
        else object.material.dispose();
      }
    });
  }, [atlas]);

  if (!visible || error || !atlas) return null;
  return <PatientTransform><primitive object={atlas} /></PatientTransform>;
}
