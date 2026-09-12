import { HumanAtlasBodyOverlay } from "./HumanAtlasBodyOverlay";

/**
 * Patient surface only.
 *
 * Positioning is deliberately landmark-free: the learner must use the
 * patient's visible anatomy rather than artificial dots/markers. Internal
 * anatomy is rendered by the exposure/result workflow, not on the patient.
 */
export function PatientModel() {
  return <HumanAtlasBodyOverlay />;
}
