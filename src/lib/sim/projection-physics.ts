import type { FocalSpot, Projection, SimPose, TubeState } from "./types";

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
 * Teaching model for projection geometry. Distances are cm; geometric
 * unsharpness is returned in mm.
 */
export function projectionGeometry(
  projection: Projection,
  tube: TubeState,
  pose: SimPose,
  focalSpot: FocalSpot = "broad",
): ProjectionGeometry {
  const sid = Math.max(1, tube.sid);
  const expectedOid = projection.setup === "tabletop" ? 2.0 : projection.grid ? 4.0 : 2.5;
  const angleRad = (tube.angle * Math.PI) / 180;
  const oidCm = Math.max(0, Math.min(sid * 0.45, expectedOid + Math.abs(Math.sin(angleRad)) * 1.5));
  const magnification = sid / Math.max(0.1, sid - oidCm);

  // Ug = focal spot × OID / SOD. The values are deliberately simple teaching
  // approximations rather than manufacturer-specific focal-spot data.
  const focalSpotMm = focalSpot === "fine" ? 0.6 : 1.2;
  const geometricUnsharpnessMm = focalSpotMm * (oidCm / Math.max(0.1, sid - oidCm));

  const angleOffsetCm = Math.abs(Math.tan(angleRad)) * oidCm;
  const rotationRad = (Math.abs(pose.rotationY) * Math.PI) / 180;
  const obliqueRad = (Math.abs(pose.oblique) * Math.PI) / 180;
  const projectedOffsetCm = angleOffsetCm + Math.sin(rotationRad) * oidCm;
  const rotationPenalty = Math.min(1, Math.sin(Math.min(Math.PI / 2, rotationRad)) + Math.sin(Math.min(Math.PI / 2, obliqueRad)) * 0.5);
  const distortionIndex = Math.min(1, Math.max(0, (magnification - 1) * 2.2) + rotationPenalty * 0.55 + Math.min(0.45, Math.abs(Math.sin(angleRad)) * 0.3));

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
