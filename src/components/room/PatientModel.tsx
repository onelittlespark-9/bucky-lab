import { useMemo } from "react";
import * as THREE from "three";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { projectionById, scaleLandmarkY, LANDMARKS } from "@/lib/sim/projections";

function latheTorso(width: number, depth: number, length: number, abdomen: number) {
  const pts: THREE.Vector2[] = [];
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = t * length;
    let r = 0.12;
    if (t < 0.08) r = 0.07;
    else if (t < 0.18) r = 0.11 + width * 0.02;
    else if (t < 0.38) r = 0.16 * width;
    else if (t < 0.55) r = 0.15 * width;
    else if (t < 0.72) r = 0.14 * width * (0.7 + abdomen * 0.4);
    else r = 0.155 * width * (0.85 + abdomen * 0.2);
    pts.push(new THREE.Vector2(r, y));
  }
  const geo = new THREE.LatheGeometry(pts, 24);
  geo.scale(1, 1, depth / Math.max(0.5, width));
  geo.computeVertexNormals();
  return geo;
}

export function PatientModel() {
  const patientId = useSim((s) => s.patientId);
  const pose = useSim((s) => s.pose);
  const equipment = useSim((s) => s.equipment);
  const showLandmarks = useSim((s) => s.showLandmarks);
  const setLandmarkCR = useSim((s) => s.setLandmarkCR);
  const projectionId = useSim((s) => s.projectionId);
  const patient = patientById(patientId);
  const m = patient.morph;
  const h = patient.heightCm / 100;

  const torsoGeo = useMemo(
    () => latheTorso(m.torsoWidth, m.torsoDepth, 0.62 * m.torsoLength, m.abdomen),
    [m.abdomen, m.torsoDepth, m.torsoLength, m.torsoWidth],
  );
  const gownGeo = useMemo(
    () => latheTorso(m.torsoWidth * 1.08, m.torsoDepth * 1.1, 0.58 * m.torsoLength, m.abdomen * 1.05),
    [m.abdomen, m.torsoDepth, m.torsoLength, m.torsoWidth],
  );

  const skin = patient.skin;
  const yaw = (pose.rotationY * Math.PI) / 180;
  const place = equipment.placement;
  const wall = place === "upright-bucky" || place === "standing" || place === "seated";

  const ox = equipment.patientX;
  const oy = equipment.patientY;
  const oz = equipment.patientZ;
  const halfDepth = 0.08 * m.torsoDepth;

  let groupPos: [number, number, number];
  let groupRot: [number, number, number];
  if (wall) {
    const standY = place === "seated" ? 0.45 : 0.02;
    const standZ = place === "upright-bucky" ? -0.48 : -0.32;
    // Bucky face ~ -0.68; clamp so patient can touch IR but not pass through
    const z = Math.min(standZ + oz, -0.42);
    groupPos = [ox, standY + oy, z];
    groupRot = [0, yaw, 0];
  } else {
    const top = equipment.tableHeight + 0.06;
    groupPos = [equipment.tableX + ox, top + halfDepth + oy, equipment.tableZ + oz];
    groupRot = [-Math.PI / 2, 0, yaw];
  }

  const shoulder = 0.22 * m.shoulder;
  const limbR = 0.045 * m.limb;
  const armRaise = pose.armRaise * 1.5;
  const elbow = (pose.elbowFlex * Math.PI) / 180;
  const knee = (pose.kneeFlex * Math.PI) / 180;
  const hipInt = (pose.hipInternal * Math.PI) / 180;
  const chin = pose.chinUp * 0.35;
  const kyph = m.kyphosis * 0.35;

  const landmarks = LANDMARKS.filter(
    (l) =>
      l.y > 0 &&
      !["3rd-mcp", "midcarpal", "elbow", "patella-apex", "medial-epicondyle-knee", "malleoli", "3rd-mt"].includes(
        l.id,
      ),
  );

  return (
    <group position={groupPos} rotation={groupRot}>
      <group position={[0, 0, 0]} rotation={[kyph, 0, 0]}>
        <group position={[0, h * 0.48, 0]}>
          <mesh geometry={torsoGeo} castShadow>
            <meshPhysicalMaterial color={skin} roughness={0.55} metalness={0} sheen={0.3} sheenColor={skin} />
          </mesh>
          <mesh geometry={gownGeo} position={[0, -0.02, 0]}>
            <meshLambertMaterial color={patient.gown} transparent opacity={0.92} />
          </mesh>
          <group position={[0, 0.62 * m.torsoLength, kyph * 0.05]} rotation={[-chin * 0.3, 0, 0]}>
            <mesh position={[0, 0.05, 0]}>
              <cylinderGeometry args={[0.045, 0.055, 0.1, 16]} />
              <meshPhysicalMaterial color={skin} roughness={0.55} />
            </mesh>
            <group position={[0, 0.16, 0]} rotation={[-chin, 0, 0]}>
              <mesh>
                <sphereGeometry args={[0.095, 24, 18]} />
                <meshPhysicalMaterial color={skin} roughness={0.5} />
              </mesh>
              <mesh position={[0, 0.06, 0]} rotation={[0.2, 0, 0]}>
                <sphereGeometry args={[0.098, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
                <meshStandardMaterial color={patient.hair} />
              </mesh>
            </group>
          </group>
          {([-1, 1] as const).map((side) => (
            <group
              key={side}
              position={[side * shoulder, 0.5 * m.torsoLength, 0]}
              rotation={[0.15 - armRaise, 0, side * (0.15 + pose.shoulderRoll * 0.5)]}
            >
              <mesh position={[0, -0.14, 0]}>
                <capsuleGeometry args={[limbR, 0.22, 6, 12]} />
                <meshPhysicalMaterial color={skin} roughness={0.55} />
              </mesh>
              <group position={[0, -0.28, 0]} rotation={[elbow, 0, 0]}>
                <mesh position={[0, -0.12, 0]}>
                  <capsuleGeometry args={[limbR * 0.85, 0.2, 6, 12]} />
                  <meshPhysicalMaterial color={skin} roughness={0.55} />
                </mesh>
              </group>
            </group>
          ))}
        </group>
        {([-1, 1] as const).map((side) => (
          <group key={side} position={[side * 0.09 * m.hip, h * 0.48, 0]} rotation={[0, side * hipInt, side * 0.04]}>
            <mesh position={[0, -0.2, 0]}>
              <capsuleGeometry args={[limbR * 1.15, 0.32, 6, 12]} />
              <meshPhysicalMaterial color={skin} roughness={0.55} />
            </mesh>
            <group position={[0, -0.4, 0]} rotation={[knee, 0, 0]}>
              <mesh position={[0, -0.18, 0]}>
                <capsuleGeometry args={[limbR * 0.95, 0.3, 6, 12]} />
                <meshPhysicalMaterial color={skin} roughness={0.55} />
              </mesh>
            </group>
          </group>
        ))}
      </group>
      {showLandmarks
        ? landmarks.map((lm) => {
            const y = (1 - scaleLandmarkY(lm.y, patient.heightCm) / patient.heightCm) * h;
            const x = (lm.x / 100) * m.torsoWidth;
            return (
              <mesh
                key={lm.id}
                position={[x, y, 0.12 * m.torsoDepth]}
                onClick={(e) => {
                  e.stopPropagation();
                  setLandmarkCR(scaleLandmarkY(lm.y, patient.heightCm), lm.x * m.torsoWidth);
                }}
              >
                <sphereGeometry args={[0.012, 10, 8]} />
                <meshBasicMaterial color="#e2c35a" />
              </mesh>
            );
          })
        : null}
    </group>
  );
}
