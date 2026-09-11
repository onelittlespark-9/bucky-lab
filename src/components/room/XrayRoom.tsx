import { ContactShadows, OrbitControls, Html } from "@react-three/drei";
import { useSim } from "@/lib/sim/store";
import { PatientModel } from "./PatientModel";
import { InternalAnatomy } from "./InternalAnatomy";
import { DetailedSkeletalOverlay } from "./DetailedSkeletalOverlay";
import { PatientRig } from "./PatientRig";
import { XraySourceAssembly } from "./XraySourceAssembly";
import type { AnatomyLayer } from "@/lib/sim/muscle-segmentation";

function TableAndBucky() {
  const equipment = useSim(s => s.equipment);
  const wall = equipment.placement === "upright-bucky" || equipment.placement === "standing" || equipment.placement === "seated";
  const onTable = equipment.placement === "table";
  const tilt = equipment.buckyTilt * Math.PI / 180;
  const th = equipment.tableHeight;
  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow><planeGeometry args={[10, 10]} /><meshStandardMaterial color="#12161a" /></mesh>
    <gridHelper args={[10, 20, "#2a3338", "#1a2026"]} position={[0, .01, 0]} />
    {onTable && <group position={[equipment.tableX, 0, equipment.tableZ]}>
      {([-0.28, .28] as const).map(x => ([-.9, .9] as const).map(z => <mesh key={`leg-${x}-${z}`} position={[x, th * .5, z]}><boxGeometry args={[.06, th, .06]} /><meshStandardMaterial color="#3a4148" metalness={.5} roughness={.4} /></mesh>))}
      <mesh position={[0, th, 0]} receiveShadow><boxGeometry args={[.78, .05, 2.3]} /><meshStandardMaterial color="#6a5f58" roughness={.85} /></mesh>
      <mesh position={[0, th - .04, 0]}><boxGeometry args={[.76, .03, 2.27]} /><meshStandardMaterial color="#8b9096" metalness={.3} roughness={.45} /></mesh>
    </group>}
    {wall && <group position={[0, 0, -.78]}>
      <mesh position={[0, 1.15, 0]}><boxGeometry args={[.12, 2.3, .12]} /><meshStandardMaterial color="#3a4148" metalness={.45} roughness={.4} /></mesh>
      <group position={[0, equipment.buckyHeight, .1]} rotation={[tilt, 0, 0]}><mesh><boxGeometry args={[.55, .62, .08]} /><meshStandardMaterial color="#1c2228" metalness={.3} roughness={.4} /></mesh><mesh position={[0, 0, .05]}><boxGeometry args={[.43, .48, .02]} /><meshStandardMaterial color="#050608" roughness={.95} /></mesh></group>
    </group>}
    <mesh position={[0, 1.6, 4]}><boxGeometry args={[8, 3.2, .08]} /><meshStandardMaterial color="#1a2026" /></mesh>
    <mesh position={[-3.8, 1.6, 0]}><boxGeometry args={[.08, 3.2, 8]} /><meshStandardMaterial color="#161c22" /></mesh>
  </>;
}

function AnatomyControls() {
  const visibility = useSim(s => s.anatomyVisibility);
  const setLayer = useSim(s => s.setAnatomyLayer);
  const labels: [AnatomyLayer, string][] = [["skin", "Skin"], ["fat", "Fat"], ["muscle", "Muscle"], ["organs", "Organs"], ["skeleton", "Skeleton"]];
  return <Html position={[1.25, 1.8, 0]} transform={false} style={{ pointerEvents: "auto" }}><div style={{ background: "rgba(10,14,18,.9)", padding: 12, borderRadius: 10, color: "white", fontFamily: "system-ui", fontSize: 12, width: 150 }}><strong>ANATOMY LAYERS</strong>{labels.map(([id, label]) => <label key={id} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 7, cursor: "pointer" }}><input type="checkbox" checked={visibility[id]} onChange={e => setLayer(id, e.target.checked)} />{label}</label>)}</div></Html>;
}

export function XrayRoom() {
  return <>
    <color attach="background" args={["#0a0c0e"]} />
    <hemisphereLight args={["#c8d0d4", "#1a1814", .55]} />
    <directionalLight position={[2.5, 4, 2]} intensity={1.15} castShadow shadow-mapSize={[1024, 1024]} />
    <directionalLight position={[-2, 2, -1]} intensity={.25} />
    <TableAndBucky />
    <PatientRig>
      <PatientModel />
      <InternalAnatomy />
      <DetailedSkeletalOverlay />
    </PatientRig>
    <AnatomyControls />
    <XraySourceAssembly />
    <ContactShadows opacity={.35} scale={8} blur={2.2} far={5} />
    <OrbitControls enablePan minPolarAngle={.2} maxPolarAngle={Math.PI / 2.05} minDistance={1.2} maxDistance={6} target={[0, .9, 0]} />
  </>;
}
