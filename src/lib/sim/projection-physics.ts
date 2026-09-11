import type { FocalSpot, Projection, SimPose, TubeState } from "./types";

export interface ProjectionGeometry {
  magnification: number;
  oidCm: number;
  sodCm: number;
  geometricUnsharpnessMm: number;
  projectedOffsetCm: number;
  rotationPenalty: number;
  effectiveObjectScale: number;
  distortionIndex: number;
  tubeAngleRad: number;
}

// Bucky Lab uses a fixed 1.0 mm focal spot. Focal spot is deliberately not a learner control.
const FIXED_FOCAL_SPOT_MM = 1.0;

/**
 * Projection-geometry teaching model.
 * SID/OID/SOD drive magnification and geometric unsharpness; tube angulation
 * changes the projected relationship rather than arbitrarily changing OID.
 * The OID values are representative simulator geometry, not patient-dose data.
 */
export function projectionGeometry(
  projection: Projection,
  tube: TubeState,
  pose: SimPose,
  _focalSpot?: FocalSpot,
): ProjectionGeometry {
  const sidCm = Math.max(60, tube.sid);
  const oidCm = projection.setup === "tabletop"
    ? 2.0
    : projection.anatomy === "torso-lat" || projection.anatomy === "skull-lat"
      ? 4.0
      : projection.grid
        ? 3.5
        : 2.5;
  const oid = Math.min(oidCm, sidCm * 0.35);
  const sodCm = Math.max(1, sidCm - oid);
  const magnification = sidCm / sodCm;
  const geometricUnsharpnessMm = FIXED_FOCAL_SPOT_MM * (oid / sodCm);

  const tubeAngleRad = (tube.angle * Math.PI) / 180;
  const rotationRad = (pose.rotationY * Math.PI) / 180;
  const obliqueRad = (pose.oblique * Math.PI) / 180;

  // Angulation produces a projected displacement of the anatomy across the detector.
  // Patient rotation/obliquity additionally changes the effective projection geometry.
  const angleOffsetCm = Math.abs(Math.tan(tubeAngleRad)) * oid;
  const rotationOffsetCm = Math.abs(Math.sin(rotationRad)) * oid;
  const obliqueOffsetCm = Math.abs(Math.sin(obliqueRad)) * oid * 0.5;
  const projectedOffsetCm = angleOffsetCm + rotationOffsetCm + obliqueOffsetCm;

  const rotationPenalty = Math.min(
    1,
    Math.abs(Math.sin(rotationRad)) * 0.8 + Math.abs(Math.sin(obliqueRad)) * 0.45,
  );
  const anglePenalty = Math.min(0.45, Math.abs(Math.sin(tubeAngleRad)) * 0.35);
  const distortionIndex = Math.min(
    1,
    (magnification - 1) * 2.2 + rotationPenalty * 0.55 + anglePenalty,
  );

  return {
    magnification,
    oidCm: oid,
    sodCm,
    geometricUnsharpnessMm,
    projectedOffsetCm,
    rotationPenalty,
    effectiveObjectScale: magnification * (1 + rotationPenalty * 0.12),
    distortionIndex,
    tubeAngleRad,
  };
}

export { FIXED_FOCAL_SPOT_MM };
