import type { Projection, SimPose, TubeState } from "./types";

export interface ProjectionGeometry {
  magnification: number;
  oidCm: number;
  geometricUnsharpnessMm: number;
  projectedOffsetCm: number;
  rotationPenalty: number;
  effectiveObjectScale: number;
  distortionIndex: number;
}

/**
 * Geometry model used by the simulator to turn SID/OID, focal spot, tube angle
 * and patient rotation into recognisable radiographic consequences.
 *
 * Distances are expressed in cm; geometric unsharpness is returned in mm.
 */
export function projectionGeometry(
  projection: Projection,
  tube: TubeState,
  pose: SimPose,
): ProjectionGeometry {
  const sid = Math.max(1, tube.sid);
  // The current simulator models the detector plane at the IR and the anatomy
  // a short distance in front of it. Keep OID bounded so unusual user input
  // cannot produce an invalid magnification value.
  const expectedOid = projection.setup === "tabletop" ? 2.0 : projection.grid ? 4.0 : 2.5;
  const angleRad = (tube.angle * Math.PI) / 180;
  const oidCm = Math.max(0, Math.min(sid * 0.45, expectedOid + Math.abs(Math.sin(angleRad)) * 1.5));
  const magnification = sid / Math.max(0.1, sid - oidCm);

  // Ug = focal spot × OID / SOD. Fine focus is approximated at 0.6 mm and
  // broad focus at 1.2 mm for the teaching model.
  const focalSpotMm = 1.2;
  const geometricUnsharpnessMm = focalSpotMm * (oidCm / Math.max(0.1, sid - oidCm));

  const angleOffsetCm = Math.abs(Math.tan(angleRad)) * oidCm;
  const rotationRad = (Math.abs(pose.rotationY) * Math.PI) / 180;
  const obliqueRad = (Math.abs(pose.oblique) * Math.PI) / 180;
  const projectedOffsetCm = angleOffsetCm + Math.sin(rotationRad) * oidCm;
  const rotationPenalty = Math.min(1, Math.sin(Math.min(Math.PI / 2, rotationRad)) + Math.sin(Math.min(Math.PI / 2, obliqueRad)) * 0.5);

  // A compact teaching index: 0 = little geometric distortion, 1 = marked.
  const distortionIndex = Math.min(
    1,
    Math.max(0, (magnification - 1) * 2.2) + rotationPenalty * 0.55 + Math.min(0.45, Math.abs(Math.sin(angleRad)) * 0.3),
  );

  return {
    magnification,
    oidCm,
    geometricUnsharpnessMm,
    projectedOffsetCm,
    rotationPenalty,
    effectiveObjectScale: magnification * (1 + rotationPenalty * 0.12),
    distortionIndex,
  };
}
