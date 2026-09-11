import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { scaleLandmarkY, LANDMARKS } from "@/lib/sim/projections";
import { HumanAtlasBodyOverlay } from "./HumanAtlasBodyOverlay";

type V3 = [number, number, number];

function PatientLandmarks() {
  const patientId = useSim(s => s.patientId);
  const patient = patientById(patientId);
  const H = patient.heightCm / 100;
  const s = H / 1.7;
  const m = patient.morph;
  const showLandmarks = useSim(s => s.showLandmarks);
  const setLandmarkCR = useSim(s => s.setLandmarkCR);
  if (!showLandmarks) return null;

  const landmarks = LANDMARKS.filter(l => l.y > 0 && ![
    "3rd-mcp", "midcarpal", "elbow", "patella-apex",
    "medial-epicondyle-knee", "malleoli", "3rd-mt",
  ].includes(l.id));

  return (
    <group>
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
  );
}

export function PatientModel() {
  return <><HumanAtlasBodyOverlay /><PatientLandmarks /></>;
}
