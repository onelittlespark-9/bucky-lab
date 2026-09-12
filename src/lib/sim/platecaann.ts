import type { Patient, Projection, SimPose, TubeState, ExposureState, RadiographResult, PlatecaannItem, PlatecaannDecision } from "./types";

export interface PlatecaannAssessment {
  items: PlatecaannItem[];
  repeatRequired: boolean;
  furtherViewRecommended: boolean;
  diagnostic: boolean;
  score: number;
  summary: string;
}

function decision(ok: boolean | "concern", note: string): PlatecaannDecision {
  return ok === true ? "pass" : ok === "concern" ? "concern" : "fail";
}

function hasMeaningfulRotation(pose: SimPose, projection: Projection) {
  if (projection.anatomy.includes("lat")) return Math.abs(pose.rotationY) < 55;
  return Math.abs(pose.rotationY) > 12 || Math.abs(pose.oblique) > 8;
}

function expectedMarker(projection: Projection) {
  return projection.laterality === "left" ? "L" : projection.laterality === "right" ? "R" : null;
}

function exposureStatus(result: RadiographResult | null) {
  if (!result) return { contrast: false, density: false, sharpness: false };
  const m = result.metrics;
  return {
    contrast: m.contrast >= 0.35 && m.contrast <= 0.9,
    density: m.eiStatus === "optimal" || (m.eiStatus !== "under" && m.saturation < 0.08),
    sharpness: m.noise < 0.28,
  };
}

/**
 * Chest collimation needs a practical tolerance because the simulated light
 * field is deliberately harder to judge than a real collimator light field.
 * The important acceptance criterion is that the diagnostic anatomy remains
 * included: both apices, both costophrenic angles / just below the diaphragm,
 * and the lateral soft-tissue margins.
 *
 * We therefore tolerate a moderately tighter field (15% smaller than the
 * nominal target) and a moderately wider field (35% larger) for chest views.
 * A field outside that range is treated as a technical concern rather than an
 * automatic repeat unless the resulting anatomy is actually excluded.
 */
function chestCollimationAcceptable(tube: TubeState, projection: Projection) {
  const widthRatio = tube.collimationW / projection.collimationW;
  const heightRatio = tube.collimationH / projection.collimationH;
  return widthRatio >= 0.85 && widthRatio <= 1.35 && heightRatio >= 0.85 && heightRatio <= 1.35;
}

export function evaluatePLATECAANN(args: {
  patient: Patient;
  projection: Projection;
  pose: SimPose;
  tube: TubeState;
  exposure: ExposureState;
  result: RadiographResult | null;
  marker?: string | null;
  patientIdentifiersConfirmed?: boolean;
  artefactObscuresAnatomy?: boolean;
  abnormalityRecognised?: boolean;
}): PlatecaannAssessment {
  const { patient, projection, pose, tube, result } = args;
  const expected = expectedMarker(projection);
  const exp = exposureStatus(result);
  const rotation = hasMeaningfulRotation(pose, projection);
  const centringError = Math.abs(tube.crY - projection.cr.y * (patient.heightCm / 100)) > Math.max(3, patient.heightCm * 0.035) || Math.abs(tube.crX - projection.cr.x) > 4;
  const sidError = Math.abs(tube.sid - projection.sidCm) > 5;
  const isChest = projection.region === "Thorax" && projection.anatomy.includes("torso");
  const collimationAcceptable = isChest
    ? chestCollimationAcceptable(tube, projection)
    : tube.collimationW <= projection.collimationW * 1.18 && tube.collimationH <= projection.collimationH * 1.18;
  const collimationError = !collimationAcceptable;
  const angleError = Math.abs(tube.angle - projection.tubeAngle) > 3;
  const motion = exp.sharpness === false;
  const exposureFail = !exp.contrast || !exp.density || !exp.sharpness;

  const items: PlatecaannItem[] = [
    { key: "P", label: "Patient identification", decision: decision(args.patientIdentifiersConfirmed !== false, "Patient identifiers match the examination request."), note: "Confirm full name, date of birth and hospital/ID number before accepting the image." },
    { key: "L", label: "Label / marker", decision: decision(args.marker === undefined || args.marker === expected, "Marker is appropriate for this examination."), note: expected ? `Expected anatomical marker: ${expected}.` : "No laterality marker is required by the projection definition." },
    { key: "A-area", label: "Area of interest", decision: decision(result !== null, "The generated examination contains the requested anatomical region."), note: isChest ? "For an acceptable chest image, include both lung apices, both costophrenic angles with a small amount below the diaphragms, and the lateral soft-tissue margins." : "The final implementation should compare projected anatomy against the projection-specific inclusion criteria." },
    { key: "T", label: "Technique / positioning", decision: decision(!(rotation || centringError || angleError || sidError), rotation ? "Patient rotation/obliquity is likely to affect interpretation." : centringError ? "Centring is outside the acceptable tolerance." : angleError ? "Tube angulation differs materially from the projection requirement." : "Technique is within the current simulation tolerance."), note: `SID ${tube.sid.toFixed(0)} cm; tube angle ${tube.angle.toFixed(1)}°. ${motion ? "Sharpness also suggests motion." : ""}` },
    { key: "E-contrast", label: "Exposure — contrast", decision: decision(exp.contrast, "Contrast is within the current simulation target."), note: "Assess tissue differentiation and projection-specific anatomical contrast rather than image brightness alone." },
    { key: "E-density", label: "Exposure — density", decision: decision(exp.density, result ? `EI status: ${result.metrics.eiStatus}.` : "No exposure result available."), note: "Assess whether the anatomy is adequately demonstrated without treating display brightness as the sole exposure indicator." },
    { key: "E-sharpness", label: "Exposure — sharpness", decision: decision(exp.sharpness, motion ? "Reduced sharpness/noise is present; assess whether it compromises the clinical question." : "Anatomical detail is adequately sharp."), note: "Consider motion and geometric unsharpness, including SID/OID effects where relevant." },
    { key: "C", label: "Collimation", decision: decision(!collimationError, collimationError ? (isChest ? "The chest field is outside the practical tolerance and may exclude required anatomy." : "The simulated field is wider than the target region."), isChest ? "For chest, modest over- or under-collimation is tolerated when the apices, costophrenic angles / just below the diaphragm, and lateral soft-tissue borders remain included." : "Use the smallest field that includes all clinically required anatomy." },
    { key: "A-artifact", label: "Artefacts", decision: decision(!args.artefactObscuresAnatomy, args.artefactObscuresAnatomy ? "An artefact may obscure clinically relevant anatomy." : "No simulated obscuring artefact has been flagged."), note: "Check clothing, jewellery, equipment and medical devices before accepting the image." },
    { key: "A-abnormality", label: "Abnormality", decision: decision(args.abnormalityRecognised === undefined || args.abnormalityRecognised, args.abnormalityRecognised === false ? "A reference abnormality has not been recognised." : "Abnormality assessment recorded."), note: "Review the clinical indication and systematically assess the image for pathology, trauma, devices and unexpected findings." },
    { key: "N-repeat", label: "Need for repeat", decision: decision(!(rotation || centringError || angleError || exposureFail || motion || args.artefactObscuresAnatomy), "Do not repeat merely because the image is imperfect; repeat only when the defect is diagnostically significant."), note: "The repeat decision should be based on whether another exposure is likely to materially improve diagnostic information." },
    { key: "N-further", label: "Need for further views", decision: "concern", note: "Further-view decisions are clinical: an acceptable first image may still need an additional projection to answer the clinical question." },
  ];

  const failures = items.filter(i => i.decision === "fail").length;
  const concerns = items.filter(i => i.decision === "concern").length;
  const repeatRequired = rotation || centringError || angleError || exposureFail || motion || !!args.artefactObscuresAnatomy;
  const diagnostic = !repeatRequired;
  const score = Math.max(0, Math.round(((items.length - failures - concerns * 0.5) / items.length) * 100));

  return {
    items,
    repeatRequired,
    furtherViewRecommended: false,
    diagnostic,
    score,
    summary: repeatRequired ? "Repeat should be considered because one or more technical defects may compromise diagnostic information." : "Image is currently considered diagnostically acceptable by the simulation; decide whether further views are clinically justified.",
  };
}
