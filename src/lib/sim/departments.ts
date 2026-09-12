import type { ImagingRequest } from "./requests";

export type DepartmentArea = "inpatient" | "outpatient" | "ed";

export const DEPARTMENT_AREAS: Record<DepartmentArea, { label: string; description: string }> = {
  inpatient: { label: "Inpatient", description: "Ward and bed-based examinations, including patients who may need portable or assisted positioning." },
  outpatient: { label: "Outpatient", description: "Planned examinations for patients attending the department from home or clinic." },
  ed: { label: "Emergency department", description: "Acute trauma and urgent presentations where pain, immobilisation or reduced mobility may change the projection." },
};

/**
 * Cases are routed to a departmental area from the clinical presentation.
 * This deliberately favours ED for acute trauma so the learner sees the
 * mobility problem before choosing the projection rather than after it.
 */
export function departmentForRequest(request: ImagingRequest): DepartmentArea {
  const text = `${request.title} ${request.clinicalHistory} ${request.urgency ?? ""}`.toLowerCase();
  if (/fall|trauma|fracture|dislocation|assault|foosh|rta|inversion|punched|acute injury|unable to (move|weight-bear)|shortened and externally rotated|hard collar/.test(text)) return "ed";
  if (request.urgency === "stat") return "inpatient";
  if (/post[- ]?op|postoperative|ward|inpatient|bedbound|admitted/.test(text)) return "inpatient";
  return "outpatient";
}

export type EDModifiedViewId = "standard" | "seated-axial-shoulder";

export interface EDModifiedView {
  id: EDModifiedViewId;
  label: string;
  when: string;
  positioning: string;
  tube: string;
  bucky: string;
}

export const ED_MODIFIED_VIEWS: EDModifiedView[] = [
  {
    id: "standard",
    label: "Standard projection",
    when: "Patient can safely achieve the standard position without aggravating the injury.",
    positioning: "Use the standard departmental positioning and avoid unnecessary movement of the injured patient.",
    tube: "Use the projection's normal central-ray direction.",
    bucky: "Use the detector in the standard position.",
  },
  {
    id: "seated-axial-shoulder",
    label: "Modified axial shoulder · seated",
    when: "Shoulder trauma patient cannot abduct or move the arm safely enough for a conventional axial view.",
    positioning: "Seat the patient upright beside/in front of the detector with the injured shoulder against the detector. Do not force abduction or rotate the injured arm.",
    tube: "Angle the tube approximately 45° through the shoulder so the beam passes through the glenohumeral region to produce an axial-type projection.",
    bucky: "Tilt the detector approximately 45° to match the modified beam geometry; confirm the detector and tube are aligned before exposure.",
  },
];

export function edModifiedViewsForRequest(request: ImagingRequest): EDModifiedView[] {
  const shoulder = /shoulder|proximal humerus/i.test(`${request.title} ${request.requestedViewsLabel} ${request.clinicalHistory}`);
  return shoulder ? ED_MODIFIED_VIEWS : [ED_MODIFIED_VIEWS[0]];
}
