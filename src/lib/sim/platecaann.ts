import type { Patient, Projection, SimPose, TubeState, ExposureState, RadiographResult, PlatecaannItem, PlatecaannDecision } from "./types";
import { projectionGeometry } from "./projection-physics";

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

function markerStatus(marker: string | null | undefined, projection: Projection) {
  const present = marker === "L" || marker === "R";
  const expected = expectedMarker(projection);
  return {
    present,
    correct: present && (expected === null || marker === expected),
    expected,
  };
}

function exposureStatus(result: RadiographResult | null, geometryUnsharpnessMm = 0) {
  if (!result) return { contrast: false, density: false, sharpness: false };
  const m = result.metrics;
  return {
    contrast: m.contrast >= 0.35 && m.contrast <= 0.9,
    density: m.eiStatus === "optimal" || (m.eiStatus !== "under" && m.saturation < 0.08),
    // Noise is not geometric sharpness. Sharpness is assessed from the projection
    // geometry model; quantum noise is reported under exposure/density.
    sharpness: geometryUnsharpnessMm <= 0.35,
  };
}

function contrastFeedback(result: RadiographResult | null, projection: Projection) {
  if (!result) return "No exposed image is available to assess contrast.";
  const c = result.metrics.contrast;
  if (c < 0.35) return "Contrast is too low: structures are compressed into similar grey shades, reducing separation between tissues and making bone/soft-tissue boundaries less distinct.";
  if (c > 0.9) return "Contrast is too high: the image is dominated by very black and very white areas with reduced useful grey-scale differentiation in soft tissue.";
  if (projection.region === "Thorax") return "Chest contrast is acceptable: the high-kVp technique should retain useful grey-scale information while providing sufficient penetration of the mediastinum and retrocardiac region.";
  if (c < 0.45) return `Contrast is acceptable but relatively low for ${projection.shortName}: bone should remain clearly whiter than surrounding soft tissue while useful soft-tissue grey shades are retained.`;
  if (c > 0.78) return `Contrast is relatively high for ${projection.shortName}: bone should appear distinctly white, air dark/black where present, with enough intermediate grey tones to demonstrate soft tissue.`;
  return "Contrast is good: there is clear separation between radiopaque bone, intermediate grey soft tissue and dark air-containing regions where present, without excessive loss of grey-scale information.";
}

function densityFeedback(result: RadiographResult | null, projection: Projection) {
  if (!result) return "No exposed image is available to assess receptor exposure.";
  const { eiStatus, saturation, ei } = result.metrics;
  if (eiStatus === "under") return `Detector exposure is low for ${projection.shortName} (EI ${ei.toFixed(0)}): the reduced photon fluence increases quantum noise/mottle and can obscure subtle anatomical detail. For a chest, correct this primarily by increasing mAs/using the appropriate AEC response rather than simply making the displayed image darker.`;
  if (eiStatus === "over" || saturation >= 0.08) return `Detector exposure is higher than necessary for ${projection.shortName} (EI ${ei.toFixed(0)}): reduce mAs or otherwise correct the exposure selection to avoid unnecessary patient dose and detector saturation. Digital processing can hide excessive exposure from visual inspection.`;
  if (projection.region === "Thorax") return `Detector exposure is appropriate for ${projection.shortName}: assess penetration as well as EI. The thoracic spine/intervertebral spaces should be faintly visible through the cardiac shadow and pulmonary vascular detail should remain visible, without unnecessary saturation.`;
  if (projection.region === "Upper limb" || projection.region === "Lower limb" || projection.region === "Spine") return "Detector exposure is appropriate: the bony anatomy is adequately penetrated, with trabecular pattern and cortical margins clearly demonstrated without excessive saturation.";
  return "Detector exposure is appropriate: the required anatomy is adequately penetrated and useful anatomical detail remains visible without excessive saturation.";
}

function sharpnessFeedback(result: RadiographResult | null, projection: Projection, geometryUnsharpnessMm: number) {
  if (!result) return "No exposed image is available to assess sharpness.";
  if (geometryUnsharpnessMm > 0.35) return `Geometric unsharpness is excessive for ${projection.shortName} (${geometryUnsharpnessMm.toFixed(2)} mm in the simulation). Correct SID/OID and tube/detector geometry before repeating.`;
  if (geometryUnsharpnessMm > 0.2) return `Geometric sharpness is acceptable but not optimal (${geometryUnsharpnessMm.toFixed(2)} mm simulated unsharpness). Keep OID small and SID appropriately long.`;
  return `Geometric sharpness is good (${geometryUnsharpnessMm.toFixed(2)} mm simulated unsharpness). The patient's arrested breath-hold controls respiratory motion; quantum noise should not be incorrectly labelled as geometric or motion unsharpness.`;
}

function areaFeedback(projection: Projection, tube: TubeState, isChest: boolean) {
  const widthRatio = tube.collimationW / Math.max(1, projection.collimationW);
  const heightRatio = tube.collimationH / Math.max(1, projection.collimationH);
  if (isChest && widthRatio >= 0.75 && heightRatio >= 0.75) return "Area of interest is adequate: the simulated field is large enough to demonstrate the required chest anatomy. Do not mark the area inadequate merely because the field contains a small amount of additional surrounding anatomy.";
  if (!isChest && widthRatio >= 0.85 && heightRatio >= 0.85) return "Area of interest is adequate: the simulated field includes the projection's required anatomical coverage.";
  return "Area of interest is inadequate: required anatomy is likely excluded. Correct the detector/field position or collimation before repeating.";
}

function techniqueFeedback(projection: Projection, tube: TubeState, patient: Patient, rotation: boolean, centringError: boolean, angleError: boolean, sidError: boolean, respirationError: boolean) {
  if (rotation) return "Technique/positioning is not acceptable: rotation or obliquity is visible through simulated asymmetry/superimposition of the anatomy.";
  if (centringError) return "Technique/positioning needs correction: the anatomy is not centred to the intended projection/central ray.";
  if (angleError) {
    if (projection.id === "pa-chest") return `PA chest should use a perpendicular/horizontal central ray in this simulation. The tube is ${tube.angle.toFixed(1)}° off the selected 0° beam direction; correct the tube/detector alignment rather than adding angulation to compensate for positioning.`;
    return `Technique/positioning needs correction: the tube angle is ${tube.angle.toFixed(1)}° rather than the required ${projection.tubeAngle.toFixed(1)}°. This changes projection geometry and superimposition.`;
  }
  if (sidError) return `Technique/positioning needs correction: SID is ${tube.sid.toFixed(0)} cm rather than the selected ${projection.sidCm.toFixed(0)} cm, affecting magnification and geometric unsharpness.`;
  if (respirationError) return `Respiratory timing is incorrect for ${projection.shortName}: expose on the required ${projection.respiration} with suspended respiration. Do not infer respiratory motion from image noise.`;
  return `Technique/positioning is good: the ${projection.shortName} projection is appropriately positioned and centred for this patient (${patient.heightCm.toFixed(0)} cm), with no significant simulated rotation, centring, tube-angle or respiratory-timing error.`;
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
  const { patient, projection, pose, tube, result, exposure } = args;
  const marker = args.marker ?? exposure.marker;
  const markerCheck = markerStatus(marker, projection);
  const geometry = projectionGeometry(projection, tube, pose, exposure.focalSpot);
  const exp = exposureStatus(result, geometry.geometricUnsharpnessMm);
  const rotation = hasMeaningfulRotation(pose, projection);
  const centringError = Math.abs(tube.crY - projection.cr.y * (patient.heightCm / 100)) > Math.max(3, patient.heightCm * 0.035) || Math.abs(tube.crX - projection.cr.x) > 4;
  const sidError = Math.abs(tube.sid - projection.sidCm) > 5;
  const isChest = projection.region === "Thorax" && projection.anatomy.includes("torso");
  const isStandardPaChest = projection.id === "pa-chest";
  const widthRatio = tube.collimationW / Math.max(1, projection.collimationW);
  const heightRatio = tube.collimationH / Math.max(1, projection.collimationH);
  const areaCoverageFail = isChest ? widthRatio < 0.75 || heightRatio < 0.75 : widthRatio < 0.85 || heightRatio < 0.85;
  const overCollimated = isChest ? widthRatio > 1.45 || heightRatio > 1.45 : widthRatio > 1.18 || heightRatio > 1.18;
  const collimationFail = areaCoverageFail;
  const collimationConcern = !collimationFail && overCollimated;
  const angleError = isStandardPaChest
    ? Math.abs(tube.angle) > 3
    : Math.abs(tube.angle - projection.tubeAngle) > 3;
  const respirationError = projection.respiration !== undefined && pose.breath !== projection.respiration;
  const repeatCriticalExposure = !exp.contrast || !exp.density || !exp.sharpness;
  const repeatRequired = !markerCheck.correct || areaCoverageFail || rotation || centringError || angleError || sidError || respirationError || repeatCriticalExposure || !!args.artefactObscuresAnatomy || args.patientIdentifiersConfirmed === false;

  const items: PlatecaannItem[] = [
    { key: "P", label: "Patient identification", decision: decision(args.patientIdentifiersConfirmed !== false), note: args.patientIdentifiersConfirmed === false ? "Patient identifiers do not match the examination request." : "Patient identification is a pre-exposure safety check; confirm full name, DOB and hospital/ID number against the request." },
    { key: "L", label: "Label / marker", decision: decision(markerCheck.correct), note: !markerCheck.present ? "A laterality marker is missing. A marker is required for every exposed image in this simulator." : markerCheck.expected ? `Marker ${markerCheck.correct ? "is correct" : "is incorrect"}; expected anatomical marker: ${markerCheck.expected}.` : `Marker ${marker} is present. No fixed side is prescribed for this projection, but a visible anatomical L/R marker is still required.` },
    { key: "A-area", label: "Area of interest", decision: decision(!areaCoverageFail), note: areaFeedback(projection, tube, isChest) },
    { key: "T", label: "Technique / positioning", decision: decision(!(rotation || centringError || angleError || sidError || respirationError)), note: techniqueFeedback(projection, tube, patient, rotation, centringError, angleError, sidError, respirationError) },
    { key: "E-contrast", label: "Exposure — contrast", decision: decision(exp.contrast), note: contrastFeedback(result, projection) },
    { key: "E-density", label: "Exposure — detector exposure", decision: decision(exp.density), note: densityFeedback(result, projection) },
    { key: "E-sharpness", label: "Exposure — geometric sharpness", decision: decision(exp.sharpness), note: sharpnessFeedback(result, projection, geometry.geometricUnsharpnessMm) },
    { key: "C", label: "Collimation", decision: decision(collimationFail ? false : collimationConcern ? "concern" : true), note: collimationFail ? (isChest ? "Collimation is too tight and risks excluding required chest anatomy. Correct the field before repeating." : "The field is too tightly collimated and risks excluding required anatomy.") : collimationConcern ? (isChest ? "The required chest anatomy remains included, but the field is wider than necessary. Tighten collimation where practical to reduce irradiated area and scatter; this is not automatically a repeat-worthy defect." : "The field is wider than necessary. Tighten collimation while retaining all required anatomy.") : (isChest ? "Collimation is acceptable: the required chest anatomy is included without an unnecessary field restriction." : "Collimation is appropriate for the required anatomy, limiting unnecessary irradiated anatomy and scatter.") },
    { key: "A-artifact", label: "Artefacts", decision: decision(!args.artefactObscuresAnatomy), note: args.artefactObscuresAnatomy ? "An artefact is visible/simulated over clinically relevant anatomy and may mimic or obscure pathology." : "No obscuring artefact is flagged; the image should remain free of clothing, jewellery or external objects that could mimic or obscure pathology." },
    { key: "A-abnormality", label: "Abnormality", decision: decision(args.abnormalityRecognised === undefined || args.abnormalityRecognised), note: args.abnormalityRecognised === false ? "The simulated/reference abnormality has not been recognised on the image." : "Review the actual radiograph systematically for pathology, trauma, devices and post-operative appearances; this item should be based on what is visibly demonstrated, not simply the case label." },
    { key: "N-repeat", label: "Need for repeat", decision: decision(!repeatRequired), note: repeatRequired ? "Repeat only when a visible technical/safety defect compromises the clinical question. Correct the underlying cause before exposing again." : "Do not repeat: the image is technically adequate for the clinical question. An additional exposure would add dose without meaningful technical benefit." },
    { key: "N-further", label: "Need for further views", decision: "concern", note: "A technically acceptable image can still require another projection when the clinical question cannot be answered by this view alone. This is a clinical decision, not an automatic technical failure." },
  ];

  const weights: Record<string, number> = { P: 5, L: 8, "A-area": 10, T: 20, "E-contrast": 8, "E-density": 14, "E-sharpness": 8, C: 5, "A-artifact": 5, "A-abnormality": 7, "N-repeat": 10, "N-further": 0 };
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const weightedScore = items.reduce((sum, item) => sum + weights[item.key] * (item.decision === "pass" ? 1 : item.decision === "concern" ? 0.5 : 0), 0);
  const score = Math.max(0, Math.round((weightedScore / totalWeight) * 100));
  const diagnostic = !repeatRequired;

  return {
    items,
    repeatRequired,
    furtherViewRecommended: false,
    diagnostic,
    score,
    summary: repeatRequired ? "The image contains a specific technical or safety defect that may compromise the clinical question. Review the individual PLATECAANN observations and correct the actual cause before repeating." : "The image is technically suitable in the current simulation. Review the radiograph systematically and only repeat if a visible defect genuinely compromises the clinical question.",
  };
}
