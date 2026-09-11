import { useMemo } from "react";
import * as THREE from "three";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { projectionById } from "@/lib/sim/projections";
import type { V3 } from "@/lib/sim/patient-kinematics";

const NEGATIVE_Z = new THREE.Vector3(0, 0, -1);
const POSITIVE_Z = new THREE.Vector3(0, 0, 1);
const X_AXIS = new THREE.Vector3(1, 0, 0);

type SourcePose = {
  source: V3;
  detector: V3;
  detectorNormal: V3;
  beamDirection: V3;
  fieldW: number;
  fieldH: number;
  distance: number;
  tubeQuaternion: THREE.Quaternion;
  detectorQuaternion: THREE.Quaternion;
};

function tableTargetZ(tubeCrY: number, patientId: string, tableZ: number, patientZ: number, projectionId: string) {
  const patient = patientById(patientId);
  const projection = projectionById(projectionId);
  const h = patient.heightCm / 100;
  let localY: number;
  switch (projection.anatomy) {
    case "foot-dp": localY = .04 * h; break;
    case "ankle-ap": localY = .1 * h; break;
    case "knee-ap":
    case "knee-lat": localY = .23 * h; break;
    case "hand-pa":
    case "wrist-pa": localY = .4 * h; break;
    case "elbow-ap": localY = .57 * h; break;
    case "shoulder-ap": localY = .73 * h; break;
    case "skull-lat": localY = .91 * h; break;
    default: localY = (1 - tubeCrY / patient.heightCm) * h;
  }
  return tableZ + patientZ + h * .5 - localY;
}

function buildSourcePose({ tube, equipment, patientId, projectionId }: {
  tube: ReturnType<typeof useSim.getState>["tube"];
  equipment: ReturnType<typeof useSim.getState>["equipment"];
  patientId: string;
  projectionId: string;
}): SourcePose {
  const wall = equipment.placement === "upright-bucky" || equipment.placement === "standing" || equipment.placement === "seated";
  const tilt = equipment.buckyTilt * Math.PI / 180;
  const detectorNormal = wall
    ? new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt)).normalize()
    : new THREE.Vector3(0, 1, 0);
  const detector = wall
    ? new THREE.Vector3(tube.crX / 100, equipment.buckyHeight, -.68)
    : new THREE.Vector3(
        equipment.tableX + tube.crX / 100,
        equipment.tableHeight + .08,
        tableTargetZ(tube.crY, patientId, equipment.tableZ, equipment.patientZ, projectionId),
      );

  // The tube angle changes the central ray around the detector's transverse axis.
  // The source therefore moves with the angle instead of leaving the beam detached
  // from the physical tube head.
  const beamNormal = detectorNormal.clone().applyAxisAngle(X_AXIS, tube.angle * Math.PI / 180).normalize();
  const distance = Math.max(.8, tube.sid / 100);
  const source = detector.clone().addScaledVector(beamNormal, distance);
  const beamDirection = detector.clone().sub(source).normalize();
  const tubeQuaternion = new THREE.Quaternion().setFromUnitVectors(NEGATIVE_Z, beamDirection);
  const detectorQuaternion = new THREE.Quaternion().setFromUnitVectors(POSITIVE_Z, detectorNormal);
  const magnification = tube.sid / Math.max(80, tube.sid - 14);

  return {
    source: [source.x, source.y, source.z],
    detector: [detector.x, detector.y, detector.z],
    detectorNormal: [detectorNormal.x, detectorNormal.y, detectorNormal.z],
    beamDirection: [beamDirection.x, beamDirection.y, beamDirection.z],
    fieldW: tube.collimationW / 100 / magnification,
    fieldH: tube.collimationH / 100 / magnification,
    distance,
    tubeQuaternion,
    detectorQuaternion,
  };
}

function BeamCone({ pose, bright }: { pose: SourcePose; bright: boolean }) {
  const geometry = useMemo(() => {
    const hw = pose.fieldW / 2;
    const hh = pose.fieldH / 2;
    const depth = pose.distance;
    const positions = new Float32Array([
      -.012, -.012, 0, .012, -.012, 0, .012, .012, 0, -.012, .012, 0,
      -hw, -hh, -depth, hw, -hh, -depth, hw, hh, -depth, -hw, hh, -depth,
    ]);
    const indices = [0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7, 4,5,6, 4,6,7];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }, [pose.distance, pose.fieldH, pose.fieldW]);

  return <mesh geometry={geometry} position={pose.source} quaternion={pose.tubeQuaternion} renderOrder={1}>
    <meshBasicMaterial color={bright ? "#fff4a0" : "#e2c35a"} transparent opacity={bright ? .22 : .08} depthWrite={false} side={THREE.DoubleSide} />
  </mesh>;
}

function Collimator({ pose }: { pose: SourcePose }) {
  const halfW = pose.fieldW / 2;
  const halfH = pose.fieldH / 2;
  const blade = .018;
  return <group position={pose.source} quaternion={pose.tubeQuaternion} renderOrder={6}>
    <mesh position={[0, halfH + blade / 2, .055]}><boxGeometry args={[halfW * 2 + blade * 2, blade, .07]} /><meshStandardMaterial color="#20262b" metalness={.7} roughness={.28} /></mesh>
    <mesh position={[0, -halfH - blade / 2, .055]}><boxGeometry args={[halfW * 2 + blade * 2, blade, .07]} /><meshStandardMaterial color="#20262b" metalness={.7} roughness={.28} /></mesh>
    <mesh position={[halfW + blade / 2, 0, .055]}><boxGeometry args={[blade, halfH * 2, .07]} /><meshStandardMaterial color="#20262b" metalness={.7} roughness={.28} /></mesh>
    <mesh position={[-halfW - blade / 2, 0, .055]}><boxGeometry args={[blade, halfH * 2, .07]} /><meshStandardMaterial color="#20262b" metalness={.7} roughness={.28} /></mesh>
    <mesh position={[0, 0, .015]}><boxGeometry args={[halfW * 2, halfH * 2, .025]} /><meshStandardMaterial color="#0d1115" metalness={.25} roughness={.5} /></mesh>
  </group>;
}

function TubeHousing({ pose, active }: { pose: SourcePose; active: boolean }) {
  return <group position={pose.source} quaternion={pose.tubeQuaternion}>
    <mesh position={[0, 0, .15]} castShadow><boxGeometry args={[.22, .18, .30]} /><meshStandardMaterial color="#353d44" metalness={.55} roughness={.34} /></mesh>
    <mesh position={[0, 0, .34]}><cylinderGeometry args={[.075, .095, .13, 20]} /><meshStandardMaterial color="#151a1f" metalness={.72} roughness={.25} /></mesh>
    <mesh position={[0, 0, .005]}><sphereGeometry args={[.025, 16, 10]} /><meshStandardMaterial color={active ? "#fff5c2" : "#e2c35a"} emissive={active ? "#fff1a8" : "#000000"} emissiveIntensity={active ? 2 : 0} /></mesh>
    <mesh position={[0, .22, .16]}><boxGeometry args={[.045, .42, .045]} /><meshStandardMaterial color="#4a555f" metalness={.55} roughness={.35} /></mesh>
    {active && <pointLight color="#fff4cf" intensity={8} distance={2.4} decay={2} />}
  </group>;
}

export function XraySourceAssembly() {
  const tube = useSim(s => s.tube);
  const equipment = useSim(s => s.equipment);
  const patientId = useSim(s => s.patientId);
  const projectionId = useSim(s => s.projectionId);
  const preparing = useSim(s => s.preparing);
  const exposing = useSim(s => s.exposing);
  const show = useSim(s => s.showLightField);
  const pose = useMemo(() => buildSourcePose({ tube, equipment, patientId, projectionId }), [tube, equipment, patientId, projectionId]);
  const bright = preparing || exposing;
  const source = new THREE.Vector3(...pose.source);
  const detector = new THREE.Vector3(...pose.detector);
  const mid = source.clone().add(detector).multiplyScalar(.5);

  return <group>
    <TubeHousing pose={pose} active={bright} />
    {show && <>
      <BeamCone pose={pose} bright={bright} />
      <Collimator pose={pose} />
      <mesh position={pose.detector} quaternion={pose.detectorQuaternion} renderOrder={3}>
        <planeGeometry args={[pose.fieldW, pose.fieldH]} />
        <meshBasicMaterial color={bright ? "#fff3a0" : "#e6d06d"} transparent opacity={bright ? .38 : .16} depthWrite={false} side={THREE.DoubleSide} wireframe />
      </mesh>
      <pointLight position={mid} color="#ffe08a" intensity={bright ? 2.1 : .45} distance={Math.max(1.2, pose.distance)} decay={2} />
    </>}
    {tube.lockedToDetector && <mesh position={pose.source} quaternion={pose.tubeQuaternion}>
      <sphereGeometry args={[.035, 12, 8]} />
      <meshBasicMaterial color="#3ecf8e" />
    </mesh>}
  </group>;
}
