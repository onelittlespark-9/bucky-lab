import { Html, OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import * as THREE from "three";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { projectionById } from "@/lib/sim/projections";
import { patientKinematics } from "@/lib/sim/patient-kinematics";
import { extremityPlacement } from "@/lib/sim/extremity-kinematics";

type FocusPoint = [number, number, number];
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function scenePoint(local: FocusPoint, patient: ReturnType<typeof patientById>, projection: ReturnType<typeof projectionById>, pose: ReturnType<typeof useSim.getState>["pose"], equipment: ReturnType<typeof useSim.getState>["equipment"]): THREE.Vector3 {
  const H = patient.heightCm / 100;
  const bodyThickness = Math.max(0.13 * (H / 1.7), 0.12 * patient.morph.torsoDepth * (H / 1.7) * 1.05);
  const kyphosis = patient.morph.kyphosis * 0.22;
  const oblique = pose.oblique * Math.PI / 180;
  const yaw = pose.rotationY * Math.PI / 180;
  const wall = equipment.placement !== "table";
  const projectionCode = projection.shortName.trim().toUpperCase().split(/[ .-]/)[0];
  const projectionYaw = wall && projectionCode === "PA" ? Math.PI : 0;
  let position: [number, number, number];
  let rotation: [number, number, number];
  if (wall) {
    const floorY = equipment.placement === "seated" ? 0.38 : 0;
    const requestedY = floorY + equipment.patientY;
    const floorLockedY = equipment.placement === "seated" ? requestedY : Math.max(floorY - (0.055 * H - 0.012 * (H / 1.7) - 0.045 * (H / 1.7)), requestedY);
    position = [equipment.patientX, floorLockedY, (equipment.placement === "upright-bucky" ? -0.48 : -0.32) + equipment.patientZ];
    rotation = [0, projectionYaw + yaw, 0];
  } else {
    const tableTop = equipment.tableHeight + 0.075;
    position = [equipment.tableX + equipment.patientX, tableTop + bodyThickness + equipment.patientY, equipment.tableZ + H * 0.5 + equipment.patientZ];
    rotation = [-Math.PI / 2, 0, yaw];
  }
  return new THREE.Vector3(...local)
    .applyEuler(new THREE.Euler(kyphosis, oblique, 0))
    .applyEuler(new THREE.Euler(...rotation))
    .add(new THREE.Vector3(...position));
}

function anatomyFocus(projection: ReturnType<typeof projectionById>, patient: ReturnType<typeof patientById>, pose: ReturnType<typeof useSim.getState>["pose"], equipment: ReturnType<typeof useSim.getState>["equipment"]): { target: FocusPoint; distance: number } {
  const H = patient.heightCm / 100;
  const scale = H / 1.7;
  const intent = extremityPlacement(projection.id, equipment.placement, equipment.buckyTilt);
  const kin = patientKinematics({ H, s: scale, shoulder: patient.morph.shoulder, hip: patient.morph.hip, limb: patient.morph.limb, elbowFlex: pose.elbowFlex, hipInternal: pose.hipInternal, armRaise: pose.armRaise, armSide: pose.armSide, shoulderRoll: pose.shoulderRoll, kneeFlex: pose.kneeFlex, projectionId: projection.id, placement: equipment.placement, buckyTilt: equipment.buckyTilt });

  if (intent.target === "hand" || intent.target === "wrist" || intent.target === "elbow" || intent.target === "shoulder") {
    const index = pose.armSide === "left" || intent.side === -1 ? 0 : pose.armSide === "right" || intent.side === 1 ? 1 : -1;
    const arms = index === -1 ? kin.arms : [kin.arms[index]];
    const points = arms.map(arm => intent.target === "hand" ? arm.hand : intent.target === "wrist" ? arm.wrist : intent.target === "elbow" ? arm.elbow : arm.shoulder);
    const target: FocusPoint = [points.reduce((sum, p) => sum + p[0], 0) / points.length, points.reduce((sum, p) => sum + p[1], 0) / points.length, points.reduce((sum, p) => sum + p[2], 0) / points.length];
    return { target, distance: intent.target === "shoulder" ? 0.95 : intent.target === "elbow" ? 0.85 : 0.72 };
  }
  if (intent.target === "knee" || intent.target === "ankle" || intent.target === "foot") {
    const side = intent.side === -1 ? 0 : intent.side === 1 ? 1 : 0;
    const leg = kin.legs[side];
    return { target: intent.target === "knee" ? leg.knee : intent.target === "ankle" ? leg.ankle : leg.foot, distance: intent.target === "knee" ? 0.9 : 0.72 };
  }
  if (intent.target === "hip") return { target: kin.legs[intent.side === 1 ? 1 : 0].hip, distance: 1.0 };
  if (projection.region === "Head & neck" || projection.anatomy.includes("skull")) return { target: [0, 1.62, 0], distance: 1.05 };
  if (projection.region === "Pelvis & hips") return { target: [0, 0.72, 0], distance: 1.25 };
  if (projection.region === "Spine") return { target: [0, 1.0, 0], distance: 1.3 };
  if (projection.region === "Abdomen") return { target: [0, 0.92, 0], distance: 1.3 };
  return { target: [0, H * 0.64, 0], distance: 1.3 };
}

function CameraFocus({ focusRef }: { focusRef: MutableRefObject<((target: FocusPoint, distance: number) => void) | null> }) {
  const { camera, controls } = useThree();
  focusRef.current = (target, distance) => {
    const c = controls as any;
    const t = new THREE.Vector3(...target);
    const direction = new THREE.Vector3().subVectors(camera.position, c?.target ?? t);
    if (direction.lengthSq() < 0.01) direction.set(0.35, 0.12, 1);
    direction.normalize();
    camera.position.copy(t).addScaledVector(direction, distance);
    if (c?.target) c.target.copy(t);
    c?.update?.();
  };
  return null;
}

export function RoomQuickControls() {
  const [open, setOpen] = useState(false);
  const tube = useSim(s => s.tube);
  const projectionId = useSim(s => s.projectionId);
  const patientId = useSim(s => s.patientId);
  const pose = useSim(s => s.pose);
  const equipment = useSim(s => s.equipment);
  const showLightField = useSim(s => s.showLightField);
  const setShowLightField = useSim(s => s.setShowLightField);
  const patchTube = useSim(s => s.patchTube);
  const projection = projectionById(projectionId);
  const patient = patientById(patientId);
  const focusRef = useRef<((target: FocusPoint, distance: number) => void) | null>(null);

  const focus = () => {
    const f = anatomyFocus(projection, patient, pose, equipment);
    const target = scenePoint(f.target, patient, projection, pose, equipment);
    focusRef.current?.([target.x, target.y, target.z], f.distance);
  };
  useEffect(() => {
    const frame = window.requestAnimationFrame(focus);
    return () => window.cancelAnimationFrame(frame);
  }, [projectionId, patientId, equipment.placement]);

  const focusBeam = () => {
    const target = scenePoint([tube.crX / 100, clamp(tube.crY / 100, 0.25, 1.8), 0], patient, projection, pose, equipment);
    focusRef.current?.([target.x, target.y, target.z], 1.0);
  };
  const nudge = (dx: number, dy: number) => patchTube({ crX: clamp(tube.crX + dx, -20, 20), crY: clamp(tube.crY + dy, 0, patient.heightCm) });
  const setField = (factor: number) => patchTube({ collimationW: clamp(projection.collimationW * factor, 5, 45), collimationH: clamp(projection.collimationH * factor, 5, 45) });

  return <>
    <OrbitControls makeDefault enablePan minPolarAngle={0.2} maxPolarAngle={Math.PI / 2.05} minDistance={0.5} maxDistance={6} target={[0, 0.9, 0]} />
    <CameraFocus focusRef={focusRef} />
    <Html position={[-1.55, 2.05, 0]} transform={false} style={{ pointerEvents: "auto" }}>
      {!open ? <button type="button" onClick={() => setOpen(true)} style={toggleStyle} aria-label="Open quick positioning controls">⚙ Quick positioning</button> : <div style={panelStyle}>
        <div style={headerStyle}><strong style={{ fontSize: 12 }}>QUICK POSITIONING</strong><button type="button" onClick={() => setOpen(false)} style={minimiseStyle}>Minimise</button></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <button onClick={focus} style={buttonStyle}>Focus exam</button>
          <button onClick={focusBeam} style={buttonStyle}>Focus CR</button>
          <button onClick={() => patchTube({ crX: projection.cr.x * (projection.anatomy.startsWith("torso") ? patient.morph.torsoWidth : 1), crY: projection.cr.y })} style={buttonStyle}>Centre CR</button>
          <button onClick={() => patchTube({ sid: projection.sidCm })} style={buttonStyle}>Standard SID</button>
        </div>
        <div style={sectionStyle}>CR NUDGE</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5 }}><span/><button onClick={() => nudge(0,1)} style={buttonStyle}>▲</button><span/><button onClick={() => nudge(-1,0)} style={buttonStyle}>◀</button><button onClick={() => nudge(0,-1)} style={buttonStyle}>●</button><button onClick={() => nudge(1,0)} style={buttonStyle}>▶</button></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5, marginTop: 5 }}><button onClick={() => nudge(-5,0)} style={buttonStyle}>−5 X</button><button onClick={() => nudge(0,-5)} style={buttonStyle}>−5 Y</button><button onClick={() => nudge(5,0)} style={buttonStyle}>+5 X</button></div>
        <div style={sectionStyle}>COLLIMATION</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5 }}><button onClick={() => setField(.72)} style={buttonStyle}>Tight</button><button onClick={() => setField(1)} style={buttonStyle}>Standard</button><button onClick={() => setField(1.2)} style={buttonStyle}>Wide</button></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginTop: 5 }}><button onClick={() => patchTube({ collimationW: clamp(tube.collimationW - .5, 5, 45), collimationH: clamp(tube.collimationH - .5, 5, 45) })} style={buttonStyle}>Field −</button><button onClick={() => patchTube({ collimationW: clamp(tube.collimationW + .5, 5, 45), collimationH: clamp(tube.collimationH + .5, 5, 45) })} style={buttonStyle}>Field +</button></div>
        <div style={sectionStyle}>LIGHT FIELD</div>
        <button onClick={() => setShowLightField(!showLightField)} style={{ ...buttonStyle, width: "100%", background: showLightField ? "rgba(255,235,130,.2)" : "rgba(255,255,255,.06)", borderColor: showLightField ? "rgba(255,235,130,.6)" : "rgba(255,255,255,.12)" }}>{showLightField ? "● PRIMARY BEAM LIGHT FIELD ON" : "○ LIGHT FIELD OFF"}</button>
        <p style={{ margin: "7px 0 0", lineHeight: 1.35, opacity: .58 }}>Optional positioning aids. The exam opens focused on the requested anatomy. Turn the light field on, then drag the yellow handles to collimate.</p>
      </div>}
    </Html>
  </>;
}

const toggleStyle: CSSProperties = { background: "rgba(8,12,15,.88)", color: "white", border: "1px solid rgba(255,255,255,.16)", borderRadius: 9, padding: "7px 10px", fontSize: 11, cursor: "pointer", boxShadow: "0 8px 20px rgba(0,0,0,.25)" };
const minimiseStyle: CSSProperties = { ...buttonStyle, padding: "4px 7px", fontSize: 9 };
const panelStyle: CSSProperties = { width: 230, background: "rgba(8,12,15,.92)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, padding: 10, color: "white", fontFamily: "system-ui", fontSize: 11, boxShadow: "0 10px 30px rgba(0,0,0,.35)" };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 };
const buttonStyle: CSSProperties = { background: "rgba(255,255,255,.07)", color: "white", border: "1px solid rgba(255,255,255,.12)", borderRadius: 7, padding: "6px 5px", fontSize: 10, cursor: "pointer" };
const sectionStyle: CSSProperties = { fontSize: 9, letterSpacing: ".12em", opacity: .55, margin: "10px 0 5px" };
