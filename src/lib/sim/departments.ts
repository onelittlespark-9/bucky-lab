import type { ImagingRequest } from "./requests";

export type DepartmentArea = "inpatient" | "outpatient" | "ed";

export const DEPARTMENT_AREAS: Record<DepartmentArea, { label: string; description: string }> = {
  inpatient: { label: "Inpatient", description: "Ward and bed-based examinations, including patients who may need portable or assisted positioning." },
  outpatient: { label: "Outpatient", description: "Planned examinations for patients attending the department from home or clinic." },
  ed: { label: "Emergency department", description: "Acute trauma and urgent presentations where pain, immobilisation or reduced mobility may change the projection." },
};

export function departmentForRequest(request: ImagingRequest): DepartmentArea {
  const text = `${request.title} ${request.clinicalHistory} ${request.urgency ?? ""}`.toLowerCase();
  if (/emergency department|\bed\b|fall|trauma|fracture|dislocation|assault|foosh|rta|inversion|punched|acute injury|unable to (move|weight-bear)|shortened and externally rotated|hard collar/.test(text)) return "ed";
  if (request.urgency === "stat") return "inpatient";
  if (/post[- ]?op|postoperative|ward|inpatient|bedbound|admitted/.test(text)) return "inpatient";
  return "outpatient";
}

export type EDModifiedViewId = "standard" | "seated-axial-shoulder" | "seated-ap-shoulder" | "cross-table-hip" | "cross-table-knee" | "horizontal-beam-cspine" | "supported-elbow" | "supported-ankle" | "portable-ap-chest";
export interface EDModifiedView { id: EDModifiedViewId; label: string; when: string; positioning: string; tube: string; bucky: string; safety: string; tubeAngle?: number; buckyTilt?: number; placement?: "standing" | "seated" | "upright-bucky" | "table"; }
export const ED_MODIFIED_VIEWS: EDModifiedView[] = [
  { id: "standard", label: "Standard projection", when: "Patient can safely achieve the standard position without aggravating the injury.", positioning: "Use the standard departmental positioning and avoid unnecessary movement.", tube: "Use the projection's normal central-ray direction.", bucky: "Use the detector in the standard position.", safety: "Only use when the required movement is safe and tolerated." },
  { id: "seated-axial-shoulder", label: "Modified axial shoulder · seated", when: "Shoulder trauma patient cannot abduct safely.", positioning: "Seat the patient with the injured shoulder supported against the detector; do not force abduction.", tube: "Angle approximately 45° through the shoulder.", bucky: "Tilt the detector approximately 45° to match the modified geometry.", safety: "Do not force the injured arm.", tubeAngle: 45, buckyTilt: 45, placement: "seated" },
  { id: "seated-ap-shoulder", label: "Modified AP shoulder · seated", when: "Patient cannot stand but can sit safely.", positioning: "Seat the patient facing the detector with the affected shoulder positioned as tolerated.", tube: "Use the normal AP shoulder direction.", bucky: "Use the upright detector or a detector safely positioned beside the patient.", safety: "Keep the injured arm in its safest natural position.", placement: "seated" },
  { id: "cross-table-hip", label: "Cross-table lateral hip · trauma", when: "Hip injury makes a conventional lateral unsafe.", positioning: "Keep the affected leg in its found position and place the detector beside the hip.", tube: "Use a horizontal central ray through the affected hip.", bucky: "Detector vertical beside the affected hip.", safety: "Do not rotate or abduct the injured hip.", tubeAngle: 90, buckyTilt: 90, placement: "table" },
  { id: "cross-table-knee", label: "Horizontal-beam lateral knee", when: "Knee trauma prevents normal positioning.", positioning: "Support the injured leg in the tolerated position.", tube: "Use a horizontal central ray through the knee.", bucky: "Vertical detector alongside the knee.", safety: "Do not force flexion or rotation.", tubeAngle: 90, buckyTilt: 90, placement: "table" },
  { id: "horizontal-beam-cspine", label: "Horizontal-beam lateral C-spine", when: "Trauma patient is immobilised.", positioning: "Keep immobilisation in place and do not move the neck.", tube: "Use a horizontal beam through the cervical spine.", bucky: "Vertical detector beside the cervical spine.", safety: "Do not alter immobilisation without authorisation.", tubeAngle: 90, buckyTilt: 90, placement: "table" },
  { id: "supported-elbow", label: "Supported elbow · pain-limited", when: "Elbow trauma prevents normal extension or rotation.", positioning: "Support the injured arm and obtain the useful view without forcing movement.", tube: "Centre to the elbow joint.", bucky: "Bring the detector to the supported limb.", safety: "Prioritise immobilisation and pain limitation.", placement: "table" },
  { id: "supported-ankle", label: "Supported ankle · non-weight-bearing", when: "Acute ankle injury makes standing inappropriate.", positioning: "Keep the ankle supported and obtain the required views non-weight-bearing.", tube: "Use the appropriate ankle central-ray direction.", bucky: "Bring the detector to the ankle.", safety: "Do not require weight-bearing solely to reproduce a routine view.", placement: "table" },
  { id: "portable-ap-chest", label: "AP chest · bed/seated modification", when: "Acute patient cannot safely stand.", positioning: "Perform AP with the patient upright, semi-upright or supine according to condition.", tube: "Use the AP chest central-ray direction.", bucky: "Use a portable detector behind or beneath the chest as appropriate.", safety: "Do not transfer an unstable patient solely to obtain PA.", placement: "seated" },
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
