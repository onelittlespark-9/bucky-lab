import {useCallback,useState} from "react";
import { HumanAtlasBodyOverlay } from "./HumanAtlasBodyOverlay";
import { HumanAtlasTissueOverlay } from "./HumanAtlasTissueOverlay";
import { InternalAnatomy } from "./InternalAnatomy";
import { HumanAtlasSkeletalOverlay } from "./HumanAtlasSkeletalOverlay";
import {PatientAnatomyView} from "./PatientAnatomyView";
/** The room is now a view of PatientAnatomy. Legacy atlas/procedural layers are
 * retained only when no authoritative volume exists for the selected patient/case. */
export function PatientModel(){const[authoritative,setAuthoritative]=useState(false),availability=useCallback((ready:boolean)=>setAuthoritative(ready),[]);return <group name="BuckyLab-patient-anatomy"><PatientAnatomyView onAvailability={availability}/>{!authoritative&&<><HumanAtlasBodyOverlay/><HumanAtlasTissueOverlay/><InternalAnatomy/><HumanAtlasSkeletalOverlay/></>}</group>;}
