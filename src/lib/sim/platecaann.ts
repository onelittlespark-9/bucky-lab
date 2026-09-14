import type { Patient, Projection, SimPose, TubeState, ExposureState, RadiographResult, PlatecaannItem, PlatecaannDecision } from "./types";
import { projectionGeometry } from "./projection-physics";
import { detailedRadiographicCritique, type DetailedCritiqueItem } from "./radiographic-critique-standards";

export interface PlatecaannAssessment {
  items: PlatecaannItem[];
  repeatRequired: boolean;
  furtherViewRecommended: boolean;
  diagnostic: boolean;
  score: number;
  summary: string;
  detailedCritique: DetailedCritiqueItem[];
}

function decision(ok: boolean | "concern"): PlatecaannDecision {
  return ok === true ? "pass" : ok === "concern" ? "concern" : "fail";
}

function hasMeaningfulRotation(pose: SimPose, projection: Projection) {
  if (projection.anatomy.includes("lat")) return Math.abs(Math.abs(pose.rotationY)-90) > 18;
  return Math.abs(pose.rotationY) > 12 || Math.abs(pose.oblique) > 8;
}

function expectedMarker(projection: Projection) {
  return projection.laterality === "left" ? "L" : projection.laterality === "right" ? "R" : null;
}

function markerStatus(marker: string | null | undefined, projection: Projection) {
  const present = marker === "L" || marker === "R";
  const expected = expectedMarker(projection);
  return { present, correct: present && (expected === null || marker === expected), expected };
}

function exposureStatus(result: RadiographResult | null, geometryUnsharpnessMm = 0) {
  if (!result) return { contrast: false, density: false, sharpness: false };
  const m = result.metrics;
  return {
    contrast: m.contrast >= 0.35 && m.contrast <= 0.9,
    density: m.eiStatus === "optimal" || (m.eiStatus !== "under" && m.saturation < 0.08),
    sharpness: geometryUnsharpnessMm <= 0.35,
  };
}

function contrastFeedback(result: RadiographResult | null, projection: Projection) {
  if (!result) return "No exposed image is available to assess contrast.";
  const c = result.metrics.contrast;
  if (c < 0.35) return "Contrast is too low: structures are compressed into similar grey shades, reducing separation between tissues and making bone/soft-tissue boundaries less distinct.";
  if (c > 0.9) return "Contrast is too high: the image is dominated by very black and very white areas. A clinical radiograph needs useful intermediate attenuation, not a silhouette or edge map.";
  if (projection.region === "Thorax") return "Chest contrast is acceptable only if the grey scale is clinically distributed: aerated lungs should remain radiolucent while pulmonary markings persist, the mediastinum/heart should be penetrated, and ribs/spine should not reduce to bright outlines.";
  if (c < 0.45) return `Contrast is acceptable but relatively low for ${projection.shortName}: bone should remain clearly whiter than surrounding soft tissue while useful soft-tissue grey shades are retained.`;
  if (c > 0.78) return `Contrast is relatively high for ${projection.shortName}: cortical bone should be radiopaque but trabecular/medullary detail and surrounding soft tissue must remain visible.`;
  return "Contrast is good when there is clear separation between cortical bone, trabecular/medullary bone, intermediate soft tissue and air-containing regions without clipping to featureless black or white.";
}

function densityFeedback(result: RadiographResult | null, projection: Projection) {
  if (!result) return "No exposed image is available to assess receptor exposure.";
  const { eiStatus, saturation, ei } = result.metrics;
  if (eiStatus === "under") return `Detector exposure is low for ${projection.shortName} (EI ${ei.toFixed(0)}): reduced photon fluence increases quantum mottle and can obscure subtle anatomical detail. Correct acquisition exposure rather than simply changing display brightness.`;
  if (eiStatus === "over" || saturation >= 0.08) return `Detector exposure is higher than necessary for ${projection.shortName} (EI ${ei.toFixed(0)}): reduce mAs or otherwise correct the acquisition to avoid unnecessary dose and detector saturation. Digital processing can hide excessive exposure.`;
  if (projection.region === "Thorax") return `Detector exposure is appropriate for ${projection.shortName}: the thoracic spine should be faintly visible through the cardiac shadow, pulmonary vascular detail should persist to the peripheral lungs, and the lung fields should not become featureless black.`;
  if (projection.region === "Upper limb" || projection.region === "Lower limb" || projection.region === "Spine") return "Detector exposure is appropriate when cortical margins, internal trabecular pattern and medullary regions are all visible without excessive saturation.";
  return "Detector exposure is appropriate when the required anatomy remains penetrated with useful internal attenuation detail and no excessive saturation.";
}

function sharpnessFeedback(result: RadiographResult | null, projection: Projection, geometryUnsharpnessMm: number) {
  if (!result) return "No exposed image is available to assess sharpness.";
  if (geometryUnsharpnessMm > 0.35) return `Geometric unsharpness is excessive for ${projection.shortName} (${geometryUnsharpnessMm.toFixed(2)} mm simulated). Correct SID/OID and tube/detector geometry before repeating.`;
  if (geometryUnsharpnessMm > 0.2) return `Geometric sharpness is acceptable but not optimal (${geometryUnsharpnessMm.toFixed(2)} mm simulated). Keep OID small and SID appropriately long.`;
  return `Geometric sharpness is good (${geometryUnsharpnessMm.toFixed(2)} mm simulated). Quantum noise should not be incorrectly labelled as geometric or motion unsharpness.`;
}

function chestCoverage(patient:Patient,tube:TubeState,geometry:ReturnType<typeof projectionGeometry>){
  const scale=patient.heightCm/170,halfH=(tube.collimationH/geometry.magnification)/2,top=tube.crY-halfH,bottom=tube.crY+halfH,requiredTop=20.5*scale,requiredBottom=55*scale;
  return {top,bottom,requiredTop,requiredBottom,adequate:top<=requiredTop+1.5&&bottom>=requiredBottom-1.5,excessSuperior:top<16*scale};
}

function areaFeedback(projection: Projection, tube: TubeState, isChest: boolean, patient:Patient, geometry:ReturnType<typeof projectionGeometry>) {
  const widthRatio = tube.collimationW / Math.max(1, projection.collimationW);
  const heightRatio = tube.collimationH / Math.max(1, projection.collimationH);
  if(isChest){
    const c=chestCoverage(patient,tube,geometry);
    if(!c.adequate) return `Chest coverage is inadequate: the projected field spans ${c.top.toFixed(1)}–${c.bottom.toFixed(1)} cm while the expected C7/apices-to-costophrenic-angle range is approximately ${c.requiredTop.toFixed(1)}–${c.requiredBottom.toFixed(1)} cm for this patient.`;
    if(c.excessSuperior) return "Required chest anatomy is included, but the superior field extends unnecessarily towards the mandible. Re-centre/collimate lower while retaining both lung apices.";
    return "Area of interest is appropriate: both lung apices through both costophrenic angles are covered without deliberately including the mandible.";
  }
  if (widthRatio >= 0.85 && heightRatio >= 0.85) return "Area of interest is adequate: the simulated field includes the projection's required anatomical coverage.";
  return "Area of interest is inadequate: required anatomy is likely excluded. Correct the detector/field position or collimation before repeating.";
}

function techniqueFeedback(projection: Projection, tube: TubeState, patient: Patient, rotation: boolean, centringError: boolean, angleError: boolean, sidError: boolean, respirationError: boolean) {
  if (rotation) return "Technique/positioning is not acceptable: rotation or obliquity will alter expected symmetry or superimposition of the anatomy.";
  if (centringError) return "Technique/positioning needs correction: the anatomy is not centred to the intended projection/central ray.";
  if (angleError) {
    if (projection.id === "pa-chest") return `PA chest should use a perpendicular/horizontal central ray. The tube is ${tube.angle.toFixed(1)}° off the required beam direction.`;
    return `Technique/positioning needs correction: the tube angle is ${tube.angle.toFixed(1)}° rather than the required ${projection.tubeAngle.toFixed(1)}°.`;
  }
  if (sidError) return `Technique/positioning needs correction: SID is ${tube.sid.toFixed(0)} cm rather than the selected ${projection.sidCm.toFixed(0)} cm, affecting magnification and geometric unsharpness.`;
  if (respirationError) return `Respiratory timing is incorrect for ${projection.shortName}: expose on the required ${projection.respiration} with suspended respiration.`;
  if(projection.id==="pa-chest") return "PA chest positioning is technically aligned in the simulation. On the image, confirm SC joints are equidistant from the spinous processes, scapulae are outside the lung fields, full inspiration is demonstrated, and coverage extends from apices to costophrenic angles.";
  if(projection.id==="lat-chest") return "Lateral chest positioning is technically aligned in the simulation. On the image, confirm posterior ribs/costophrenic angles are closely superimposed and both arms are clear of the apices.";
  return `Technique/positioning is good: the ${projection.shortName} projection is appropriately positioned and centred for this patient (${patient.heightCm.toFixed(0)} cm).`;
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
  const targetY=projection.cr.y*(patient.heightCm/170);
  const centringError = Math.abs(tube.crY-targetY)>Math.max(3,patient.heightCm*.035)||Math.abs(tube.crX-projection.cr.x)>4;
  const sidError = Math.abs(tube.sid - projection.sidCm) > 5;
  const isChest = projection.region === "Thorax" && projection.anatomy.includes("torso");
  const isStandardPaChest = projection.id === "pa-chest";
  const widthRatio = tube.collimationW / Math.max(1, projection.collimationW);
  const heightRatio = tube.collimationH / Math.max(1, projection.collimationH);
  const chestField=isChest?chestCoverage(patient,tube,geometry):null;
  const areaCoverageFail = isChest ? !(chestField?.adequate??false)||widthRatio<.75 : widthRatio < 0.85 || heightRatio < 0.85;
  const overCollimated = isChest ? widthRatio > 1.45 || (chestField?.excessSuperior??false) : widthRatio > 1.18 || heightRatio > 1.18;
  const collimationFail = areaCoverageFail;
  const collimationConcern = !collimationFail && overCollimated;
  const angleError = isStandardPaChest ? Math.abs(tube.angle) > 3 : Math.abs(tube.angle - projection.tubeAngle) > 3;
  const respirationError = projection.respiration !== undefined && pose.breath !== projection.respiration;
  const repeatCriticalExposure = !exp.contrast || !exp.density || !exp.sharpness;
  const repeatRequired = !markerCheck.correct || areaCoverageFail || rotation || centringError || angleError || sidError || respirationError || repeatCriticalExposure || !!args.artefactObscuresAnatomy || args.patientIdentifiersConfirmed === false;

  const items: PlatecaannItem[] = [
    { key: "P", label: "Patient identification", decision: decision(args.patientIdentifiersConfirmed !== false), note: args.patientIdentifiersConfirmed === false ? "Patient identifiers do not match the examination request." : "Patient identification is a pre-exposure safety check; confirm full name, DOB and hospital/ID number against the request." },
    { key: "L", label: "Label / marker", decision: decision(markerCheck.correct), note: !markerCheck.present ? "A laterality marker is missing. A marker is required for every exposed image in this simulator." : markerCheck.expected ? `Marker ${markerCheck.correct ? "is correct" : "is incorrect"}; expected anatomical marker: ${markerCheck.expected}.` : `Marker ${marker} is present. No fixed side is prescribed for this projection, but a visible anatomical L/R marker is still required.` },
    { key: "A-area", label: "Area of interest", decision: decision(!areaCoverageFail), note: areaFeedback(projection, tube, isChest, patient, geometry) },
    { key: "T", label: "Technique / positioning", decision: decision(!(rotation || centringError || angleError || sidError || respirationError)), note: techniqueFeedback(projection, tube, patient, rotation, centringError, angleError, sidError, respirationError) },
    { key: "E-contrast", label: "Exposure — contrast", decision: decision(exp.contrast), note: contrastFeedback(result, projection) },
    { key: "E-density", label: "Exposure — detector exposure", decision: decision(exp.density), note: densityFeedback(result, projection) },
    { key: "E-sharpness", label: "Exposure — geometric sharpness", decision: decision(exp.sharpness), note: sharpnessFeedback(result, projection, geometry.geometricUnsharpnessMm) },
    { key: "C", label: "Collimation", decision: decision(collimationFail ? false : collimationConcern ? "concern" : true), note: collimationFail ? "Collimation/field position excludes required anatomy and should be corrected before repeating." : collimationConcern ? (isChest ? "Required chest anatomy is present, but the field includes more superior/lateral anatomy than necessary. Tighten the field while retaining apices and costophrenic angles." : "The field is wider than necessary. Tighten collimation while retaining all required anatomy.") : "Collimation is appropriate for the required anatomy." },
    { key: "A-artifact", label: "Artefacts", decision: decision(!args.artefactObscuresAnatomy), note: args.artefactObscuresAnatomy ? "An artefact is visible/simulated over clinically relevant anatomy and may mimic or obscure pathology." : "No obscuring artefact is flagged; the image should remain free of clothing, jewellery or external objects that could mimic or obscure pathology." },
    { key: "A-abnormality", label: "Abnormality", decision: decision(args.abnormalityRecognised === undefined || args.abnormalityRecognised), note: args.abnormalityRecognised === false ? "The simulated/reference abnormality has not been recognised on the image." : "Review the actual radiograph systematically for pathology, trauma, devices and post-operative appearances; base this on what is visibly demonstrated." },
    { key: "N-repeat", label: "Need for repeat", decision: decision(!repeatRequired), note: repeatRequired ? "Repeat only when a visible technical/safety defect compromises the clinical question. Correct the underlying cause before exposing again." : "Do not repeat: the image is technically adequate for the clinical question. An additional exposure would add dose without meaningful technical benefit." },
    { key: "N-further", label: "Need for further views", decision: "concern", note: "A technically acceptable image can still require another projection when the clinical question cannot be answered by this view alone. This is a clinical decision, not an automatic technical failure." },
  ];

  const weights: Record<string, number> = { P: 5, L: 8, "A-area": 10, T: 20, "E-contrast": 8, "E-density": 14, "E-sharpness": 8, C: 5, "A-artifact": 5, "A-abnormality": 7, "N-repeat": 10, "N-further": 0 };
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const weightedScore = items.reduce((sum, item) => sum + weights[item.key] * (item.decision === "pass" ? 1 : item.decision === "concern" ? 0.5 : 0), 0);
  const score = Math.max(0, Math.round((weightedScore / totalWeight) * 100));
  const diagnostic = !repeatRequired;
  const detailedCritique=result?detailedRadiographicCritique({patient,projection,pose,tube,exposure,metrics:result.metrics,scores:result.scores}):[];

  return {
    items,
    repeatRequired,
    furtherViewRecommended: false,
    diagnostic,
    score,
    detailedCritique,
    summary: repeatRequired ? "The image contains a specific technical or safety defect that may compromise the clinical question. Review the projection-specific observations and correct the actual cause before repeating." : "The image is technically suitable in the current simulation. Compare its visible anatomy and attenuation against the projection-specific criteria; only repeat if a defect genuinely compromises the clinical question.",
  };
}
