import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useSim } from "@/lib/sim/store";
import { projectionById } from "@/lib/sim/projections";
import { PatientModel } from "./PatientModel";

function LightField() {
  const tube = useSim((s) => s.tube);
  const show = useSim((s) => s.showLightField);
  const projectionId = useSim((s) => s.projectionId);
  const exposing = useSim((s) => s.exposing);
  const preparing = useSim((s) => s.preparing);
  const projection = projectionById(projectionId);
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, 256, 256);
    g.strokeStyle = "rgba(226,195,90,0.95)";
    g.lineWidth = 4;
    g.strokeRect(18, 18, 220, 220);
    g.beginPath();
    g.moveTo(128, 28);
    g.lineTo(128, 228);
    g.moveTo(28, 128);
    g.lineTo(228, 128);
    g.stroke();
    g.fillStyle = "rgba(226,195,90,0.12)";
    g.fillRect(18, 18, 220, 220);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }, []);

  const mag = tube.sid / Math.max(80, tube.sid - 14);
  const w = (tube.collimationW / 100) / mag;
  const hgt = (tube.collimationH / 100) / mag;
  const erect = projection.recumbency === "erect" && projection.setup === "wall";
  const crY = tube.crY / 100;
  const patientH = 1.7;
  const y = erect ? patientH - crY : 0.95;
  const z = erect ? -0.42 : 0;
  const x = tube.crX / 100;
  const rot: [number, number, number] = erect ? [0, 0, 0] : [-Math.PI / 2, 0, 0];
  const pos: [number, number, number] = erect ? [x, y, z] : [x, y, -(crY - 0.85)];
  const intensity = preparing || exposing ? 1 : 0.65;

  if (!show) return null;
  return (
    <mesh position={pos} rotation={rot} renderOrder={2}>
      <planeGeometry args={[w, hgt]} />
      <meshBasicMaterial
        map={tex}
        transparent
        opacity={intensity}
        depthWrite={false}
        side={THREE.DoubleSide}
        color={exposing ? "#fff6d2" : "#e2c35a"}
      />
    </mesh>
  );
}

function TubeHead() {
  const tube = useSim((s) => s.tube);
  const projectionId = useSim((s) => s.projectionId);
  const preparing = useSim((s) => s.preparing);
  const exposing = useSim((s) => s.exposing);
  const spin = useRef(0);
  const anode = useRef<THREE.Mesh>(null);
  const projection = projectionById(projectionId);
  const erect = projection.recumbency === "erect" && projection.setup === "wall";

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1);
    if (preparing || exposing) spin.current += d * 18;
    if (anode.current) anode.current.rotation.z = spin.current;
  });

  const sidM = tube.sid / 100;
  const crY = tube.crY / 100;
  const x = tube.crX / 100;
  const angle = (tube.angle * Math.PI) / 180;

  let pos: [number, number, number];
  let rot: [number, number, number];
  if (erect) {
    const y = 1.7 - crY;
    pos = [x, y, -0.55 + sidM];
    rot = [0, Math.PI, -angle];
  } else {
    pos = [x, 0.95 + sidM, -(crY - 0.85)];
    rot = [Math.PI / 2 - angle, 0, 0];
  }

  return (
    <group position={pos} rotation={rot}>
      <mesh position={[0, 0, 0.12]}>
        <boxGeometry args={[0.22, 0.16, 0.28]} />
        <meshStandardMaterial color="#3a4148" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, -0.08]} ref={anode}>
        <cylinderGeometry args={[0.07, 0.09, 0.12, 16]} />
        <meshStandardMaterial color="#1c2228" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, -0.18]}>
        <boxGeometry args={[0.18, 0.14, 0.08]} />
        <meshStandardMaterial color="#2a3036" />
      </mesh>
      {(preparing || exposing) && (
        <pointLight color={exposing ? "#fff7e0" : "#e2c35a"} intensity={exposing ? 8 : 2.4} distance={3} />
      )}
      <mesh position={[0, 0.28, 0.1]}>
        <boxGeometry args={[0.04, 0.4, 0.04]} />
        <meshStandardMaterial color="#4a5560" />
      </mesh>
    </group>
  );
}

function TableAndBucky() {
  const projectionId = useSim((s) => s.projectionId);
  const projection = projectionById(projectionId);
  const wall = projection.setup === "wall";
  const tabletop = projection.setup === "tabletop";

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color="#12161a" />
      </mesh>
      <gridHelper args={[8, 16, "#2a3338", "#1a2026"]} position={[0, 0.01, 0]} />

      {!wall ? (
        <group>
          <mesh position={[0, 0.45, 0]} receiveShadow>
            <boxGeometry args={[0.72, 0.08, 2.2]} />
            <meshStandardMaterial color="#8b9096" metalness={0.2} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.9, 0]} receiveShadow>
            <boxGeometry args={[0.7, 0.06, 2.18]} />
            <meshStandardMaterial color="#6a5f58" roughness={0.8} />
          </mesh>
          {[-0.9, 0.9].map((z) =>
            [-0.28, 0.28].map((x) => (
              <mesh key={`${x}-${z}`} position={[x, 0.45, z]}>
                <cylinderGeometry args={[0.03, 0.03, 0.9, 10]} />
                <meshStandardMaterial color="#3a4148" metalness={0.5} roughness={0.4} />
              </mesh>
            )),
          )}
          <mesh position={[0, 0.82, 0]}>
            <boxGeometry args={[0.5, 0.04, 0.43]} />
            <meshStandardMaterial color="#1a1e22" />
          </mesh>
          {tabletop ? (
            <mesh position={[0.28, 0.96, 0.35]} rotation={[-0.05, 0, 0]}>
              <boxGeometry args={[0.24, 0.012, 0.3]} />
              <meshStandardMaterial color="#2a3038" />
            </mesh>
          ) : null}
        </group>
      ) : (
        <group position={[0, 0, -0.72]}>
          <mesh position={[0, 1.05, 0]}>
            <boxGeometry args={[0.08, 2.1, 0.08]} />
            <meshStandardMaterial color="#3a4148" metalness={0.4} roughness={0.4} />
          </mesh>
          <mesh position={[0, 1.1, 0.06]}>
            <boxGeometry args={[0.43, 0.52, 0.04]} />
            <meshStandardMaterial color="#1a1e22" />
          </mesh>
          <mesh position={[0, 1.1, 0.09]}>
            <boxGeometry args={[0.35, 0.43, 0.01]} />
            <meshStandardMaterial color="#0d1013" />
          </mesh>
        </group>
      )}

      <mesh position={[0, 1.6, 3.4]}>
        <boxGeometry args={[6, 3.2, 0.08]} />
        <meshStandardMaterial color="#1a2026" />
      </mesh>
      <mesh position={[-3.2, 1.6, 0]}>
        <boxGeometry args={[0.08, 3.2, 6]} />
        <meshStandardMaterial color="#161c22" />
      </mesh>
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
      <OrbitControls
        enablePan
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.05}
        minDistance={1.2}
        maxDistance={6}
        target={[0, 0.9, 0]}
      />
    </>
  );
}
