export const FLOOR_Y = 0;
export const UPRIGHT_IR_HEIGHT_MIN = 0.32;
export const UPRIGHT_IR_HEIGHT_MAX = 1.85;
export const UPRIGHT_IR_HEIGHT = 0.62;

/**
 * Centre height of the upright IR needed to place the requested CR on the
 * patient's anatomy. Height is measured from the floor to the patient's
 * vertex; crY is measured downwards from the vertex, matching LANDMARKS.
 */
export function recommendedBuckyHeight(patientHeightCm: number, crYcm: number): number {
  const patientHeightM = Math.max(0.5, patientHeightCm / 100);
  const crHeight = patientHeightM - crYcm / 100;
  return Math.max(UPRIGHT_IR_HEIGHT_MIN, Math.min(UPRIGHT_IR_HEIGHT_MAX, crHeight));
}

/** Keep an upright patient's feet on, or above, the floor. */
export function clampStandingPatientY(value: number): number {
  return Math.max(FLOOR_Y, Math.min(0.35, value));
}
