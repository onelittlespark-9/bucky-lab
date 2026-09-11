import type { PlacementMode } from "./types";
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
