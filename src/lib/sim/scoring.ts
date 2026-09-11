import type {
  CriterionScore,
  ExposureMetrics,
  ExposureState,
  Grade,
  Patient,
  Projection,
  SimPose,
  TubeState,
} from "./types";
import { partThickness } from "./exposure";
import { scaleLandmarkY } from "./projections";

function gradeFromError(err: number, excellent: number, acceptable: number): Grade {
  if (err <= excellent) return "excellent";
  if (err <= acceptable) return "acceptable";
  return "repeat";
}

export function scoreExposure(args: {
  patient: Patient;
  projection: Projection;
  pose: SimPose;
  tube: TubeState;
  exposure: ExposureState;
  metrics: ExposureMetrics;
}): CriterionScore[] {
  const { patient, projection, pose, tube, exposure, metrics } = args;
  const scores: CriterionScore[] = [];

  const targetY = scaleLandmarkY(projection.cr.y, patient.heightCm);
  const targetX = projection.cr.x * patient.morph.torsoWidth;
  const isLocal = !["torso-ap", "torso-lat", "cspine-lat", "shoulder-ap"].includes(projection.anatomy);
  const dy = isLocal ? Math.abs(tube.crY - projection.cr.y) * 0.25 : Math.abs(tube.crY - targetY);
  const dx = isLocal ? Math.abs(tube.crX) : Math.abs(tube.crX - targetX);
  const dist = Math.hypot(dx, dy);
  scores.push({
    id: "centring",
    label: "Centring",
    weight: 1.4,
    grade: gradeFromError(dist, 1.6, 3.5),
    detail:
      dist < 1.6
        ? `CR within ${dist.toFixed(1)} cm of ${projection.centring}`
        : `CR is ${dist.toFixed(1)} cm from the handbook point (${projection.centring})`,
  });

  const area = tube.collimationW * tube.collimationH;
  const targetA = projection.collimationW * projection.collimationH;
  const ratio = area / targetA;
  const clipped = tube.collimationW < projection.collimationW * 0.72 || tube.collimationH < projection.collimationH * 0.72;
  let colGrade: Grade = "excellent";
  let colDetail = `Field ${tube.collimationW.toFixed(0)}×${tube.collimationH.toFixed(0)} cm at the IR.`;
  if (clipped) {
    colGrade = "repeat";
    colDetail = "Shutters too tight — required anatomy is likely clipped.";
  } else if (ratio > 1.85) {
    colGrade = "repeat";
    colDetail = "Under-collimated. Excess scatter and unjustified dose.";
  } else if (ratio > 1.35) {
    colGrade = "acceptable";
    colDetail = "Field larger than the handbook collimation. Tighten the shutters.";
  } else if (ratio < 0.8) {
    colGrade = "acceptable";
    colDetail = "Tight field — confirm the area of interest is fully included.";
  }
  scores.push({ id: "collimation", label: "Collimation", weight: 1.3, grade: colGrade, detail: colDetail });

  const sidErr = Math.abs(tube.sid - projection.sidCm);
  scores.push({
    id: "sid",
    label: "FFD / SID",
    weight: 0.7,
    grade: gradeFromError(sidErr, 8, 20),
    detail: `${tube.sid.toFixed(0)} cm (handbook ${projection.sidCm} cm)`,
  });

  const angErr = Math.abs(tube.angle - projection.tubeAngle);
  scores.push({
    id: "angle",
    label: "Tube angle",
    weight: 0.8,
    grade: gradeFromError(angErr, 3, 8),
    detail:
      projection.tubeAngle === 0
        ? `Beam ${tube.angle.toFixed(0)}° (should be perpendicular)`
        : `${tube.angle.toFixed(0)}° vs handbook ${projection.tubeAngle}° cranial`,
  });

  const rot = Math.abs(pose.rotationY);
  const needLateral = projection.anatomy.includes("lat");
  let rotGrade: Grade = "excellent";
  let rotDetail = `Rotation ${pose.rotationY.toFixed(0)}°.`;
  if (needLateral) {
    const err = Math.abs(Math.abs(pose.rotationY) - 90);
    rotGrade = gradeFromError(err, 8, 18);
    rotDetail = `Patient at ${pose.rotationY.toFixed(0)}° (true lateral is ±90°).`;
  } else if (rot > 12) {
    rotGrade = "repeat";
    rotDetail = "Rotation will produce asymmetric anatomy (SC joints / iliac wings).";
  } else if (rot > 5) {
    rotGrade = "acceptable";
    rotDetail = "Mild rotation — check symmetry of paired structures.";
  }
  scores.push({ id: "rotation", label: "Rotation / projection", weight: 1.1, grade: rotGrade, detail: rotDetail });

  if (projection.id === "pa-chest") {
    const sc = pose.shoulderRoll >= 0.7 ? "excellent" : pose.shoulderRoll >= 0.4 ? "acceptable" : "repeat";
    scores.push({
      id: "scapulae",
      label: "Shoulder roll",
      weight: 0.8,
      grade: sc,
      detail:
        pose.shoulderRoll >= 0.7
          ? "Scapulae rolled clear of the lungs."
          : "Roll the shoulders forward so the scapulae leave the lung fields.",
    });
    const br =
      pose.breath === "inspiration" ? "excellent" : "repeat";
    scores.push({
      id: "breath",
      label: "Respiration",
      weight: 0.7,
      grade: br,
      detail:
        pose.breath === "inspiration"
          ? "Arrested full inspiration."
          : "Chest radiographs are taken on arrested inspiration — the diaphragm is too high.",
    });
  }

  if (projection.id === "ap-pelvis" || projection.id === "ap-hip") {
    const hip = pose.hipInternal >= 12 ? "excellent" : pose.hipInternal >= 5 ? "acceptable" : "repeat";
    scores.push({
      id: "feet",
      label: "Internal rotation of hips",
      weight: 0.8,
      grade: hip,
      detail:
        pose.hipInternal >= 12
          ? "Femoral necks parallel to the IR."
          : "Internally rotate both feet 15–20° so the necks are not foreshortened.",
    });
  }

  if (projection.id === "lat-knee") {
    const kf = Math.abs(pose.kneeFlex - 25);
    scores.push({
      id: "flex",
      label: "Knee flexion",
      weight: 0.6,
      grade: gradeFromError(kf, 8, 18),
      detail: `Flexed ${pose.kneeFlex.toFixed(0)}° (handbook 20–30°).`,
    });
  }

  const ei = metrics.ei;
  let eiGrade: Grade = metrics.eiStatus === "optimal" ? "excellent" : metrics.eiStatus === "under" ? "repeat" : "repeat";
  if (metrics.eiStatus === "over" && ei < 420) eiGrade = "acceptable";
  if (metrics.eiStatus === "under" && ei > 140) eiGrade = "acceptable";
  const t = partThickness(patient, projection);
  scores.push({
    id: "exposure",
    label: "Exposure / EI",
    weight: 1.5,
    grade: eiGrade,
    detail:
      metrics.eiStatus === "under"
        ? `Underexposed (EI ${ei.toFixed(0)}). Quantum mottle will hide trabeculae. ${patient.name} is ${t.toFixed(0)} cm through the part — raise mAs or kVp.`
        : metrics.eiStatus === "over"
          ? `Overexposed (EI ${ei.toFixed(0)}). Detector saturation burns air spaces and inflates dose. Reduce mAs.`
          : `EI ${ei.toFixed(0)} — within the target window. Contrast and noise are balanced.`,
  });

  if (!exposure.grid && projection.grid) {
    scores.push({
      id: "grid",
      label: "Grid",
      weight: 0.9,
      grade: t > 12 ? "repeat" : "acceptable",
      detail: "Handbook asks for a grid. Scatter will flatten contrast on a thick part.",
    });
  } else if (exposure.grid && !projection.grid) {
    scores.push({
      id: "grid",
      label: "Grid",
      weight: 0.5,
      grade: "acceptable",
      detail: "Grid on a thin part. You will need more mAs and may underexpose.",
    });
  }

  scores.push({
    id: "marker",
    label: "Laterality marker",
    weight: 0.6,
    grade: exposure.marker ? "excellent" : "repeat",
    detail: exposure.marker ? `${exposure.marker} marker present.` : "No laterality marker — a legal identification fail.",
  });

  const recumbOk =
    (projection.recumbency === "erect" && pose.recumbency === "erect") ||
    (projection.recumbency === "supine" && pose.recumbency === "supine") ||
    projection.setup === "tabletop";
  if (!recumbOk) {
    scores.push({
      id: "erect",
      label: "Erect vs recumbent",
      weight: 1,
      grade: "repeat",
      detail: `Handbook position is ${projection.recumbency}.`,
    });
  }

  return scores;
}
