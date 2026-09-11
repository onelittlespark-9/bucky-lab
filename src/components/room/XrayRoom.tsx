import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { PatientModel } from "./PatientModel";

function tableTargetZ(tubeCrY: number, patientId: string, tableZ: number) {
  const patient = patientById(patientId);
  const h = patient.heightCm / 100;
  const localY = (1 - tubeCrY / patient.heightCm) * h;
  return tableZ - localY;
}

function LightField() {
  const tube = useSim((s) => s.tube);
  const show = useSim((s) => s.showLightField);
  const equipment = useSim((s) => s.equipment);
  const patientId = useSim((s) => s.patientId);
  const exposing = useSim((s) => s.exposing);
  const preparing = useSim((s) => s.preparing);
  const wall = equipment.placement === "upright-bucky" || equipment.placement === "standing" || equipment.placement === "seated";
  const mag = tube.sid / Math.max(80, tube.sid - 14);
  const fieldW = tube.collimationW / 100 / mag;
  const fieldH = tube.collimationH / 100 / mag;
  const sidM = tube.sid / 100;
  const angle = (tube.angle * Math.PI) / 180;
  const lock = tube.lockedToDetector;
  const bright = preparing || exposing;
  const targetZ = tableTargetZ(tube.crY, patientId, equipment.tableZ);

  let fieldPos: [number, number, number];
  let fieldRot: [number, number, number];
  let tubePos: [number, number, number];
  if (wall) {
    const tilt = (equipment.buckyTilt * Math.PI) / 180;
    fieldPos = [tube.crX / 100, equipment.buckyHeight, -0.68];
    fieldRot = [tilt, 0, 0];
    const detY = equipment.buckyHeight;
    const detX = lock ? 0 : tube.crX / 100;
    tubePos = [detX, detY, -0.55 + sidM];
  } else {
    fieldPos = [equipment.tableX + tube.crX / 100, equipment.tableHeight + 0.08, targetZ];
    fieldRot = [-Math.PI / 2, 0, 0];
    tubePos = [equipment.tableX + (lock ? 0 : tube.crX / 100), equipment.tableHeight + 0.08 + sidM, targetZ];
  }

  const coneGeo = useMemo(() => {
    const hw0 = 0.02, hh0 = 0.02, hw1 = fieldW / 2, hh1 = fieldH / 2, depth = Math.max(0.3, sidM - 0.15);
    const positions = new Float32Array([
      -hw0, -hh0, 0, hw0, -hh0, 0, hw0, hh0, 0, -hw0, hh0, 0,
      -hw1, -hh1, -depth, hw1, -hh1, -depth, hw1, hh1, -depth, -hw1, hh1, -depth,
    ]);
    const indices = [0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7, 4, 5, 6, 4, 6, 7];
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setIndex(indices); g.computeVertexNormals();
    return g;
  }, [fieldW, fieldH, sidM]);

  if (!show) return null;
  const mid: [number, number, number] = [(tubePos[0] + fieldPos[0]) / 2, (tubePos[1] + fieldPos[1]) / 2, (tubePos[2] + fieldPos[2]) / 2];
  return (
    <group>
      <mesh geometry={coneGeo} position={tubePos} rotation={wall ? [0, 0, -angle] : [Math.PI / 2 - angle, 0, 0]} renderOrder={1}>
        <meshBasicMaterial color={bright ? "#ffe566" : "#e2c35a"} transparent opacity={bright ? 0.28 : 0.16} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={fieldPos} rotation={fieldRot} renderOrder={2}>
        <planeGeometry args={[fieldW, fieldH]} />
        <meshBasicMaterial color={bright ? "#fff6a0" : "#f0d060"} transparent opacity={bright ? 0.55 : 0.35} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={fieldPos} rotation={fieldRot} renderOrder={3}>
        <planeGeometry args={[fieldW, fieldH]} />
        <meshBasicMaterial color="#e2c35a" transparent opacity={0.9} depthWrite={false} wireframe />
      </mesh>
      <pointLight position={mid} color="#ffe08a" intensity={bright ? 2.2 : 0.9} distance={Math.max(1.2, sidM)} decay={2} />
    </group>
  );
}

function TubeHead() {
  const tube = useSim((s) => s.tube);
  const equipment = useSim((s) => s.equipment);
  const patientId = useSim((s) => s.patientId);
  const preparing = useSim((s) => s.preparing);
  const exposing = useSim((s) => s.exposing);
  const spin = useRef(0);
  const anode = useRef<THREE.Mesh>(null);
  const wall = equipment.placement === "upright-bucky" || equipment.placement === "standing" || equipment.placement === "seated";
  useFrame((_, dt) => { const d = Math.min(dt, 0.1); if (preparing || exposing) spin.current += d * 18; if (anode.current) anode.current.rotation.z = spin.current; });
  const sidM = tube.sid / 100;
  const angle = (tube.angle * Math.PI) / 180;
  const lock = tube.lockedToDetector;
  let pos: [number, number, number];
  let rot: [number, number, number];
  if (wall) {
    const detY = lock ? equipment.buckyHeight : equipment.buckyHeight + (tube.crY / 100 - 1.0) * 0.15;
    const detX = lock ? 0 : tube.crX / 100;
    pos = [detX, detY, -0.55 + sidM]; rot = [0, 0, -angle];
  } else {
    const detY = equipment.tableHeight + 0.08 + sidM;
    const detX = equipment.tableX + (lock ? 0 : tube.crX / 100);
    const detZ = tableTargetZ(tube.crY, patientId, equipment.tableZ);
    pos = [detX, detY, detZ]; rot = [Math.PI / 2 - angle, 0, 0];
  }
  return (
    <group position={pos} rotation={rot}>
      <mesh position={[0, 0, 0.12]}><boxGeometry args={[0.22, 0.16, 0.28]} /><meshStandardMaterial color="#3a4148" metalness={0.4} roughness={0.4} /></mesh>
      <mesh position={[0, 0, -0.08]} ref={anode}><cylinderGeometry args={[0.07, 0.09, 0.12, 16]} /><meshStandardMaterial color="#1c2228" metalness={0.6} roughness={0.3} /></mesh>
      <mesh position={[0, 0, -0.18]}><boxGeometry args={[0.18, 0.14, 0.08]} /><meshStandardMaterial color="#2a3036" /></mesh>
      {(preparing || exposing) && <pointLight color={exposing ? "#fff7e0" : "#e2c35a"} intensity={exposing ? 8 : 2.4} distance={3} />}
      <mesh position={[0, 0.28, 0.1]}><boxGeometry args={[0.04, 0.4, 0.04]} /><meshStandardMaterial color="#4a5560" /></mesh>
      {lock ? <mesh position={[0.12, 0.1, 0.05]}><boxGeometry args={[0.03, 0.03, 0.03]} /><meshStandardMaterial color="#3ecf8e" emissive="#3ecf8e" emissiveIntensity={0.4} /></mesh> : null}
    </group>
  );
}

function TableAndBucky() {
  const equipment = useSim((s) => s.equipment);
  const wall = equipment.placement === "upright-bucky" || equipment.placement === "standing" || equipment.placement === "seated";
  const onTable = equipment.placement === "table";
  const tilt = (equipment.buckyTilt * Math.PI) / 180;
  const th = equipment.tableHeight;
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow><planeGeometry args={[10, 10]} /><meshStandardMaterial color="#12161a" /></mesh>
      <gridHelper args={[10, 20, "#2a3338", "#1a2026"]} position={[0, 0.01, 0]} />
      {onTable ? <group position={[equipment.tableX, 0, equipment.tableZ]}>
        {([-0.28, 0.28] as const).map((x) => ([-0.9, 0.9] as const).map((z) => <mesh key={`leg-${x}-${z}`} position={[x, th * 0.5, z]}><boxGeometry args={[0.06, th, 0.06]} /><meshStandardMaterial color="#3a4148" metalness={0.5} roughness={0.4} /></mesh>))}
        <mesh position={[0, th, 0]} receiveShadow><boxGeometry args={[0.78, 0.05, 2.3]} /><meshStandardMaterial color="#6a5f58" roughness={0.85} /></mesh>
        <mesh position={[0, th - 0.04, 0]}><boxGeometry args={[0.76, 0.03, 2.27]} /><meshStandardMaterial color="#8b9096" metalness={0.3} roughness={0.45} /></mesh>
        <mesh position={[0, th - 0.14, 0]}><boxGeometry args={[0.48, 0.05, 0.52]} /><meshStandardMaterial color="#1a1e24" metalness={0.4} roughness={0.35} /></mesh>
        <mesh position={[0, th - 0.11, 0]}><boxGeometry args={[0.42, 0.015, 0.43]} /><meshStandardMaterial color="#0a0c10" roughness={0.9} /></mesh>
        <mesh position={[-0.35, th - 0.14, 0]}><boxGeometry args={[0.03, 0.04, 1.5]} /><meshStandardMaterial color="#4a5560" metalness={0.5} roughness={0.4} /></mesh>
        <mesh position={[0.35, th - 0.14, 0]}><boxGeometry args={[0.03, 0.04, 1.5]} /><meshStandardMaterial color="#4a5560" metalness={0.5} roughness={0.4} /></mesh>
      </group> : null}
      {wall ? <group position={[0, 0, -0.78]}>
        <mesh position={[0, 0.03, 0]}><boxGeometry args={[0.55, 0.06, 0.4]} /><meshStandardMaterial color="#2a3038" metalness={0.4} roughness={0.45} /></mesh>
        <mesh position={[0, 1.15, 0]}><boxGeometry args={[0.12, 2.3, 0.12]} /><meshStandardMaterial color="#3a4148" metalness={0.45} roughness={0.4} /></mesh>
        <mesh position={[0, 2.15, -0.08]}><boxGeometry args={[0.28, 0.35, 0.2]} /><meshStandardMaterial color="#2a3036" metalness={0.35} roughness={0.5} /></mesh>
        <group position={[0, equipment.buckyHeight, 0.1]} rotation={[tilt, 0, 0]}>
          <mesh><boxGeometry args={[0.55, 0.62, 0.08]} /><meshStandardMaterial color="#1c2228" metalness={0.3} roughness={0.4} /></mesh>
          <mesh position={[0, 0, 0.05]}><boxGeometry args={[0.43, 0.48, 0.02]} /><meshStandardMaterial color="#050608" roughness={0.95} /></mesh>
          <mesh position={[-0.3, 0, 0]}><boxGeometry args={[0.04, 0.5, 0.06]} /><meshStandardMaterial color="#4a5560" /></mesh>
          <mesh position={[0.3, 0, 0]}><boxGeometry args={[0.04, 0.5, 0.06]} /><meshStandardMaterial color="#4a5560" /></mesh>
        </group>
      </group> : null}
      <mesh position={[0, 1.6, 4]}><boxGeometry args={[8, 3.2, 0.08]} /><meshStandardMaterial color="#1a2026" /></mesh>
      <mesh position={[-3.8, 1.6, 0]}><boxGeometry args={[0.08, 3.2, 8]} /><meshStandardMaterial color="#161c22" /></mesh>
    </>
  );
}

export function XrayRoom() {
  return (
    <>
      <color attach="background" args={["#0a0c0e"]} />
      <hemisphereLight args={["#c8d0d4", "#1a1814", 0.55]} />
      <directionalLight position={[2.5, 4, 2]} intensity={1.15} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-2, 2, -1]} intensity={0.25} />
      <TableAndBucky />
      <PatientModel />
      <TubeHead />
      <LightField />
      <ContactShadows opacity={0.35} scale={8} blur={2.2} far={5} />
      <OrbitControls enablePan minPolarAngle={0.2} maxPolarAngle={Math.PI / 2.05} minDistance={1.2} maxDistance={6} target={[0, 0.9, 0]} />
    </>
  );
}
