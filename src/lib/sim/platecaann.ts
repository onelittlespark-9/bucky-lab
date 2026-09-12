import type { SimState } from "./store";

function chestCollimationAcceptable(width: number, height: number, targetW: number, targetH: number) {
  const widthRatio = width / Math.max(1, targetW);
  const heightRatio = height / Math.max(1, targetH);
  return widthRatio >= 0.85 && widthRatio <= 1.35 && heightRatio >= 0.85 && heightRatio <= 1.35;
}

const decision = (ok: boolean, _failText: string, _passText = "Acceptable.") => ok ? "pass" : "fail";

export function assessPlatecaann(args: {
  patientIdentifiersConfirmed?: boolean;
  marker?: string;
  expectedMarker?: string;
  result?: { metrics?: { eiStatus?: string } } | null;
  projection: { region: string; anatomy: string; collimationW: number; collimationH: number };
  tube: { collimationW: number; collimationH: number; sid: number; angle: number };
  rotation?: boolean;
  centringError?: boolean;
  angleError?: boolean;
  sidError?: boolean;
  motion?: boolean;
  exp: { contrast: boolean; density: boolean; sharpness: boolean };
  artefactObscuresAnatomy?: boolean;
  abnormalityRecognised?: boolean;
}) {
  const { projection, tube, result } = args;
  const isChest = projection.region === "Thorax" && projection.anatomy.includes("torso");
  const collimationAcceptable = isChest
    ? chestCollimationAcceptable(tube.collimationW, tube.collimationH, projection.collimationW, projection.collimationH)
    : tube.collimationW <= projection.collimationW * 1.18 && tube.collimationH <= projection.collimationH * 1.18;
  const collimationError = !collimationAcceptable;
  const expected = args.expectedMarker;
  const exposureFail = !(args.exp.contrast && args.exp.density && args.exp.sharpness);

  const items = [
    { key: "P", label: "Patient identification", decision: decision(args.patientIdentifiersConfirmed !== false, "Patient identifiers do not match the examination request."), note: "Confirm full name, date of birth and hospital/ID number before accepting the image." },
    { key: "L", label: "Label / marker", decision: decision(args.marker === undefined || args.marker === expected, "The anatomical marker is incorrect or inappropriate."), note: expected ? `Expected anatomical marker: ${expected}.` : "No laterality marker is required by the projection definition." },
    { key: "A-area", label: "Area of interest", decision: decision(result !== null, "The generated examination does not contain a usable result."), note: isChest ? "For an acceptable chest image, include both lung apices, both costophrenic angles with a small amount below the diaphragms, and the lateral soft-tissue margins." : "The final implementation should compare projected anatomy against the projection-specific inclusion criteria." },
    { key: "T", label: "Technique / positioning", decision: decision(!(args.rotation || args.centringError || args.angleError || args.sidError), "Technique or positioning is outside the current simulation tolerance."), note: `SID ${tube.sid.toFixed(0)} cm; tube angle ${tube.angle.toFixed(1)}°. ${args.motion ? "Sharpness also suggests motion." : ""}` },
    { key: "E-contrast", label: "Exposure — contrast", decision: decision(args.exp.contrast, "Contrast is outside the current simulation target."), note: "Assess tissue differentiation and projection-specific anatomical contrast rather than image brightness alone." },
    { key: "E-density", label: "Exposure — density", decision: decision(args.exp.density, "Exposure/density is outside the current simulation target."), note: `Assess exposure adequacy using the simulated EI status${result?.metrics?.eiStatus ? ` (${result.metrics.eiStatus})` : ""}.` },
    { key: "E-sharpness", label: "Exposure — sharpness", decision: decision(args.exp.sharpness, "Reduced sharpness/noise is present; assess whether it compromises the clinical question."), note: "Consider motion and geometric unsharpness, including SID/OID effects where relevant." },
    { key: "C", label: "Collimation", decision: decision(!collimationError, collimationError ? (isChest ? "The chest field is outside the practical tolerance and may exclude required anatomy." : "The simulated field is wider than the target region.") : (isChest ? "For chest, modest over- or under-collimation is tolerated when the apices, costophrenic angles / just below the diaphragm, and lateral soft-tissue borders remain included." : "Use the smallest field that includes all clinically required anatomy.")), note: isChest ? "For chest, modest over- or under-collimation is tolerated when the apices, costophrenic angles / just below the diaphragm, and lateral soft-tissue borders remain included." : "Use the smallest field that includes all clinically required anatomy." },
    { key: "A-artifact", label: "Artefacts", decision: decision(!args.artefactObscuresAnatomy, "An artefact may obscure clinically relevant anatomy."), note: "Check clothing, jewellery, equipment and medical devices before accepting the image." },
    { key: "A-abnormality", label: "Abnormality", decision: decision(args.abnormalityRecognised === undefined || args.abnormalityRecognised, "A reference abnormality has not been recognised."), note: "Review the clinical indication and systematically assess the image for pathology, trauma, devices and unexpected findings." },
    { key: "N-repeat", label: "Need for repeat", decision: decision(!(args.rotation || args.centringError || args.angleError || exposureFail || args.motion || args.artefactObscuresAnatomy), "The image has a defect that may justify another exposure."), note: "Do not repeat merely because the image is imperfect; repeat only when the defect is diagnostically significant." },
    { key: "N-further", label: "Need for further views", decision: "concern", note: "Further-view decisions are clinical: an acceptable first image may still need an additional projection to answer the clinical question." },
  ];

  const failures = items.filter(i => i.decision === "fail").length;
  return { items, failures, pass: failures === 0 };
}
