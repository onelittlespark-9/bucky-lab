export type Habitus = "asthenic" | "hyposthenic" | "sthenic" | "hypersthenic";
export type Sex = "female" | "male";
export type Recumbency = "erect" | "supine";
export type Setup = "wall" | "table" | "tabletop";
export type AnatomyKind =
  | "torso-ap"
  | "torso-lat"
  | "hand-pa"
  | "wrist-pa"
  | "elbow-ap"
  | "shoulder-ap"
  | "knee-ap"
  | "knee-lat"
  | "foot-dp"
  | "ankle-ap"
  | "skull-lat"
  | "cspine-lat";
export type Region =
  | "Thorax"
  | "Abdomen"
  | "Pelvis & hips"
  | "Spine"
  | "Upper limb"
  | "Lower limb"
  | "Skull";
export type Screen = "library" | "room" | "viewer";
export type Mode = "practice" | "assessment";
export type Breath = "inspiration" | "expiration";
export type FocalSpot = "fine" | "broad";
export type Marker = "L" | "R" | null;
export type Grade = "excellent" | "acceptable" | "repeat";

export interface Patient {
  id: string;
  name: string;
  age: number;
  sex: Sex;
  habitus: Habitus;
  heightCm: number;
  weightKg: number;
  skin: string;
  hair: string;
  gown: string;
  /** AP part thickness at chest / abdomen / pelvis / extremity, cm */
  thickness: {
    chest: number;
    abdomen: number;
    pelvis: number;
    cspine: number;
    lumbar: number;
    skull: number;
    extremity: number;
    shoulder: number;
    knee: number;
  };
  /** Morphs for the 3D model (1 = sthenic male-ish). */
  morph: {
    torsoWidth: number;
    torsoDepth: number;
    torsoLength: number;
    limb: number;
    shoulder: number;
    hip: number;
    abdomen: number;
    kyphosis: number;
    breast: number;
  };
  notes: string;
}

export interface Landmark {
  id: string;
  label: string;
  /** cm from vertex along the long axis of the body */
  y: number;
  /** cm from midline, + patient left */
  x: number;
}

export interface Projection {
  id: string;
  name: string;
  shortName: string;
  region: Region;
  anatomy: AnatomyKind;
  setup: Setup;
  recumbency: Recumbency;
  laterality?: "left" | "right";
  irW: number;
  irH: number;
  grid: boolean;
  sidCm: number;
  tubeAngle: number;
  kvp: number;
  mas: number;
  collimationW: number;
  collimationH: number;
  /** Handbook centring, cm from vertex (y) and midline (x) */
  cr: { x: number; y: number };
  landmarkId: string;
  centring: string;
  position: string;
  beam: string;
  collimation: string;
  criteria: string[];
  include: string[];
  respiration?: Breath;
  referenceImage?: string;
  /** Extra FOV around the photo, as fraction of image */
  photoBounds?: { x0: number; y0: number; x1: number; y1: number };
}

export interface SimPose {
  recumbency: Recumbency;
  rotationY: number;
  oblique: number;
  chinUp: number;
  shoulderRoll: number;
  armRaise: number;
  elbowFlex: number;
  kneeFlex: number;
  hipInternal: number;
  breath: Breath;
}

export interface TubeState {
  crY: number;
  crX: number;
  sid: number;
  angle: number;
  collimationW: number;
  collimationH: number;
}

export interface ExposureState {
  kvp: number;
  mas: number;
  grid: boolean;
  focalSpot: FocalSpot;
  marker: Marker;
}

export interface CriterionScore {
  id: string;
  label: string;
  grade: Grade;
  detail: string;
  weight: number;
}

export interface ExposureMetrics {
  ei: number;
  eiStatus: "under" | "optimal" | "over";
  noise: number;
  contrast: number;
  saturation: number;
  dap: number;
  entranceDose: number;
  predictedEI: number;
}

export interface RadiographResult {
  metrics: ExposureMetrics;
  scores: CriterionScore[];
  overall: number;
  overallGrade: Grade;
  width: number;
  height: number;
  dataUrl: string;
}
