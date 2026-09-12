import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { projectionById } from "@/lib/sim/projections";
import type { V3 } from "@/lib/sim/patient-kinematics";

const NEGATIVE_Z = new THREE.Vector3(0, 0, -1);
const POSITIVE_Z = new THREE.Vector3(0, 0, 1);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const FIXED_FOCAL_SPOT_MM = 1.0;

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
  magnification: number;
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

function defaultDetector({ equipment, patientId, projectionId }: {
  equipment: ReturnType<typeof useSim.getState>["equipment"];
  patientId: string;
  projectionId: string;
}) {
  const projection = projectionById(projectionId);
  const wall = equipment.placement === "upright-bucky" || equipment.placement === "standing" || equipment.placement === "seated";
  return wall
    ? new THREE.Vector3(0, equipment.buckyHeight, -.68)
    : new THREE.Vector3(equipment.tableX, equipment.tableHeight + .08, tableTargetZ(projection.cr.y, patientId, equipment.tableZ, equipment.patientZ, projectionId));
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
  const detector = defaultDetector({ equipment, patientId, projectionId });
  const detectorQuaternion = new THREE.Quaternion().setFromUnitVectors(POSITIVE_Z, detectorNormal);
  const beamNormal = detectorNormal.clone().applyAxisAngle(X_AXIS, tube.angle * Math.PI / 180).normalize();
  const distance = Math.max(.8, tube.sid / 100);
  const defaultSource = detector.clone().addScaledVector(beamNormal, distance);
  const patient = patientById(patientId);
  const projection = projectionById(projectionId);
  const defaultCrX = projection.cr.x * (projection.anatomy.startsWith("torso") ? patient.morph.torsoWidth : 1);
  const defaultCrY = projection.cr.y;
  const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(detectorQuaternion);
  const localY = new THREE.Vector3(0, 1, 0).applyQuaternion(detectorQuaternion);
  const source = defaultSource.clone()
    .addScaledVector(localX, (tube.crX - defaultCrX) / 100)
    .addScaledVector(localY, (tube.crY - defaultCrY) / 100);
  const beamDirection = detector.clone().sub(source).normalize();
  const tubeQuaternion = new THREE.Quaternion().setFromUnitVectors(NEGATIVE_Z, beamDirection);
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
    magnification,
  };
}

function BeamCone({ pose, bright }: { pose: SourcePose; bright: boolean }) {
  const geometry = useMemo(() => {
    const hw = pose.fieldW / 2;
    const hh = pose.fieldH / 2;
    const d = pose.distance;
    const p = new Float32Array([
      -.012, -.012, 0, .012, -.012, 0, .012, .012, 0, -.012, .012, 0,
      -hw, -hh, -d, hw, -hh, -d, hw, hh, -d, -hw, hh, -d,
    ]);
    const i = [0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7, 4, 5, 6, 4, 6, 7];
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setIndex(i);
    g.computeVertexNormals();
    return g;
  }, [pose.distance, pose.fieldH, pose.fieldW]);

  return (
    <mesh geometry={geometry} position={pose.source} quaternion={pose.tubeQuaternion} renderOrder={20}>
      <meshBasicMaterial color={bright ? "#fff4a0" : "#ffe37a"} transparent opacity={bright ? .30 : .18} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

/**
 * A strong rectangular light field projected onto an intermediate patient-plane.
 * It deliberately sits between the tube and IR so the learner can see the
 * collimated area over the anatomy, not just as a rectangle on the detector.
 */
function PatientLightField({ pose, bright }: { pose: SourcePose; bright: boolean }) {
  const fraction = .68;
  const centre = useMemo(() => {
    const source = new THREE.Vector3(...pose.source);
    const direction = new THREE.Vector3(...pose.beamDirection);
    return source.addScaledVector(direction, pose.distance * fraction);
  }, [pose.source, pose.beamDirection, pose.distance]);

  const width = pose.fieldW * fraction;
  const height = pose.fieldH * fraction;

  return (
    <group position={centre} quaternion={pose.tubeQuaternion} renderOrder={25}>
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color="#fff36b" transparent opacity={bright ? .34 : .24} depthTest={false} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[new THREE.PlaneGeometry(width, height)]} />
        <lineBasicMaterial color="#fff6a3" transparent opacity={bright ? .98 : .90} depthTest={false} depthWrite={false} linewidth={2} />
      </lineSegments>
    </group>
  );
}

function Collimator({ pose }: { pose: SourcePose }) {
  const w = pose.fieldW / 2;
  const h = pose.fieldH / 2;
  const b = .018;
  return (
    <group position={pose.source} quaternion={pose.tubeQuaternion} renderOrder={21}>
      <mesh position={[0, h + b / 2, .055]}><boxGeometry args={[w * 2 + b * 2, b, .07]} /><meshStandardMaterial color="#20262b" metalness={.7} roughness={.28} /></mesh>
      <mesh position={[0, -h - b / 2, .055]}><boxGeometry args={[w * 2 + b * 2, b, .07]} /><meshStandardMaterial color="#20262b" metalness={.7} roughness={.28} /></mesh>
      <mesh position={[w + b / 2, 0, .055]}><boxGeometry args={[b, h * 2, .07]} /><meshStandardMaterial color="#20262b" metalness={.7} roughness={.28} /></mesh>
      <mesh position={[-w - b / 2, 0, .055]}><boxGeometry args={[b, h * 2, .07]} /><meshStandardMaterial color="#20262b" metalness={.7} roughness={.28} /></mesh>
      <mesh position={[0, 0, .015]}><boxGeometry args={[w * 2, h * 2, .025]} /><meshStandardMaterial color="#0d1115" metalness={.25} roughness={.5} /></mesh>
    </group>
  );
}

function TubeHousing({ pose, active }: { pose: SourcePose; active: boolean }) {
  return (
    <group position={pose.source} quaternion={pose.tubeQuaternion}>
      <mesh position={[0, 0, .15]} castShadow><boxGeometry args={[.22, .18, .30]} /><meshStandardMaterial color="#353d44" metalness={.55} roughness={.34} /></mesh>
      <mesh position={[0, 0, .34]}><cylinderGeometry args={[.075, .095, .13, 20]} /><meshStandardMaterial color="#151a1f" metalness={.72} roughness={.25} /></mesh>
      <mesh position={[0, 0, .005]}><sphereGeometry args={[.025, 16, 10]} /><meshStandardMaterial color={active ? "#fff5c2" : "#e2c35a"} emissive={active ? "#fff1a8" : "#000000"} emissiveIntensity={active ? 2 : 0} /></mesh>
      <mesh position={[0, .22, .16]}><boxGeometry args={[.045, .42, .045]} /><meshStandardMaterial color="#4a555f" metalness={.55} roughness={.35} /></mesh>
      {active && <pointLight color="#fff4cf" intensity={8} distance={2.4} decay={2} />}
    </group>
  );
}

function CollimationHandles({ pose, onChange, onBeamMove }: {
  pose: SourcePose;
  onChange: (w: number, h: number) => void;
  onBeamMove: (xCm: number, yCm: number) => void;
}) {
  const [dragging, setDragging] = useState<"field" | "beam" | null>(null);
  const detectorGroup = useRef<THREE.Group>(null);
  const localPoint = (e: any) => {
    const p = e.point.clone();
    detectorGroup.current?.worldToLocal(p);
    return p;
  };
  const beginField = (e: any) => {
    e.stopPropagation();
    setDragging("field");
    e.target?.setPointerCapture?.(e.pointerId);
  };
  const beginBeam = (e: any) => {
    e.stopPropagation();
    setDragging("beam");
    e.target?.setPointerCapture?.(e.pointerId);
  };
  const move = (e: any) => {
    if (!dragging) return;
    e.stopPropagation();
    const p = localPoint(e);
    if (dragging === "field") {
      // The field remains centred on the CR; dragging any corner directly
      // sets its half-width/half-height rather than accumulating deltas.
      onChange(Math.max(.05, Math.min(.45, Math.abs(p.x) * 2)), Math.max(.05, Math.min(.45, Math.abs(p.y) * 2)));
    } else {
      onBeamMove(p.x, p.y);
    }
  };
  const end = (e: any) => {
    e.stopPropagation();
    setDragging(null);
  };

  const hw = pose.fieldW / 2;
  const hh = pose.fieldH / 2;
  const handleSize = .045;
  const handles = [[hw, hh], [-hw, hh], [hw, -hh], [-hw, -hh]] as const;

  return (
    <group ref={detectorGroup} position={pose.detector} quaternion={pose.detectorQuaternion} renderOrder={30}>
      {handles.map((p, i) => (
        <mesh key={i} position={[p[0], p[1], .018]} onPointerDown={beginField} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerOver={e => { e.stopPropagation(); document.body.style.cursor = "nwse-resize"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
          <sphereGeometry args={[handleSize, 16, 10]} />
          <meshBasicMaterial color="#fff36b" transparent opacity={dragging === "field" ? .98 : .95} depthTest={false} depthWrite={false} />
        </mesh>
      ))}
      <mesh position={[0, 0, .025]} onPointerDown={beginBeam} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onPointerOver={e => { e.stopPropagation(); document.body.style.cursor = "move"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
        <circleGeometry args={[.09, 24]} />
        <meshBasicMaterial color="#fff36b" transparent opacity={.98} depthTest={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function XraySourceAssembly({ showTube = true }: { showTube?: boolean }) {
  const tube = useSim(s => s.tube);
  const equipment = useSim(s => s.equipment);
  const patientId = useSim(s => s.patientId);
  const projectionId = useSim(s => s.projectionId);
  const preparing = useSim(s => s.preparing);
  const exposing = useSim(s => s.exposing);
  const show = useSim(s => s.showLightField);
  const patchTube = useSim(s => s.patchTube);
  const pose = useMemo(() => buildSourcePose({ tube, equipment, patientId, projectionId }), [tube, equipment, patientId, projectionId]);
  const bright = preparing || exposing;
  const source = new THREE.Vector3(...pose.source);
  const detector = new THREE.Vector3(...pose.detector);
  const mid = source.clone().add(detector).multiplyScalar(.5);
  const projection = projectionById(projectionId);
  const patient = patientById(patientId);
  const defaultCrX = projection.cr.x * (projection.anatomy.startsWith("torso") ? patient.morph.torsoWidth : 1);

  const setField = (w: number, h: number) => patchTube({
    collimationW: Math.max(5, Math.min(45, w * 100 * pose.magnification)),
    collimationH: Math.max(5, Math.min(45, h * 100 * pose.magnification)),
  });

  const moveBeam = (x: number, y: number) => patchTube({
    crX: defaultCrX + x * 100,
    crY: projection.cr.y + y * 100,
  });

  return (
    <group>
      {showTube && <><TubeHousing pose={pose} active={bright} /><Collimator pose={pose} /></>}
      {show && <>
        <BeamCone pose={pose} bright={bright} />
        <PatientLightField pose={pose} bright={bright} />
        <CollimationHandles pose={pose} onChange={setField} onBeamMove={moveBeam} />
        <pointLight position={mid} color="#ffe08a" intensity={bright ? 2.1 : .55} distance={Math.max(1.2, pose.distance)} decay={2} />
      </>}
      {tube.lockedToDetector && showTube && <mesh position={pose.source} quaternion={pose.tubeQuaternion}>
        <sphereGeometry args={[.035, 12, 8]} />
        <meshBasicMaterial color="#3ecf8e" />
      </mesh>}
    </group>
  );
}

export { FIXED_FOCAL_SPOT_MM };
