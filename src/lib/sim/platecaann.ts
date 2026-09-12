import type { Patient, Projection, SimPose, TubeState, ExposureState, RadiographResult, PlatecaannItem, PlatecaannDecision } from "./types";

export interface PlatecaannAssessment {
  items: PlatecaannItem[];
  repeatRequired: boolean;
  furtherViewRecommended: boolean;
  diagnostic: boolean;
  score: number;
  summary: string;
}

function decision(ok: boolean | "concern"): PlatecaannDecision {
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

function contrastFeedback(result: RadiographResult | null, projection: Projection) {
  if (!result) return "No exposed image is available to assess contrast.";
  const c = result.metrics.contrast;
  if (c < 0.35) return "Contrast is too low: structures are compressed into similar grey shades, reducing separation between tissues and making bone/soft-tissue boundaries less distinct.";
  if (c > 0.9) return "Contrast is too high: the image is dominated by very black and very white areas with reduced useful grey-scale differentiation in soft tissue.";
  if (c < 0.45) return `Contrast is acceptable but relatively low for ${projection.shortName}: bone should remain clearly whiter than surrounding soft tissue while useful soft-tissue grey shades are retained.`;
  if (c > 0.78) return `Contrast is relatively high for ${projection.shortName}: bone should appear distinctly white, air dark/black where present, with enough intermediate grey tones to demonstrate soft tissue.`;
  return `Contrast is good: there is clear separation between radiopaque bone, intermediate grey soft tissue and dark air-containing regions where present, without excessive loss of grey-scale information.`;
}

function densityFeedback(result: RadiographResult | null, projection: Projection) {
  if (!result) return "No exposed image is available to assess density.";
  const { eiStatus, saturation } = result.metrics;
  if (eiStatus === "under") return `Density is too low for ${projection.shortName}: insufficient receptor exposure produces excessive quantum noise and fine anatomical detail is harder to demonstrate.`;
  if (eiStatus === "over" || saturation >= 0.08) return `Density is excessive for ${projection.shortName}: receptor exposure is higher than necessary and some areas may lose useful detail through saturation.`;
  if (projection.region === "Upper limb" || projection.region === "Lower limb" || projection.region === "Spine") return "Density is good: the bony anatomy is adequately penetrated, with the trabecular pattern and cortical margins clearly demonstrated without excessive saturation.";
  if (projection.region === "Thorax") return "Density is good: the lungs are adequately penetrated while mediastinal and bony detail remains visible, without excessive saturation or loss of anatomical information.";
  return "Density is good: the required anatomy is adequately penetrated and useful anatomical detail remains visible without excessive saturation.";
}

function sharpnessFeedback(result: RadiographResult | null, projection: Projection) {
  if (!result) return "No exposed image is available to assess sharpness.";
  const n = result.metrics.noise;
  if (n >= 0.28) return `Sharpness is poor on ${projection.shortName}: fine anatomical edges are degraded and the image contains enough noise/blur to potentially obscure clinically relevant detail.`;
  if (n >= 0.18) return `Sharpness is acceptable but not optimal on ${projection.shortName}: fine cortical edges and soft-tissue interfaces are visible, although some detail is less clean than an ideal exposure.`;
  return `Sharpness is good: cortical edges and fine anatomical detail are sharp and clean, with no significant simulated movement blur.`;
}

function areaFeedback(projection: Projection, tube: TubeState, isChest: boolean) {
  const widthRatio = tube.collimationW / Math.max(1, projection.collimationW);
  const heightRatio = tube.collimationH / Math.max(1, projection.collimationH);
  if (isChest && widthRatio >= 0.85 && widthRatio <= 1.35 && heightRatio >= 0.85 && heightRatio <= 1.35) return "Area of interest is acceptable: the simulated field is consistent with including the required chest anatomy, including the lung apices, costophrenic angles/just below the diaphragms and lateral soft-tissue margins.";
  if (!isChest && widthRatio <= 1.18 && heightRatio <= 1.18) return "Area of interest is acceptable: the simulated field is within the projection's required anatomical coverage.";
  return "Area of interest is inadequate or inefficient: review the image for excluded anatomy and ensure the required region is completely demonstrated without unnecessary anatomy.";
}

function techniqueFeedback(projection: Projection, tube: TubeState, patient: Patient, rotation: boolean, centringError: boolean, angleError: boolean, sidError: boolean) {
  if (rotation) return "Technique/positioning is not acceptable: rotation or obliquity is visible through the simulated asymmetry/superimposition of the anatomy.";
  if (centringError) return "Technique/positioning needs correction: the anatomy is not centred to the intended projection/CR.";
  if (angleError) return `Technique/positioning needs correction: the tube angle is ${tube.angle.toFixed(1)}° rather than the required ${projection.tubeAngle.toFixed(1)}°. This changes projection geometry and superimposition.`;
  if (sidError) return `Technique/positioning needs correction: SID is ${tube.sid.toFixed(0)} cm rather than the selected ${projection.sidCm.toFixed(0)} cm, affecting magnification and geometric sharpness.`;
  return `Technique/positioning is good: the ${projection.shortName} projection is appropriately positioned and centred for this patient (${patient.heightCm.toFixed(0)} cm), with no significant simulated rotation, centring or tube-angle error.`;
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
  const widthRatio = tube.collimationW / Math.max(1, projection.collimationW);
  const heightRatio = tube.collimationH / Math.max(1, projection.collimationH);
  const collimationAcceptable = isChest ? widthRatio >= 0.85 && widthRatio <= 1.35 && heightRatio >= 0.85 && heightRatio <= 1.35 : widthRatio <= 1.18 && heightRatio <= 1.18;
  const collimationError = !collimationAcceptable;
  const angleError = Math.abs(tube.angle - projection.tubeAngle) > 3;
  const motion = exp.sharpness === false;
  const exposureFail = !exp.contrast || !exp.density || !exp.sharpness;

  const items: PlatecaannItem[] = [
    { key: "P", label: "Patient identification", decision: decision(args.patientIdentifiersConfirmed !== false), note: args.patientIdentifiersConfirmed === false ? "Patient identifiers do not match the examination request." : "Patient identification is a pre-exposure safety check; confirm full name, DOB and hospital/ID number against the request." },
    { key: "L", label: "Label / marker", decision: decision(args.marker === undefined || args.marker === expected), note: expected ? `Marker ${args.marker === expected ? "is correct" : "is incorrect"} for this projection; expected anatomical marker: ${expected}.` : "No laterality marker is required by this projection." },
    { key: "A-area", label: "Area of interest", decision: decision(!collimationError), note: areaFeedback(projection, tube, isChest) },
    { key: "T", label: "Technique / positioning", decision: decision(!(rotation || centringError || angleError || sidError)), note: techniqueFeedback(projection, tube, patient, rotation, centringError, angleError, sidError) },
    { key: "E-contrast", label: "Exposure — contrast", decision: decision(exp.contrast), note: contrastFeedback(result, projection) },
    { key: "E-density", label: "Exposure — density", decision: decision(exp.density), note: densityFeedback(result, projection) },
    { key: "E-sharpness", label: "Exposure — sharpness", decision: decision(exp.sharpness), note: sharpnessFeedback(result, projection) },
    { key: "C", label: "Collimation", decision: decision(!collimationError), note: collimationError ? (isChest ? "The collimation is outside the practical chest tolerance; check the actual image to ensure the apices, costophrenic angles/just below the diaphragms and lateral soft-tissue margins remain included." : "The field is outside the required collimation tolerance; reduce unnecessary irradiated anatomy while retaining all required anatomy.") : (isChest ? "Collimation is acceptable: modest over- or under-collimation is tolerated provided the required chest anatomy remains included." : "Collimation is appropriate for the required anatomy, limiting unnecessary exposure and scatter.") },
    { key: "A-artifact", label: "Artefacts", decision: decision(!args.artefactObscuresAnatomy), note: args.artefactObscuresAnatomy ? "An artefact is visible/simulated over clinically relevant anatomy and may mimic or obscure pathology." : "No obscuring artefact is flagged; the image should remain free of clothing, jewellery or external objects that could mimic or obscure pathology." },
    { key: "A-abnormality", label: "Abnormality", decision: decision(args.abnormalityRecognised === undefined || args.abnormalityRecognised), note: args.abnormalityRecognised === false ? "The simulated/reference abnormality has not been recognised on the image." : "Review the actual radiograph systematically for pathology, trauma, devices and post-operative appearances; this item should be based on what is visibly demonstrated, not simply the case label." },
    { key: "N-repeat", label: "Need for repeat", decision: decision(!(rotation || centringError || angleError || exposureFail || motion || args.artefactObscuresAnatomy)), note: (rotation || centringError || angleError || exposureFail || motion || args.artefactObscuresAnatomy) ? "A repeat may be justified only if the visible technical defect compromises the clinical question; correct the cause before exposing again." : "Do not repeat: the visible technical quality is adequate for the clinical question and another exposure would add dose without meaningful benefit." },
    { key: "N-further", label: "Need for further views", decision: "concern", note: "Judge this from the clinical question and the image: a technically acceptable image may still require another projection if it cannot answer the request alone." },
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
    summary: repeatRequired ? "The image contains one or more visible/simulated technical defects that may compromise the clinical question. Review the individual PLATECAANN observations rather than repeating automatically." : "The image is technically suitable in the current simulation. Review the actual radiographic appearance systematically and decide whether the clinical question requires another view.",
  };
}
