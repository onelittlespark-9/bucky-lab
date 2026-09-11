import type { ImagingRequest } from "./requests";
import { CASE_BANK } from "./case-bank";

const chestCases: ImagingRequest[] = CASE_BANK.map((c) => ({
  id: c.id,
  title: c.title,
  clinicalHistory: c.clinicalHistory,
  requestedProjections: c.projections,
  requestedViewsLabel: c.projections.map((p) => p === "pa-chest" ? "PA chest" : p === "lat-chest" ? "left lateral chest" : p).join(" + "),
  requestedLaterality: null,
  correctLaterality: null,
  patientId: c.patientId,
  isValid: true,
  pathologyId: c.pathologyId,
  region: "Thorax",
  urgency: c.id === "chest-post-line" ? "urgent" : "routine",
}));

const additionalRequests: ImagingRequest[] = [
  { id: "wrist-foosh", title: "Wrist — FOOSH", clinicalHistory: "Fall onto the outstretched right hand with swelling and snuffbox tenderness.", requestedProjections: ["pa-wrist"], requestedViewsLabel: "Right wrist examination", requestedLaterality: "right", correctLaterality: "right", patientId: "elise", isValid: true, pathologyId: "distal-radius-fracture", region: "Upper limb", urgency: "urgent" },
  { id: "hip-fall", title: "Hip — suspected neck of femur fracture", clinicalHistory: "79-year-old with a fall, shortened externally rotated left leg and inability to weight-bear.", requestedProjections: ["ap-pelvis", "ap-hip"], requestedViewsLabel: "AP pelvis + left hip", requestedLaterality: "left", correctLaterality: "left", patientId: "ruth", isValid: true, pathologyId: "femoral-neck-fracture", region: "Pelvis & hips", urgency: "stat" },
  { id: "knee-trauma", title: "Knee — trauma", clinicalHistory: "Fall onto the left knee with pain and inability to straight-leg raise.", requestedProjections: ["ap-knee", "lat-knee"], requestedViewsLabel: "Left knee AP + lateral", requestedLaterality: "left", correctLaterality: "left", patientId: "gordon", isValid: true, pathologyId: "patella-fracture", region: "Lower limb", urgency: "urgent" },
  { id: "ankle-trauma", title: "Ankle — inversion injury", clinicalHistory: "Right ankle inversion injury with lateral malleolar tenderness and swelling.", requestedProjections: ["ap-ankle"], requestedViewsLabel: "Right ankle examination", requestedLaterality: "right", correctLaterality: "right", patientId: "amara", isValid: true, pathologyId: "ankle-fracture", region: "Lower limb", urgency: "urgent" },
  { id: "elbow-trauma", title: "Elbow — FOOSH", clinicalHistory: "Fall onto the left hand with elbow pain, swelling and restricted movement.", requestedProjections: ["ap-elbow"], requestedViewsLabel: "Left elbow examination", requestedLaterality: "left", correctLaterality: "left", patientId: "elise", isValid: true, pathologyId: "olecranon-fracture", region: "Upper limb", urgency: "urgent" },
  { id: "shoulder-trauma", title: "Shoulder — trauma", clinicalHistory: "Fall onto the right shoulder with painful restricted movement and suspected fracture.", requestedProjections: ["ap-shoulder"], requestedViewsLabel: "Right shoulder examination", requestedLaterality: "right", correctLaterality: "right", patientId: "tomas", isValid: true, pathologyId: "humeral-shaft-fracture", region: "Upper limb", urgency: "urgent" },
  { id: "lumbar-pain", title: "Lumbar spine — pain", clinicalHistory: "Persistent low back pain with focal lumbar tenderness. Examination requested after clinical assessment.", requestedProjections: ["ap-lumbar", "lat-lumbar"], requestedViewsLabel: "Lumbar spine AP + lateral", requestedLaterality: null, correctLaterality: null, patientId: "gordon", isValid: true, pathologyId: "none", region: "Spine", urgency: "routine" },
  { id: "cspine-trauma", title: "Cervical spine — trauma", clinicalHistory: "High-speed road traffic collision with midline cervical tenderness. Hard collar in situ.", requestedProjections: ["lat-cspine"], requestedViewsLabel: "Horizontal-beam lateral cervical spine", requestedLaterality: null, correctLaterality: null, patientId: "tomas", isValid: true, pathologyId: "none", region: "Spine", urgency: "stat" },
  { id: "hand-trauma", title: "Hand — trauma", clinicalHistory: "Punched a wall with the right hand. Pain and swelling over the 5th metacarpal.", requestedProjections: ["pa-hand"], requestedViewsLabel: "Right hand examination", requestedLaterality: "right", correctLaterality: "right", patientId: "malik", isValid: true, pathologyId: "foreign-body", region: "Upper limb", urgency: "urgent" },
  { id: "abdomen-acute", title: "Abdomen — acute pain", clinicalHistory: "Abdominal distension, colicky pain and vomiting. Clinical concern for obstruction.", requestedProjections: ["ap-abdomen"], requestedViewsLabel: "AP abdomen", requestedLaterality: null, correctLaterality: null, patientId: "tomas", isValid: true, pathologyId: "none", region: "Abdomen", urgency: "urgent" },
  { id: "pelvis-trauma", title: "Pelvis — trauma", clinicalHistory: "Fall with pelvic pain and difficulty weight-bearing.", requestedProjections: ["ap-pelvis"], requestedViewsLabel: "AP pelvis", requestedLaterality: null, correctLaterality: null, patientId: "ruth", isValid: true, pathologyId: "femoral-neck-fracture", region: "Pelvis & hips", urgency: "urgent" },
  { id: "wrong-side-wrist", title: "Wrist — query laterality", clinicalHistory: "History states right wrist injury, but the request specifies the left wrist. Query before exposure.", requestedProjections: ["pa-wrist"], requestedViewsLabel: "Left wrist", requestedLaterality: "left", correctLaterality: "right", patientId: "amara", isValid: false, rejectionReason: "The clinical history identifies the right wrist. The request should be amended before exposure.", pathologyId: "distal-radius-fracture", region: "Upper limb", urgency: "urgent" },
];

export const REQUEST_BANK: ImagingRequest[] = [...chestCases, ...additionalRequests];

export function requestFromBank(id: string) { return REQUEST_BANK.find((request) => request.id === id); }
