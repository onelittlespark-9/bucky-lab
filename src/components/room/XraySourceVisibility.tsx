import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { XraySourceAssembly } from "./XraySourceAssembly";

/** Keeps the tube housing out of the way when the learner zooms in close to the anatomy. */
export function XraySourceVisibility() {
  const { camera } = useThree();
  const group = useRef<THREE.Group>(null);

  useFrame(() => {
    const target = group.current;
    if (!target) return;
    // The tube remains visible at normal working distance, but disappears
    // before it can occlude the patient's field of view during close inspection.
    const distance = camera.position.distanceTo(new THREE.Vector3(0, 0.9, 0));
    target.visible = distance > 2.15;
  });

  return <group ref={group}><XraySourceAssembly /></group>;
}
