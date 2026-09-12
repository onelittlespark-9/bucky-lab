import type { ImagingRequest } from "./requests";

export type DepartmentArea = "inpatient" | "outpatient" | "ed";

export const DEPARTMENT_AREAS: Record<DepartmentArea, { label: string; description: string }> = {
  inpatient: { label: "Inpatient", description: "Ward and bed-based examinations, including patients who may need portable or assisted positioning." },
  outpatient: { label: "Outpatient", description: "Planned examinations for patients attending the department from home or clinic." },
  ed: { label: "Emergency department", description: "Acute trauma and urgent presentations where pain, immobilisation or reduced mobility may change the projection." },
};

export function departmentForRequest(request: ImagingRequest): DepartmentArea {
  const text = `${request.title} ${request.clinicalHistory} ${request.urgency ?? ""}`.toLowerCase();
  if (/fall|trauma|fracture|dislocation|assault|foosh|rta|inversion|punched|acute injury|unable to (move|weight-bear)|shortened and externally rotated|hard collar/.test(text)) return "ed";
  if (request.urgency === "stat") return "inpatient";
  if (/post[- ]?op|postoperative|ward|inpatient|bedbound|admitted/.test(text)) return "inpatient";
  return "outpatient";
}

export type EDModifiedViewId =
  | "standard"
  | "seated-axial-shoulder"
  | "seated-ap-shoulder"
  | "cross-table-hip"
  | "cross-table-knee"
  | "horizontal-beam-cspine"
  | "supported-elbow"
  | "supported-ankle"
  | "portable-ap-chest";

export interface EDModifiedView {
  id: EDModifiedViewId;
  label: string;
  when: string;
  positioning: string;
  tube: string;
  bucky: string;
  safety: string;
  tubeAngle?: number;
  buckyTilt?: number;
  placement?: "standing" | "seated" | "upright-bucky" | "table";
}

export const ED_MODIFIED_VIEWS: EDModifiedView[] = [
  {
    id: "standard",
    label: "Standard projection",
    when: "Patient can safely achieve the standard position without aggravating the injury.",
    positioning: "Use the standard departmental positioning and avoid unnecessary movement of the injured patient.",
    tube: "Use the projection's normal central-ray direction.",
    bucky: "Use the detector in the standard position.",
    safety: "Only use when the required movement is safe and tolerated.",
  },
  {
    id: "seated-axial-shoulder",
    label: "Modified axial shoulder · seated",
    when: "Shoulder trauma patient cannot abduct or move the arm safely enough for a conventional axial view.",
    positioning: "Seat the patient upright beside/in front of the detector with the injured shoulder against the detector. Do not force abduction or rotate the injured arm.",
    tube: "Angle the tube approximately 45° through the shoulder so the beam passes through the glenohumeral region to produce an axial-type projection.",
    bucky: "Tilt the detector approximately 45° to match the modified beam geometry; confirm detector/tube alignment before exposure.",
    safety: "Do not force the injured arm into abduction or rotate it to obtain the textbook position.",
    tubeAngle: 45,
    buckyTilt: 45,
    placement: "seated",
  },
  {
    id: "seated-ap-shoulder",
    label: "Modified AP shoulder · seated",
    when: "The patient cannot stand or tolerate the normal upright position but can sit safely.",
    positioning: "Seat the patient facing the detector with the affected shoulder positioned as tolerated. Keep the injured arm in its safest natural position.",
    tube: "Use the AP shoulder central-ray direction for the selected shoulder projection; do not introduce unnecessary angulation.",
    bucky: "Use the upright detector or a detector positioned safely behind/alongside the seated patient.",
    safety: "Useful when the patient can sit but cannot safely stand or rotate into the standard position.",
    placement: "seated",
  },
  {
    id: "cross-table-hip",
    label: "Cross-table lateral hip · trauma",
    when: "Suspected hip/proximal femur injury where moving the affected leg for a conventional lateral view is inappropriate.",
    positioning: "Keep the affected leg in its found position. Place the detector beside the hip and use a horizontal beam; only move the unaffected limb if clinically safe.",
    tube: "Use a horizontal central ray directed through the affected hip to the detector; centre to the femoral neck/hip joint.",
    bucky: "Detector is vertical beside the affected hip rather than underneath the patient.",
    safety: "Do not rotate, abduct or flex the injured hip merely to reproduce a routine lateral position.",
    tubeAngle: 90,
    buckyTilt: 90,
    placement: "table",
  },
  {
    id: "cross-table-knee",
    label: "Horizontal-beam lateral knee",
    when: "Knee trauma patient cannot safely flex or rotate the injured limb for the usual lateral position.",
    positioning: "Keep the injured leg supported in its tolerated position. Place the detector vertically beside the knee.",
    tube: "Use a horizontal central ray through the knee joint, centred to the joint space.",
    bucky: "Use a vertical detector alongside the knee; do not force the knee into flexion.",
    safety: "Avoid unnecessary movement when fracture or dislocation is suspected.",
    tubeAngle: 90,
    buckyTilt: 90,
    placement: "table",
  },
  {
    id: "horizontal-beam-cspine",
    label: "Horizontal-beam lateral C-spine",
    when: "Trauma patient is immobilised or neck movement is contraindicated and a lateral cervical view is clinically required.",
    positioning: "Keep the patient in the prescribed immobilisation and do not flex, extend or rotate the cervical spine to obtain the view.",
    tube: "Use a horizontal beam through the cervical spine to the vertical detector; align the beam without moving the patient's neck.",
    bucky: "Position the detector vertically beside the cervical spine as required by the trauma setup.",
    safety: "Do not remove or alter cervical immobilisation unless specifically authorised by the responsible clinical team.",
    tubeAngle: 90,
    buckyTilt: 90,
    placement: "table",
  },
  {
    id: "supported-elbow",
    label: "Supported elbow · pain-limited",
    when: "Elbow trauma prevents the patient from achieving the normal AP/lateral positioning sequence.",
    positioning: "Support the injured arm on the detector/table in the position it can safely tolerate; obtain the clinically useful views without forcing extension or rotation.",
    tube: "Centre to the elbow joint and adapt the beam direction to the supported detector position.",
    bucky: "Use a detector that can be brought to the supported limb rather than moving the limb to a fixed detector.",
    safety: "Prioritise immobilisation and pain limitation over reproducing an ideal textbook pose.",
    placement: "table",
  },
  {
    id: "supported-ankle",
    label: "Supported ankle · non-weight-bearing",
    when: "Acute ankle injury where standing or weight-bearing is not appropriate.",
    positioning: "Keep the patient seated or supine with the injured ankle supported; obtain the required views without weight-bearing.",
    tube: "Use the appropriate ankle AP/mortise/lateral central-ray direction for the supported position.",
    bucky: "Bring the detector to the ankle rather than asking the patient to stand on an injured limb.",
    safety: "Do not ask a patient with an acute injury to weight-bear solely to reproduce a routine outpatient examination.",
    placement: "table",
  },
  {
    id: "portable-ap-chest",
    label: "AP chest · bed/seated modification",
    when: "Acute patient cannot safely stand for a PA chest but a chest radiograph is required.",
    positioning: "Perform AP with the patient upright/semi-upright or supine according to clinical condition and equipment availability.",
    tube: "Use the AP chest central-ray direction and adapt SID/beam geometry to the available bedside setup.",
    bucky: "Use a portable detector behind the patient or beneath the chest as appropriate to the clinical setup.",
    safety: "Do not transfer an unstable or severely injured patient solely to obtain a PA projection.",
    placement: "seated",
  },
];

export function edModifiedViewsForRequest(request: ImagingRequest): EDModifiedView[] {
  const text = `${request.title} ${request.requestedViewsLabel} ${request.clinicalHistory}`;
  const views: EDModifiedView[] = [ED_MODIFIED_VIEWS[0]];
  if (/shoulder|proximal humerus/i.test(text)) views.push(ED_MODIFIED_VIEWS[1], ED_MODIFIED_VIEWS[2]);
  if (/hip|femur|neck of femur|NOF/i.test(text)) views.push(ED_MODIFIED_VIEWS[3]);
  if (/knee|patella/i.test(text)) views.push(ED_MODIFIED_VIEWS[4]);
  if (/neck|cervical|c-spine|hard collar/i.test(text)) views.push(ED_MODIFIED_VIEWS[5]);
  if (/elbow/i.test(text)) views.push(ED_MODIFIED_VIEWS[6]);
  if (/ankle/i.test(text)) views.push(ED_MODIFIED_VIEWS[7]);
  if (/chest|thorax|rib/i.test(text)) views.push(ED_MODIFIED_VIEWS[8]);
  return views;
}
