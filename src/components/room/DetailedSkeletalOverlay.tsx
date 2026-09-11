import { HumanAtlasSkeletalOverlay } from "./HumanAtlasSkeletalOverlay";

/**
 * Compatibility wrapper retained so the room scene does not need to know
 * which anatomical source supplies the skeletal geometry.
 */
export function DetailedSkeletalOverlay() {
  return <HumanAtlasSkeletalOverlay />;
}
