import type { CriterionScore, ExposureMetrics, ExposureState, Grade, Patient, Projection, SimPose, TubeState } from "./types";
import { partThickness } from "./exposure";
import { scaleLandmarkY } from "./projections";
import { projectionGeometry } from "./projection-physics";

function gradeFromError(err: number, excellent: number, acceptable: number): Grade { if (err <= excellent) return "excellent"; if (err <= acceptable) return "acceptable"; return "repeat"; }

function requiredAnatomyRange(projection: Projection, patient: Patient): { top: number; bottom: number; halfWidth: number } {
  const scale = patient.heightCm / 170;
  const a = projection.anatomy;
  if (projection.id === "pa-chest" || projection.id === "lat-chest") return { top: 10 * scale, bottom: 57 * scale, halfWidth: 17 * patient.morph.torsoWidth };
  if (projection.id.includes("abdomen")) return { top: 42 * scale, bottom: 87 * scale, halfWidth: 17 * patient.morph.torsoWidth };
  if (projection.id.includes("pelvis") || projection.id.includes("hip")) return { top: 61 * scale, bottom: 99 * scale, halfWidth: 18 * patient.morph.torsoWidth };
  if (projection.id.includes("lumbar")) return { top: 43 * scale, bottom: 91 * scale, halfWidth: 11 * patient.morph.torsoWidth };
  if (a.includes("cspine")) return { top: 11 * scale, bottom: 31 * scale, halfWidth: 9 * patient.morph.torsoWidth };
  if (a === "skull-lat") return { top: 0, bottom: 22 * scale, halfWidth: 12 };
  if (a === "shoulder-ap") return { top: 22 * scale, bottom: 45 * scale, halfWidth: 15 * patient.morph.shoulder };
  const cy = scaleLandmarkY(projection.cr.y, patient.heightCm);
  return { top: Math.max(0, cy - 10), bottom: cy + 10, halfWidth: 10 };
}

function fieldCoverage(projection: Projection, patient: Patient, tube: TubeState, pose: SimPose) {
  const geometry = projectionGeometry(projection, tube, pose);
  const halfH = (tube.collimationH / geometry.magnification) / 2;
  const halfW = (tube.collimationW / geometry.magnification) / 2;
  const range = requiredAnatomyRange(projection, patient);
  const top = tube.crY - halfH;
  const bottom = tube.crY + halfH;
  const overlap = Math.max(0, Math.min(bottom, range.bottom) - Math.max(top, range.top));
  const needed = Math.max(0.01, range.bottom - range.top);
  return { vertical: Math.min(1, overlap / needed), horizontal: Math.min(1, halfW / Math.max(1, range.halfWidth)), top, bottom, range, centreError: Math.abs(tube.crY - (range.top + range.bottom) / 2) };
}

export function scoreExposure(args: { patient: Patient; projection: Projection; pose: SimPose; tube: TubeState; exposure: ExposureState; metrics: ExposureMetrics }): CriterionScore[] {
  const { patient, projection, pose, tube, exposure, metrics } = args;
  const scores: CriterionScore[] = [];
  const targetY = scaleLandmarkY(projection.cr.y, patient.heightCm);
  const targetX = projection.cr.x * (projection.anatomy === "torso-ap" || projection.anatomy === "torso-lat" ? patient.morph.torsoWidth : 1);
  const dy = Math.abs(tube.crY - targetY), dx = Math.abs(tube.crX - targetX), dist = Math.hypot(dx, dy);
  scores.push({ id: "centring", label: "Centring", weight: 1.25, grade: gradeFromError(dist, 1.6, 3.5), detail: dist < 1.6 ? `CR within ${dist.toFixed(1)} cm of ${projection.centring}` : `CR is ${dist.toFixed(1)} cm from the handbook point (${projection.centring})` });

  const coverage = fieldCoverage(projection, patient, tube, pose);
  const anatomyGrade: Grade = coverage.vertical >= 0.96 && coverage.horizontal >= 0.95 ? "excellent" : coverage.vertical >= 0.82 && coverage.horizontal >= 0.85 ? "acceptable" : "repeat";
  let anatomyDetail = `The exposed field covers ${Math.round(coverage.vertical * 100)}% of the required anatomy.`;
  if (coverage.vertical < 0.82) {
    const missingTop = Math.max(0, coverage.range.top - coverage.top), missingBottom = Math.max(0, coverage.bottom - coverage.range.bottom);
    anatomyDetail += missingTop > missingBottom ? " Superior anatomy is clipped — the field is too low." : missingBottom > missingTop ? " Inferior anatomy is clipped — the field is too high." : " Required anatomy is clipped by the field.";
  } else if (coverage.centreError > 5) anatomyDetail += " The field is visibly displaced from the anatomical region of interest.";
  scores.push({ id: "anatomy-coverage", label: "Anatomy included", weight: 1.5, grade: anatomyGrade, detail: anatomyDetail });

  const area = tube.collimationW * tube.collimationH, targetA = projection.collimationW * projection.collimationH, ratio = area / targetA;
  const clipped = coverage.vertical < 0.96 || coverage.horizontal < 0.95 || tube.collimationW < projection.collimationW * 0.72 || tube.collimationH < projection.collimationH * 0.72;
  let colGrade: Grade = "excellent", colDetail = `Field ${tube.collimationW.toFixed(0)}×${tube.collimationH.toFixed(0)} cm at the IR.`;
  if (clipped) { colGrade = anatomyGrade === "repeat" ? "repeat" : "acceptable"; colDetail = "Field size/position does not fully demonstrate the required anatomy."; }
  else if (ratio > 1.85) { colGrade = "repeat"; colDetail = "Under-collimated. Excess scatter and unjustified dose."; }
  else if (ratio > 1.35) { colGrade = "acceptable"; colDetail = "Field larger than the handbook collimation. Tighten the shutters."; }
  else if (ratio < 0.8) { colGrade = "acceptable"; colDetail = "Tight field — confirm the area of interest is fully included."; }
  scores.push({ id: "collimation", label: "Collimation", weight: 1.3, grade: colGrade, detail: colDetail });

  const sidErr = Math.abs(tube.sid - projection.sidCm);
  scores.push({ id: "sid", label: "FFD / SID", weight: 0.7, grade: gradeFromError(sidErr, 8, 20), detail: `${tube.sid.toFixed(0)} cm (handbook ${projection.sidCm} cm)` });
  const angErr = Math.abs(tube.angle - projection.tubeAngle);
  scores.push({ id: "angle", label: "Tube angle", weight: 0.8, grade: gradeFromError(angErr, 3, 8), detail: projection.tubeAngle === 0 ? `Beam ${tube.angle.toFixed(0)}° (should be perpendicular)` : `${tube.angle.toFixed(0)}° vs handbook ${projection.tubeAngle}° cranial` });

  const geometry = projectionGeometry(projection, tube, pose);
  const magGrade = geometry.magnification <= 1.04 ? "excellent" : geometry.magnification <= 1.08 ? "acceptable" : "repeat";
  scores.push({ id: "magnification", label: "Magnification / OID", weight: 0.9, grade: magGrade, detail: `OID ${geometry.oidCm.toFixed(1)} cm; SOD ${geometry.sodCm.toFixed(1)} cm; magnification ${geometry.magnification.toFixed(3)}×. Keep anatomy close to the IR when accurate size matters.` });

  const blurGrade = geometry.geometricUnsharpnessMm <= 0.05 ? "excellent" : geometry.geometricUnsharpnessMm <= 0.12 ? "acceptable" : "repeat";
  scores.push({ id: "geometric-unsharpness", label: "Geometric sharpness", weight: 0.7, grade: blurGrade, detail: `Estimated geometric unsharpness ${geometry.geometricUnsharpnessMm.toFixed(2)} mm using the fixed 1.0 mm focal spot.` });

  const projectionError = geometry.projectedOffsetCm;
  const beamProjectionGrade = projectionError <= 0.5 ? "excellent" : projectionError <= 1.5 ? "acceptable" : "repeat";
  scores.push({ id: "projection-geometry", label: "Beam geometry", weight: 0.8, grade: beamProjectionGrade, detail: projectionError <= 0.5 ? "Central ray is close to perpendicular to the anatomy/IR relationship." : `Angulation and/or patient orientation produces an estimated ${projectionError.toFixed(1)} cm projected offset. Expect shape distortion.` });

  const rot = Math.abs(pose.rotationY), needLateral = projection.anatomy.includes("lat");
  let rotGrade: Grade = "excellent", rotDetail = `Rotation ${pose.rotationY.toFixed(0)}°.`;
  if (needLateral) { const err = Math.abs(Math.abs(pose.rotationY) - 90); rotGrade = gradeFromError(err, 8, 18); rotDetail = `Patient at ${pose.rotationY.toFixed(0)}° (true lateral is ±90°).`; }
  else if (rot > 12) { rotGrade = "repeat"; rotDetail = "Rotation will produce asymmetric anatomy."; }
  else if (rot > 5) { rotGrade = "acceptable"; rotDetail = "Mild rotation — check symmetry of paired structures."; }
  scores.push({ id: "rotation", label: "Rotation / projection", weight: 1.1, grade: rotGrade, detail: rotDetail });

  if (projection.id === "pa-chest") {
    const sc = pose.shoulderRoll >= 0.7 ? "excellent" : pose.shoulderRoll >= 0.4 ? "acceptable" : "repeat";
    scores.push({ id: "scapulae", label: "Shoulder roll", weight: 0.8, grade: sc, detail: pose.shoulderRoll >= 0.7 ? "Scapulae rolled clear of the lungs." : "Roll the shoulders forward so the scapulae leave the lung fields." });
    const br = pose.breath === "inspiration" ? "excellent" : "repeat";
    scores.push({ id: "breath", label: "Respiration", weight: 0.7, grade: br, detail: pose.breath === "inspiration" ? "Arrested full inspiration." : "Chest radiographs are taken on arrested inspiration." });
  }
  if (projection.id === "ap-pelvis" || projection.id === "ap-hip") { const hip = pose.hipInternal >= 12 ? "excellent" : pose.hipInternal >= 5 ? "acceptable" : "repeat"; scores.push({ id: "feet", label: "Internal rotation of hips", weight: 0.8, grade: hip, detail: pose.hipInternal >= 12 ? "Femoral necks parallel to the IR." : "Internally rotate both feet 15–20° so the necks are not foreshortened." }); }
  if (projection.id === "lat-knee") { const kf = Math.abs(pose.kneeFlex - 25); scores.push({ id: "flex", label: "Knee flexion", weight: 0.6, grade: gradeFromError(kf, 8, 18), detail: `Flexed ${pose.kneeFlex.toFixed(0)}° (handbook 20–30°).` }); }

  const ei = metrics.ei;
  let eiGrade: Grade = metrics.eiStatus === "optimal" ? "excellent" : "repeat";
  if (metrics.eiStatus === "over" && ei < 420) eiGrade = "acceptable";
  if (metrics.eiStatus === "under" && ei > 140) eiGrade = "acceptable";
  const t = partThickness(patient, projection);
  scores.push({ id: "exposure", label: "Exposure / EI", weight: 1.5, grade: eiGrade, detail: metrics.eiStatus === "under" ? `Underexposed (EI ${ei.toFixed(0)}). Quantum mottle will hide trabeculae. ${patient.name} is ${t.toFixed(0)} cm through the part — raise mAs or kVp.` : metrics.eiStatus === "over" ? `Overexposed (EI ${ei.toFixed(0)}). Detector signal is excessive and dose is unjustified. Reduce mAs.` : `EI ${ei.toFixed(0)} — within the target window. Contrast and noise are balanced.` });
  if (!exposure.grid && projection.grid) scores.push({ id: "grid", label: "Grid", weight: 0.9, grade: t > 12 ? "repeat" : "acceptable", detail: "Handbook asks for a grid. Scatter will flatten contrast on a thick part." });
  else if (exposure.grid && !projection.grid) scores.push({ id: "grid", label: "Grid", weight: 0.5, grade: "acceptable", detail: "Grid on a thin part. You will need more mAs and may underexpose." });
  scores.push({ id: "marker", label: "Laterality marker", weight: 0.6, grade: exposure.marker ? "excellent" : "repeat", detail: exposure.marker ? `${exposure.marker} marker present.` : "No laterality marker — a legal identification fail." });
  const recumbOk = (projection.recumbency === "erect" && pose.recumbency === "erect") || (projection.recumbency === "supine" && pose.recumbency === "supine") || projection.setup === "tabletop";
  if (!recumbOk) scores.push({ id: "erect", label: "Erect vs recumbent", weight: 1, grade: "repeat", detail: `Handbook position is ${projection.recumbency}.` });
  return scores;
}
