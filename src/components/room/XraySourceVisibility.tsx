import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef, useState } from "react";
import * as THREE from "three";
import { XraySourceAssembly } from "./XraySourceAssembly";

/** Keeps the tube out of the learner's working field while preserving the visible primary-beam field. */
export function XraySourceVisibility() {
  const { camera } = useThree();
  const group = useRef<THREE.Group>(null);
  const [manualHidden,setManualHidden] = useState(false);
  const [closeEnough,setCloseEnough] = useState(false);

  useFrame(() => {
    const target = group.current;
    if (!target) return;
    const distance = camera.position.distanceTo(new THREE.Vector3(0, 0.9, 0));
    const close = distance <= 2.15;
    if (close !== closeEnough) setCloseEnough(close);
    target.visible = true;
  });

  const tubeVisible = !manualHidden && !closeEnough;
  return <>
    <group ref={group}><XraySourceAssembly showTube={tubeVisible} /></group>
    <Html position={[1.55,2.05,0]} transform={false} style={{pointerEvents:"auto"}}>
      <button onClick={()=>setManualHidden(v=>!v)} style={{background:"rgba(8,12,15,.92)",color:"white",border:"1px solid rgba(255,255,255,.15)",borderRadius:8,padding:"7px 10px",fontFamily:"system-ui",fontSize:10,cursor:"pointer",whiteSpace:"nowrap"}}>
        {manualHidden?"▣ SHOW TUBE":"▣ HIDE TUBE"}{closeEnough&&!manualHidden?" · auto-hidden close-up":""}
      </button>
    </Html>
  </>;
}
