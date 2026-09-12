import { HumanAtlasBodyOverlay } from "./HumanAtlasBodyOverlay";
import { HumanAtlasTissueOverlay } from "./HumanAtlasTissueOverlay";
import { InternalAnatomy } from "./InternalAnatomy";
import { HumanAtlasSkeletalOverlay } from "./HumanAtlasSkeletalOverlay";

/** One cohesive patient: every anatomical layer inherits the same PatientRig. */
export function PatientModel() {
  return (
    <group name="BuckyLab-cohesive-patient">
      <HumanAtlasBodyOverlay />
      <HumanAtlasTissueOverlay />
      <InternalAnatomy />
      <HumanAtlasSkeletalOverlay />
    </group>
  );
}
