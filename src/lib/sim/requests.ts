import type { Patient } from "./types";
import { PATIENTS } from "./patients";

export type PathologyId =
  | "none"
  | "distal-radius-fracture"
  | "scaphoid-fracture"
  | "pneumothorax"
  | "consolidation"
  | "rib-fracture"
  | "ankle-fracture"
  | "tib-fib-fracture"
  | "femoral-neck-fracture"
  | "humeral-shaft-fracture"
  | "olecranon-fracture"
  | "patella-fracture"
  | "foreign-body"
  | "soft-tissue-swelling";

export interface Pathology {
  id: PathologyId;
  name: string;
  description: string;
  regions: string[];
}

export const PATHOLOGIES: Record<PathologyId, Pathology> = {
  none: {
    id: "none",
    name: "No acute pathology",
    description: "No acute bony or significant soft-tissue abnormality demonstrated.",
    regions: [],
  },
  "distal-radius-fracture": {
    id: "distal-radius-fracture",
    name: "Distal radius fracture (Colles-type)",
    description: "Transverse fracture of the distal radius with dorsal angulation of the distal fragment.",
    regions: ["wrist-pa", "hand-pa"],
  },
  "scaphoid-fracture": {
    id: "scaphoid-fracture",
    name: "Scaphoid waist fracture",
    description: "Undisplaced fracture through the waist of the scaphoid.",
    regions: ["wrist-pa", "hand-pa"],
  },
  pneumothorax: {
    id: "pneumothorax",
    name: "Right apical pneumothorax",
    description: "Small right apical pneumothorax with visible visceral pleural line.",
    regions: ["torso-ap", "torso-lat"],
  },
  consolidation: {
    id: "consolidation",
    name: "Right lower lobe consolidation",
    description: "Airspace opacification in the right lower lobe consistent with pneumonia.",
    regions: ["torso-ap", "torso-lat"],
  },
  "rib-fracture": {
    id: "rib-fracture",
    name: "Left 6th rib fracture",
    description: "Non-displaced fracture of the left 6th rib in the mid-axillary line.",
    regions: ["torso-ap", "torso-lat"],
  },
  "ankle-fracture": {
    id: "ankle-fracture",
    name: "Lateral malleolus fracture",
    description: "Weber B fracture of the lateral malleolus.",
    regions: ["ankle-ap", "foot-dp"],
  },
  "tib-fib-fracture": {
    id: "tib-fib-fracture",
    name: "Spiral fracture of the tibia",
    description: "Spiral fracture of the mid-tibial diaphysis with associated fibular fracture.",
    regions: ["knee-ap", "ankle-ap"],
  },
  "femoral-neck-fracture": {
    id: "femoral-neck-fracture",
    name: "Intracapsular femoral neck fracture",
    description: "Garden III intracapsular fracture of the femoral neck.",
    regions: ["torso-ap"],
  },
  "humeral-shaft-fracture": {
    id: "humeral-shaft-fracture",
    name: "Humeral shaft fracture",
    description: "Transverse fracture of the mid-humeral diaphysis.",
    regions: ["shoulder-ap", "elbow-ap"],
  },
  "olecranon-fracture": {
    id: "olecranon-fracture",
    name: "Olecranon fracture",
    description: "Displaced fracture of the olecranon with joint involvement.",
    regions: ["elbow-ap"],
  },
  "patella-fracture": {
    id: "patella-fracture",
    name: "Transverse patella fracture",
    description: "Transverse fracture of the patella with mild separation of fragments.",
    regions: ["knee-ap", "knee-lat"],
  },
  "foreign-body": {
    id: "foreign-body",
    name: "Radiopaque foreign body",
    description: "Small radiopaque foreign body in the soft tissues.",
    regions: ["hand-pa", "wrist-pa", "foot-dp"],
  },
  "soft-tissue-swelling": {
    id: "soft-tissue-swelling",
    name: "Soft-tissue swelling",
    description: "Marked soft-tissue swelling overlying the injured region.",
    regions: ["wrist-pa", "ankle-ap", "hand-pa", "knee-ap"],
  },
};

export interface ImagingRequest {
  id: string;
  title: string;
  clinicalHistory: string;
  /** Must be existing projection IDs from projections.ts */
  requestedProjections: string[];
  requestedViewsLabel: string;
  requestedLaterality?: "left" | "right" | "bilateral" | null;
  correctLaterality?: "left" | "right" | "bilateral" | null;
  patientId: string;
  isValid: boolean;
  rejectionReason?: string;
  pathologyId: PathologyId;
  region: string;
  urgency?: "routine" | "urgent" | "stat";
}

/**
 * 20 imaging requests using ONLY projection IDs that currently exist.
 * Only 1 is deliberately invalid (~5%).
 */
export const IMAGING_REQUESTS: ImagingRequest[] = [
  // 1. INVALID – FOOSH wrong side
  {
    id: "req-foosh-wrong-side",
    title: "Wrist – FOOSH",
    clinicalHistory:
      "Fall on outstretched hand (FOOSH) onto the right side. Swelling and ecchymosis of the right wrist. ?#",
    requestedProjections: ["pa-wrist"],
    requestedViewsLabel: "Left wrist PA and lateral",
    requestedLaterality: "left",
    correctLaterality: "right",
    patientId: "amara",
    isValid: false,
    rejectionReason:
      "The clinical history clearly describes a right-sided injury (FOOSH onto the right side with swelling and ecchymosis of the right wrist). The request asks for the left wrist. The request must be amended to right wrist PA and lateral before the examination proceeds.",
    pathologyId: "none",
    region: "Upper limb",
    urgency: "urgent",
  },

  // 2. Chest – acute
  {
    id: "req-chest-sob",
    title: "Chest – shortness of breath",
    clinicalHistory:
      "48-year-old with increasing shortness of breath and right-sided pleuritic chest pain for 2 days. ?pneumonia / ?PE",
    requestedProjections: ["pa-chest", "lat-chest"],
    requestedViewsLabel: "PA and left lateral chest",
    requestedLaterality: null,
    patientId: "tomas",
    isValid: true,
    pathologyId: "consolidation",
    region: "Thorax",
    urgency: "urgent",
  },

  // 3. Wrist / scaphoid (using existing pa-wrist)
  {
    id: "req-scaphoid",
    title: "Scaphoid series",
    clinicalHistory:
      "Fall onto outstretched left hand yesterday. Anatomical snuffbox tenderness. ?scaphoid fracture",
    requestedProjections: ["pa-wrist"],
    requestedViewsLabel: "Left scaphoid series (PA, oblique, lateral + dedicated scaphoid view)",
    requestedLaterality: "left",
    correctLaterality: "left",
    patientId: "elise",
    isValid: true,
    pathologyId: "scaphoid-fracture",
    region: "Upper limb",
    urgency: "urgent",
  },

  // 4. Shoulder / humerus (using ap-shoulder)
  {
    id: "req-humerus",
    title: "Humerus / shoulder – trauma",
    clinicalHistory:
      "Direct blow to the right upper arm in a football match. Pain and inability to move the arm. ?humeral shaft fracture",
    requestedProjections: ["ap-shoulder"],
    requestedViewsLabel: "Right humerus / shoulder AP and lateral",
    requestedLaterality: "right",
    correctLaterality: "right",
    patientId: "malik",
    isValid: true,
    pathologyId: "humeral-shaft-fracture",
    region: "Upper limb",
    urgency: "urgent",
  },

  // 5. Hip / femur
  {
    id: "req-femur",
    title: "Hip / femur – fall",
    clinicalHistory:
      "Elderly patient fell onto the right side. Pain in the right thigh and inability to weight-bear. ?femoral fracture",
    requestedProjections: ["ap-hip", "ap-pelvis"],
    requestedViewsLabel: "Right hip AP + AP pelvis",
    requestedLaterality: "right",
    correctLaterality: "right",
    patientId: "ruth",
    isValid: true,
    pathologyId: "femoral-neck-fracture",
    region: "Pelvis & hips",
    urgency: "urgent",
  },

  // 6. Knee / tib-fib area
  {
    id: "req-tibfib",
    title: "Tibia & fibula / knee",
    clinicalHistory:
      "Twisting injury to the left leg while running. Mid-shaft pain and swelling. ?tibial fracture",
    requestedProjections: ["ap-knee", "lat-knee"],
    requestedViewsLabel: "Left tibia/fibula and knee AP and lateral",
    requestedLaterality: "left",
    correctLaterality: "left",
    patientId: "malik",
    isValid: true,
    pathologyId: "tib-fib-fracture",
    region: "Lower limb",
    urgency: "urgent",
  },

  // 7. Facial / skull area (using skull-lat for now)
  {
    id: "req-facial",
    title: "Facial bones",
    clinicalHistory:
      "Assault. Blow to the face. Pain over the left zygoma and periorbital swelling. ?zygomatic fracture",
    requestedProjections: ["skull-lat"],
    requestedViewsLabel: "Facial bones – OM and lateral",
    requestedLaterality: null,
    patientId: "tomas",
    isValid: true,
    pathologyId: "none",
    region: "Skull",
    urgency: "urgent",
  },

  // 8. Ankle / foot
  {
    id: "req-ankle",
    title: "Ankle – inversion injury",
    clinicalHistory:
      "Inversion injury to the right ankle. Swelling and bruising over the lateral malleolus. Ottawa ankle rules positive.",
    requestedProjections: ["dp-foot"],
    requestedViewsLabel: "Right ankle AP, mortise and lateral",
    requestedLaterality: "right",
    correctLaterality: "right",
    patientId: "amara",
    isValid: true,
    pathologyId: "ankle-fracture",
    region: "Lower limb",
    urgency: "urgent",
  },

  // 9. Knee
  {
    id: "req-knee",
    title: "Knee – trauma",
    clinicalHistory:
      "Fall onto the left knee. Pain and inability to straight-leg raise. ?patella fracture",
    requestedProjections: ["ap-knee", "lat-knee"],
    requestedViewsLabel: "Left knee AP and lateral",
    requestedLaterality: "left",
    correctLaterality: "left",
    patientId: "gordon",
    isValid: true,
    pathologyId: "patella-fracture",
    region: "Lower limb",
    urgency: "urgent",
  },

  // 10. Shoulder
  {
    id: "req-shoulder",
    title: "Shoulder – dislocation?",
    clinicalHistory:
      "Fall onto the outstretched right arm. Pain and loss of contour of the shoulder. ?dislocation / ?fracture",
    requestedProjections: ["ap-shoulder"],
    requestedViewsLabel: "Right shoulder AP and axial",
    requestedLaterality: "right",
    correctLaterality: "right",
    patientId: "tomas",
    isValid: true,
    pathologyId: "none",
    region: "Upper limb",
    urgency: "urgent",
  },

  // 11. Lumbar spine
  {
    id: "req-lumbar",
    title: "Lumbar spine – back pain",
    clinicalHistory: "Acute low back pain after lifting. No red flags. Pain radiating to the right buttock.",
    requestedProjections: ["ap-lumbar", "lat-lumbar"],
    requestedViewsLabel: "Lumbar spine AP and lateral",
    requestedLaterality: null,
    patientId: "gordon",
    isValid: true,
    pathologyId: "none",
    region: "Spine",
    urgency: "routine",
  },

  // 12. Elbow
  {
    id: "req-elbow",
    title: "Elbow – FOOSH",
    clinicalHistory:
      "Fall on outstretched left hand. Pain and swelling around the elbow. ?olecranon or radial head fracture",
    requestedProjections: ["ap-elbow"],
    requestedViewsLabel: "Left elbow AP and lateral",
    requestedLaterality: "left",
    correctLaterality: "left",
    patientId: "elise",
    isValid: true,
    pathologyId: "olecranon-fracture",
    region: "Upper limb",
    urgency: "urgent",
  },

  // 13. Foot
  {
    id: "req-foot",
    title: "Foot – trauma",
    clinicalHistory:
      "Dropped a heavy object onto the right foot. Pain over the midfoot and base of the 5th metatarsal.",
    requestedProjections: ["dp-foot"],
    requestedViewsLabel: "Right foot DP, oblique and lateral",
    requestedLaterality: "right",
    correctLaterality: "right",
    patientId: "malik",
    isValid: true,
    pathologyId: "none",
    region: "Lower limb",
    urgency: "urgent",
  },

  // 14. C-spine
  {
    id: "req-cspine",
    title: "Cervical spine – trauma",
    clinicalHistory:
      "High-speed RTA. Midline cervical tenderness. Hard collar in situ. ?C-spine injury",
    requestedProjections: ["lat-cspine"],
    requestedViewsLabel: "Lateral cervical spine (horizontal beam)",
    requestedLaterality: null,
    patientId: "tomas",
    isValid: true,
    pathologyId: "none",
    region: "Spine",
    urgency: "stat",
  },

  // 15. Hand
  {
    id: "req-hand",
    title: "Hand – punch injury",
    clinicalHistory:
      "Punched a wall with the right hand. Pain and swelling over the 5th metacarpal. ?boxer's fracture",
    requestedProjections: ["pa-hand"],
    requestedViewsLabel: "Right hand PA, oblique and lateral",
    requestedLaterality: "right",
    correctLaterality: "right",
    patientId: "malik",
    isValid: true,
    pathologyId: "none",
    region: "Upper limb",
    urgency: "urgent",
  },

  // 16. Hip / NOF
  {
    id: "req-hip",
    title: "Hip – fall",
    clinicalHistory:
      "79-year-old fell onto the left side. Shortened and externally rotated left leg. ?neck of femur fracture",
    requestedProjections: ["ap-pelvis", "ap-hip"],
    requestedViewsLabel: "AP pelvis + left hip AP and lateral",
    requestedLaterality: "left",
    correctLaterality: "left",
    patientId: "ruth",
    isValid: true,
    pathologyId: "femoral-neck-fracture",
    region: "Pelvis & hips",
    urgency: "stat",
  },

  // 17. Abdomen
  {
    id: "req-abdomen",
    title: "Abdomen – acute pain",
    clinicalHistory: "Sudden onset severe abdominal pain and distension. ?obstruction / ?perforation",
    requestedProjections: ["ap-abdomen"],
    requestedViewsLabel: "AP abdomen (supine)",
    requestedLaterality: null,
    patientId: "gordon",
    isValid: true,
    pathologyId: "none",
    region: "Abdomen",
    urgency: "urgent",
  },

  // 18. Wrist valid
  {
    id: "req-wrist-valid",
    title: "Wrist – FOOSH (correct side)",
    clinicalHistory: "Fall on outstretched right hand. Dinner-fork deformity. ?Colles fracture",
    requestedProjections: ["pa-wrist"],
    requestedViewsLabel: "Right wrist PA and lateral",
    requestedLaterality: "right",
    correctLaterality: "right",
    patientId: "amara",
    isValid: true,
    pathologyId: "distal-radius-fracture",
    region: "Upper limb",
    urgency: "urgent",
  },

  // 19. Chest pre-op
  {
    id: "req-chest-preop",
    title: "Chest – pre-operative",
    clinicalHistory: "Pre-operative chest radiograph for elective hip replacement. No respiratory symptoms.",
    requestedProjections: ["pa-chest"],
    requestedViewsLabel: "PA chest",
    requestedLaterality: null,
    patientId: "ruth",
    isValid: true,
    pathologyId: "none",
    region: "Thorax",
    urgency: "routine",
  },

  // 20. Another lower limb
  {
    id: "req-knee-2",
    title: "Knee – direct blow",
    clinicalHistory: "Direct blow to the right knee. Localised pain and swelling. ?fracture",
    requestedProjections: ["ap-knee", "lat-knee"],
    requestedViewsLabel: "Right knee AP and lateral",
    requestedLaterality: "right",
    correctLaterality: "right",
    patientId: "tomas",
    isValid: true,
    pathologyId: "none",
    region: "Lower limb",
    urgency: "urgent",
  },
];

export function requestById(id: string): ImagingRequest | undefined {
  return IMAGING_REQUESTS.find((r) => r.id === id);
}

export function getPatientForRequest(req: ImagingRequest): Patient {
  return PATIENTS.find((p) => p.id === req.patientId) ?? PATIENTS[2]!;
}
