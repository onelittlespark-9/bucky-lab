import type { CriterionScore, ExposureMetrics, ExposureState, Patient, Projection, SimPose, TubeState } from "./types";
import { projectionGeometry } from "./projection-physics";
import { scaleLandmarkY } from "./projections";

export type CritiqueSeverity = "good" | "review" | "repeat";
export interface DetailedCritiqueItem {
  id: string;
  heading: string;
  severity: CritiqueSeverity;
  observation: string;
  expected: string;
  correction?: string;
}

function gradeSeverity(score: CriterionScore | undefined): CritiqueSeverity {
  if (!score || score.grade === "excellent") return "good";
  return score.grade === "acceptable" ? "review" : "repeat";
}
function score(scores: CriterionScore[], id: string) { return scores.find(s => s.id === id); }
function item(id:string, heading:string, severity:CritiqueSeverity, observation:string, expected:string, correction?:string):DetailedCritiqueItem {
  return { id, heading, severity, observation, expected, correction };
}

/**
 * Projection-specific final-image critique. These checks intentionally describe
 * what should be visible on the radiograph rather than only whether acquisition
 * numbers were close to presets.
 */
export function detailedRadiographicCritique(args:{
  patient:Patient; projection:Projection; pose:SimPose; tube:TubeState; exposure:ExposureState;
  metrics:ExposureMetrics; scores:CriterionScore[];
}):DetailedCritiqueItem[]{
  const {patient,projection,pose,tube,metrics,scores}=args;
  const out:DetailedCritiqueItem[]=[];
  const anatomy=score(scores,"anatomy-coverage"), centring=score(scores,"centring"), rotation=score(scores,"rotation"), exposureScore=score(scores,"exposure"), collimation=score(scores,"collimation");
  const geometry=projectionGeometry(projection,tube,pose,args.exposure.focalSpot);

  if(projection.id==="pa-chest"){
    const scale=patient.heightCm/170, top=tube.crY-(tube.collimationH/geometry.magnification)/2, bottom=tube.crY+(tube.collimationH/geometry.magnification)/2;
    const apexTarget=20.5*scale, diaphragmTarget=55*scale;
    const rotationSeverity:CritiqueSeverity=Math.abs(pose.rotationY)<=5&&Math.abs(pose.oblique)<=4?"good":Math.abs(pose.rotationY)<=10&&Math.abs(pose.oblique)<=7?"review":"repeat";
    out.push(item("pa-rotation","Rotation",rotationSeverity,rotationSeverity==="good"?"No significant simulated rotation; paired anterior chest landmarks should remain symmetric.":`Patient rotation ${pose.rotationY.toFixed(0)}° with ${pose.oblique.toFixed(0)}° obliquity will displace the sternoclavicular joints relative to the spinous processes.`,"The medial ends of the clavicles / SC joints should be equidistant from the vertebral spinous processes.",rotationSeverity!=="good"?"Re-square the shoulders and MSP to the receptor before exposure.":undefined));
    const insp=pose.breath==="inspiration"?"good":"repeat";
    out.push(item("pa-inspiration","Inspiration",insp,insp==="good"?"Exposure was made on arrested inspiration.":"Exposure was not made on the required full inspiration.","A well-inspired PA chest should demonstrate approximately the 10th posterior rib (often 10th–11th) above the diaphragm and expanded lung fields.",insp!=="good"?"Rehearse a full inspiratory breath-hold and expose at peak inspiration.":undefined));
    const scap=pose.shoulderRoll>=.7?"good":pose.shoulderRoll>=.4?"review":"repeat";
    out.push(item("pa-scapulae","Scapular clearance",scap,scap==="good"?"Shoulder protraction is sufficient for the scapulae to clear most of the lung fields.":"Shoulder roll is insufficient; the scapulae are likely to project over the lateral lungs.","The scapulae should be rolled laterally out of the lung fields.",scap!=="good"?"Protract both shoulders with the backs of the hands on the hips / receptor handles as appropriate.":undefined));
    const coverageGood=top<=apexTarget+1.5&&bottom>=diaphragmTarget-1.5&&top>=16*scale;
    const coverageSev:CritiqueSeverity=coverageGood?"good":anatomy?.grade==="repeat"?"repeat":"review";
    out.push(item("pa-coverage","Coverage",coverageSev,`Projected field spans approximately ${top.toFixed(1)}–${bottom.toFixed(1)} cm from the vertex in the simulation.`,"Include both apices superiorly and both costophrenic angles / hemidiaphragms inferiorly. The mandible should not occupy the chest field; the superior field should sit around C7/apices rather than the jaw.",coverageSev!=="good"?"Re-centre to T7 and adjust the superior/inferior shutters to the lung apices and costophrenic angles.":undefined));
    out.push(item("pa-penetration","Penetration and grey scale",gradeSeverity(exposureScore),metrics.eiStatus==="optimal"?"Detector exposure is within the simulated target range.":`EI is ${metrics.ei.toFixed(0)} (${metrics.eiStatus}).`,"A diagnostic PA chest should retain a broad grey scale: lungs radiolucent but not empty black, pulmonary vascular markings visible, the thoracic spine faintly visible through the cardiac shadow, and cortical bone whiter without becoming a line drawing.",metrics.eiStatus!=="optimal"?"Correct acquisition exposure rather than relying on display brightness/contrast.":undefined));
  } else if(projection.id==="lat-chest"){
    const lateralErr=Math.abs(Math.abs(pose.rotationY)-90), sev:CritiqueSeverity=lateralErr<=5?"good":lateralErr<=10?"review":"repeat";
    out.push(item("lat-rotation","True lateral",sev,`Lateral rotation error is approximately ${lateralErr.toFixed(0)}°.`,"Posterior ribs and costophrenic angles should be closely superimposed (about 1 cm or less separation).",sev!=="good"?"Bring the MSP parallel to the receptor and remove rotation.":undefined));
    const arms=pose.armRaise>=.7?"good":pose.armRaise>=.45?"review":"repeat";
    out.push(item("lat-arms","Arm elevation",arms,arms==="good"?"Arms are elevated sufficiently to clear the apices.":"Arm elevation is likely to superimpose humeri/soft tissue over the upper lungs.","Both arms should be elevated so the humeri and arm soft tissue do not obscure the lung apices.",arms!=="good"?"Raise and support both arms before exposure.":undefined));
    out.push(item("lat-centre","Centring",gradeSeverity(centring),centring?.detail??"Centring assessed from the simulated CR.","Centre the midthorax at approximately T7.",centring?.grade==="repeat"?"Re-centre to T7 in the mid-coronal plane.":undefined));
  } else if(projection.id==="pa-hand"){
    out.push(item("hand-rotation","Rotation",gradeSeverity(rotation),rotation?.detail??"Hand rotation assessed from pose.","Phalanges and metacarpals should show symmetric shaft concavity without rotation.",rotation?.grade==="repeat"?"Place the palm flat with the hand and forearm in the same plane.":undefined));
    out.push(item("hand-joints","Joint spaces","good","Joint-space openness depends on the selected hand pose.","IP and MCP joints should be open, with fingers flat to the receptor and digits slightly separated without soft-tissue overlap."));
  } else if(projection.id==="pa-wrist"){
    out.push(item("wrist-alignment","Alignment",gradeSeverity(rotation),rotation?.detail??"Wrist alignment assessed from pose.","Wrist, forearm and elbow should share the same horizontal plane; distal radioulnar and radiocarpal spaces should be open without radial/ulnar deviation.",rotation?.grade==="repeat"?"Reposition the shoulder/elbow/wrist into one plane and neutralise deviation.":undefined));
  } else if(projection.id==="ap-pelvis"){
    const hip=pose.hipInternal>=15&&pose.hipInternal<=20?"good":pose.hipInternal>=10&&pose.hipInternal<=25?"review":"repeat";
    out.push(item("pelvis-rotation","Pelvic rotation",gradeSeverity(rotation),rotation?.detail??"Pelvic symmetry assessed from pose.","Iliac wings and obturator foramina should be symmetric."));
    out.push(item("pelvis-necks","Femoral necks",hip,`Internal hip rotation is ${pose.hipInternal.toFixed(0)}°.`,"Femoral necks should be shown without foreshortening, usually with 15–20° internal rotation; lesser trochanters should be minimal.",hip!=="good"?"Internally rotate both lower limbs 15–20° unless clinically contraindicated.":undefined));
  } else if(projection.id==="lat-knee"){
    const flex=Math.abs(pose.kneeFlex-25), sev:CritiqueSeverity=flex<=5?"good":flex<=10?"review":"repeat";
    out.push(item("knee-flex","Flexion",sev,`Knee flexion is ${pose.kneeFlex.toFixed(0)}°.`,"A true lateral knee is generally flexed about 20–30° with femoral condyles superimposed and the patellofemoral joint visible.",sev!=="good"?"Adjust flexion towards 25° while maintaining a true lateral position.":undefined));
  } else if(projection.id==="ankle-ap"){
    out.push(item("ankle-mortise","Mortise",gradeSeverity(rotation),rotation?.detail??"Rotation assessed from pose.","For a mortise projection the whole ankle mortise should be open, requiring approximately 15–20° internal rotation."));
  } else if(projection.id==="ap-cspine"){
    out.push(item("cspine-mandible","Mandible clearance",gradeSeverity(score(scores,"angle")),score(scores,"angle")?.detail??"Tube angle assessed.","C3–T1 intervertebral spaces should be open with the mandible/base of skull projected over C1–C2, leaving C3 and below unobstructed.",score(scores,"angle")?.grade==="repeat"?"Correct the cephalad angle and chin position.":undefined));
  }

  out.push(item("collimation","Collimation",gradeSeverity(collimation),collimation?.detail??"Field size assessed.",projection.collimation,collimation?.grade==="repeat"?"Adjust the shutters and field position before repeating.":undefined));
  if(!out.some(x=>x.id==="penetration"||x.id==="pa-penetration")) out.push(item("exposure","Exposure / attenuation",gradeSeverity(exposureScore),exposureScore?.detail??`EI ${metrics.ei.toFixed(0)}.`,"The image should retain clinically useful attenuation differences: cortical bone most radiopaque, trabecular/medullary bone internally visible, soft tissues as intermediate greys, and air-containing regions radiolucent without clipping to featureless black.",exposureScore?.grade==="repeat"?"Correct kVp/mAs/grid selection before relying on post-processing.":undefined));
  return out;
}
