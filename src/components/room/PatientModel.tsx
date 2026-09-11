import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { scaleLandmarkY, LANDMARKS } from "@/lib/sim/projections";
import { HumanAtlasBodyOverlay } from "./HumanAtlasBodyOverlay";

type V3 = [number, number, number];

function PatientLandmarks() {
  const patientId = useSim(s => s.patientId);
  const pose = useSim(s => s.pose);
  const equipment = useSim(s => s.equipment);
  const showLandmarks = useSim(s => s.showLandmarks);
  const setLandmarkCR = useSim(s => s.setLandmarkCR);
  const patient = patientById(patientId);
  const H = patient.heightCm / 100;
  const s = H / 1.7;
  const m = patient.morph;
  const bodyThickness = Math.max(.13 * s, .12 * m.torsoDepth * s * 1.05);
  const footRadiusY = .045 * s;
  const footSole = .055 * H - .012 * s - footRadiusY;
  const yaw = pose.rotationY * Math.PI / 180;
  const wall = equipment.placement !== "table";
  let groupPos: V3;
  let groupRot: V3;

  if (wall) {
    const floorY = equipment.placement === "seated" ? .38 : 0;
    const requestedY = floorY + equipment.patientY;
    const floorLockedY = equipment.placement === "seated" ? requestedY : Math.max(floorY - footSole, requestedY);
    groupPos = [equipment.patientX, floorLockedY, (equipment.placement === "upright-bucky" ? -.48 : -.32) + equipment.patientZ];
    groupRot = [0, yaw, 0];
  } else {
    const tableTop = equipment.tableHeight + .075;
    groupPos = [equipment.tableX + equipment.patientX, tableTop + bodyThickness + equipment.patientY, equipment.tableZ + H * .5 + equipment.patientZ];
    groupRot = [-Math.PI / 2, 0, yaw];
  }

  if (!showLandmarks) return null;

  const landmarks = LANDMARKS.filter(l => l.y > 0 && ![
    "3rd-mcp", "midcarpal", "elbow", "patella-apex",
    "medial-epicondyle-knee", "malleoli", "3rd-mt",
  ].includes(l.id));

  return (
    <group position={groupPos} rotation={groupRot}>
      <group scale={s}>
        {landmarks.map(lm => {
          const yy = 1.7 - scaleLandmarkY(lm.y, patient.heightCm) / 100 / s;
          const xx = lm.x / 100 * m.torsoWidth;
          return (
            <mesh
              key={lm.id}
              position={[xx, yy, m.torsoDepth + .01]}
              onClick={event => {
                event.stopPropagation();
                setLandmarkCR(scaleLandmarkY(lm.y, patient.heightCm), lm.x * m.torsoWidth);
              }}
            >
              <sphereGeometry args={[.012, 10, 8]} />
              <meshBasicMaterial color="#e2c35a" />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

export function PatientModel() {
  return (
    <>
      <HumanAtlasBodyOverlay />
      <PatientLandmarks />
    </>
  );
}
