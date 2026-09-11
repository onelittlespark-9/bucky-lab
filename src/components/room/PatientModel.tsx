import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { scaleLandmarkY, LANDMARKS } from "@/lib/sim/projections";
import { HumanAtlasBodyOverlay } from "./HumanAtlasBodyOverlay";

export function PatientModel() {
  const patientId = useSim(s => s.patientId);
  const showLandmarks = useSim(s => s.showLandmarks);
  const setLandmarkCR = useSim(s => s.setLandmarkCR);
  const patient = patientById(patientId);
  const H = patient.heightCm / 100;

  const landmarks = LANDMARKS.filter(l =>
    l.y > 0 &&
    ![
      "3rd-mcp",
      "midcarpal",
      "elbow",
      "patella-apex",
      "medial-epicondyle-knee",
      "malleoli",
      "3rd-mt",
    ].includes(l.id),
  );

  return (
    <>
      <HumanAtlasBodyOverlay />
      {showLandmarks && landmarks.map(lm => {
        const yy = H - scaleLandmarkY(lm.y, patient.heightCm) / 100;
        const xx = lm.x / 100 * patient.morph.torsoWidth;
        return (
          <mesh
            key={lm.id}
            position={[xx, yy, patient.morph.torsoDepth + 0.01]}
            onClick={event => {
              event.stopPropagation();
              setLandmarkCR(scaleLandmarkY(lm.y, patient.heightCm), lm.x * patient.morph.torsoWidth);
            }}
          >
            <sphereGeometry args={[0.012 * H / 1.7, 10, 8]} />
            <meshBasicMaterial color="#e2c35a" />
          </mesh>
        );
      })}
    </>
  );
}
