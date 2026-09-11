export type MuscleId =
  | "pectoralis-major-left"
  | "pectoralis-major-right"
  | "pectoralis-minor-left"
  | "pectoralis-minor-right"
  | "intercostals-left"
  | "intercostals-right"
  | "rectus-abdominis-left"
  | "rectus-abdominis-right"
  | "external-oblique-left"
  | "external-oblique-right"
  | "latissimus-dorsi-left"
  | "latissimus-dorsi-right"
  | "trapezius-left"
  | "trapezius-right"
  | "deltoid-left"
  | "deltoid-right"
  | "biceps-left"
  | "biceps-right"
  | "triceps-left"
  | "triceps-right"
  | "forearm-left"
  | "forearm-right"
  | "gluteus-left"
  | "gluteus-right"
  | "quadriceps-left"
  | "quadriceps-right"
  | "hamstring-left"
  | "hamstring-right"
  | "gastrocnemius-left"
  | "gastrocnemius-right";

export interface MuscleSegment {
  id: MuscleId;
  group: "chest" | "back" | "abdomen" | "arm" | "gluteal" | "thigh" | "calf";
  side: "left" | "right";
  originCm: [number, number, number];
  insertionCm: [number, number, number];
  widthCm: number;
  depthCm: number;
  bulk: number;
}

const m = (id: MuscleId, group: MuscleSegment["group"], side: MuscleSegment["side"], originCm: [number, number, number], insertionCm: [number, number, number], widthCm: number, depthCm: number, bulk = 1): MuscleSegment => ({ id, group, side, originCm, insertionCm, widthCm, depthCm, bulk });

export const MUSCLE_SEGMENTS: MuscleSegment[] = [
  m("pectoralis-major-left", "chest", "left", [-1, 27, 5], [-8, 42, 7], 8.5, 2.4, 1.15),
  m("pectoralis-major-right", "chest", "right", [1, 27, 5], [8, 42, 7], 8.5, 2.4, 1.15),
  m("pectoralis-minor-left", "chest", "left", [-1, 30, 4], [-6, 35, 6], 4.5, 1.5, .72),
  m("pectoralis-minor-right", "chest", "right", [1, 30, 4], [6, 35, 6], 4.5, 1.5, .72),
  m("intercostals-left", "chest", "left", [-3, 29, 2], [-12, 54, 1], 9.5, 1.1, .5),
  m("intercostals-right", "chest", "right", [3, 29, 2], [12, 54, 1], 9.5, 1.1, .5),
  m("rectus-abdominis-left", "abdomen", "left", [-3.5, 45, 5], [-3.5, 69, 5], 3.5, 2.0, .9),
  m("rectus-abdominis-right", "abdomen", "right", [3.5, 45, 5], [3.5, 69, 5], 3.5, 2.0, .9),
  m("external-oblique-left", "abdomen", "left", [-11, 43, 1], [-5, 72, 4], 7, 2.3, .82),
  m("external-oblique-right", "abdomen", "right", [11, 43, 1], [5, 72, 4], 7, 2.3, .82),
  m("latissimus-dorsi-left", "back", "left", [-13, 39, -3], [-7, 69, -3], 13, 2.8, 1),
  m("latissimus-dorsi-right", "back", "right", [13, 39, -3], [7, 69, -3], 13, 2.8, 1),
  m("trapezius-left", "back", "left", [-1, 22, -4], [-12, 37, -4], 9, 2.4, .9),
  m("trapezius-right", "back", "right", [1, 22, -4], [12, 37, -4], 9, 2.4, .9),
  m("deltoid-left", "arm", "left", [-14, 34, 2], [-18, 44, 1], 5, 4, 1),
  m("deltoid-right", "arm", "right", [14, 34, 2], [18, 44, 1], 5, 4, 1),
  m("biceps-left", "arm", "left", [-18, 40, 1], [-19, 58, 1], 4, 3, .85),
  m("biceps-right", "arm", "right", [18, 40, 1], [19, 58, 1], 4, 3, .85),
  m("triceps-left", "arm", "left", [-18, 40, -1], [-19, 58, -1], 4, 3, .85),
  m("triceps-right", "arm", "right", [18, 40, -1], [19, 58, -1], 4, 3, .85),
  m("forearm-left", "arm", "left", [-19, 57, 1], [-19, 76, 1], 3.2, 2.4, .7),
  m("forearm-right", "arm", "right", [19, 57, 1], [19, 76, 1], 3.2, 2.4, .7),
  m("gluteus-left", "gluteal", "left", [-8, 67, -4], [-8, 82, -4], 8, 5, 1.2),
  m("gluteus-right", "gluteal", "right", [8, 67, -4], [8, 82, -4], 8, 5, 1.2),
  m("quadriceps-left", "thigh", "left", [-8, 80, 2], [-8, 105, 2], 7, 5, 1.1),
  m("quadriceps-right", "thigh", "right", [8, 80, 2], [8, 105, 2], 7, 5, 1.1),
  m("hamstring-left", "thigh", "left", [-8, 80, -2], [-8, 105, -2], 6, 4, .95),
  m("hamstring-right", "thigh", "right", [8, 80, -2], [8, 105, -2], 6, 4, .95),
  m("gastrocnemius-left", "calf", "left", [-8, 106, -1], [-8, 130, -1], 5.5, 4, .95),
  m("gastrocnemius-right", "calf", "right", [8, 106, -1], [8, 130, -1], 5.5, 4, .95),
];

export const MUSCLE_GROUPS = ["chest", "back", "abdomen", "arm", "gluteal", "thigh", "calf"] as const;
export type MuscleGroup = typeof MUSCLE_GROUPS[number];

export const ALL_ANATOMY_LAYERS = ["skin", "fat", "muscle", "organs", "skeleton"] as const;
export type AnatomyLayer = typeof ALL_ANATOMY_LAYERS[number];

export const DEFAULT_ANATOMY_VISIBILITY: Record<AnatomyLayer, boolean> = {
  skin: true,
  fat: true,
  muscle: true,
  organs: true,
  skeleton: true,
};
