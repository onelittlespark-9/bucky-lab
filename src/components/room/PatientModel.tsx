import { HumanAtlasBodyOverlay } from "./HumanAtlasBodyOverlay";
import { InternalAnatomy } from "./InternalAnatomy";
import { HumanAtlasSkeletalOverlay } from "./HumanAtlasSkeletalOverlay";

/**
 * One patient, one scene-space rig, multiple anatomical layers.
 *
 * The layers are deliberately mounted together even when their visibility is
 * off. This means skin, fat, muscle, organs and skeleton all inherit the same
 * PatientRig placement/rotation and can be revealed later without spawning a
 * second, independently positioned patient.
 */
export function PatientModel() {
  return (
    <group name="BuckyLab-cohesive-patient">
      <HumanAtlasBodyOverlay />
      <InternalAnatomy />
      <HumanAtlasSkeletalOverlay />
    </group>
  );
}
