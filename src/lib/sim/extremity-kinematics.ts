import type { PlacementMode, SimPose } from "./types";
import { projectionById } from "./projections";

export type ExtremityTarget = "hand" | "wrist" | "elbow" | "shoulder" | "foot" | "ankle" | "knee" | "hip" | null;
export type Side = -1 | 1;

export interface ExtremityPlacement {
  target: ExtremityTarget;
  side: Side | null;
  onDetector: boolean;
  detectorTilt: number;
}

/** Shared positioning intent. Missing laterality stays neutral rather than being invented. */
export function extremityPlacement(projectionId: string, placement: PlacementMode, buckyTilt: number): ExtremityPlacement {
  const p = projectionById(projectionId);
  const text = `${projectionId} ${p.name}`.toLowerCase();
  let target: ExtremityTarget = null;
  if (text.includes("hand")) target = "hand";
  else if (text.includes("wrist")) target = "wrist";
  else if (text.includes("elbow")) target = "elbow";
  else if (text.includes("shoulder")) target = "shoulder";
  else if (text.includes("foot")) target = "foot";
  else if (text.includes("ankle")) target = "ankle";
  else if (text.includes("knee")) target = "knee";
  else if (text.includes("hip")) target = "hip";

  const side: Side | null = p.laterality === "right" ? 1 : p.laterality === "left" ? -1 : null;
  return { target, side, onDetector: target !== null && Math.abs(buckyTilt) >= 45, detectorTilt: buckyTilt };
}

/** Whether this is a projection where the learner should be asked to confirm a side. */
export function requiresLateralityConfirmation(projectionId: string): boolean {
  const p = projectionById(projectionId);
  const text = `${projectionId} ${p.name}`.toLowerCase();
  return /hand|wrist|elbow|shoulder|foot|ankle|knee|hip/.test(text) && p.laterality == null;
}

/** Apply only the relevant extremity-chain pose when a tilted Bucky is being used. */
export function poseForExtremityPlacement(projectionId: string, placement: PlacementMode, buckyTilt: number, base: SimPose): SimPose {
  const intent = extremityPlacement(projectionId, placement, buckyTilt);
  if (!intent.target || !intent.onDetector) return base;
  switch (intent.target) {
    case "hand":
    case "wrist":
      return { ...base, armRaise: 0.72, elbowFlex: 0 };
    case "elbow":
      return { ...base, armRaise: 0.35, elbowFlex: 75 };
    case "shoulder":
      return { ...base, armRaise: 0.12, elbowFlex: 15 };
    case "knee":
      return { ...base, kneeFlex: 25 };
    case "foot":
    case "ankle":
      return { ...base, kneeFlex: 8 };
    default:
      return base;
  }
}
