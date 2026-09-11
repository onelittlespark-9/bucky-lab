import type { PlacementMode } from "./types";
import { projectionById } from "./projections";

export type ExtremityTarget = "hand" | "wrist" | "elbow" | "shoulder" | "foot" | "ankle" | "knee" | null;
export type Side = -1 | 1;

export interface ExtremityPlacement {
  target: ExtremityTarget;
  side: Side | null;
  onDetector: boolean;
  detectorTilt: number;
}

/**
 * Converts an imaging request into a small amount of positioning intent shared
 * by skin, soft tissue and skeleton. Missing laterality is deliberately neutral:
 * the simulator must not invent a side.
 */
export function extremityPlacement(
  projectionId: string,
  placement: PlacementMode,
  buckyTilt: number,
): ExtremityPlacement {
  const p = projectionById(projectionId);
  const id = projectionId.toLowerCase();
  const name = p.name.toLowerCase();
  const text = `${id} ${name}`;
  let target: ExtremityTarget = null;
  if (text.includes("hand")) target = "hand";
  else if (text.includes("wrist")) target = "wrist";
  else if (text.includes("elbow")) target = "elbow";
  else if (text.includes("shoulder")) target = "shoulder";
  else if (text.includes("foot")) target = "foot";
  else if (text.includes("ankle")) target = "ankle";
  else if (text.includes("knee")) target = "knee";

  const laterality = p.laterality;
  const side: Side | null = laterality === "right" ? 1 : laterality === "left" ? -1 : null;
  const extremity = target !== null;
  const onDetector = extremity && (placement === "upright-bucky" || placement === "standing" || placement === "seated" || placement === "table") && Math.abs(buckyTilt) > 45;

  return { target, side, onDetector, detectorTilt: buckyTilt };
}

/** Whether this is a projection where the learner should be asked to confirm a side. */
export function requiresLateralityConfirmation(projectionId: string): boolean {
  const p = projectionById(projectionId);
  const id = projectionId.toLowerCase();
  const name = p.name.toLowerCase();
  return /hand|wrist|elbow|shoulder|foot|ankle|knee|hip/.test(`${id} ${name}`) && p.laterality == null;
}
