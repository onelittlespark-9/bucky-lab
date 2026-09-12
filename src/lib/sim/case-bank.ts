import type { PathologyId } from "./requests";

export type CaseDevice = "none" | "pacemaker";

export interface SimulationCase {
  id: string;
  title: string;
  clinicalHistory: string;
  patientId: string;
  projections: string[];
  pathologyId: PathologyId;
  device: CaseDevice;
  teachingPoints: string[];
}

/**
 * Core cases plus a structured 26-scenario x 5-setting bank.
 * The setting language deliberately makes the same examination behave differently
 * in outpatient, inpatient and emergency practice.
 */
const CORE_CASES: SimulationCase[] = [
  { id: "chest-normal-pa", title: "Routine chest — normal PA", clinicalHistory: "Adult outpatient with a persistent cough. Mobile and able to stand. No focal red flags.", patientId: "amara", projections: ["pa-chest"], pathologyId: "none", device: "none", teachingPoints: ["Routine ambulant chest: PA projection", "Include apices and costophrenic angles", "Assess inspiration, rotation and exposure"] },
  { id: "chest-pneumonia", title: "Chest — right lower-lobe pneumonia", clinicalHistory: "48-year-old with fever, productive cough and right-sided pleuritic chest pain. Patient is mobile.", patientId: "tomas", projections: ["pa-chest"], pathologyId: "consolidation", device: "none", teachingPoints: ["PA chest for an ambulant patient", "Look for focal air-space opacity", "Correlate the image with the history"] },
  { id: "chest-pneumothorax", title: "Chest — right apical pneumothorax", clinicalHistory: "Young adult with sudden unilateral pleuritic chest pain and shortness of breath. Mobile and able to stand.", patientId: "malik", projections: ["pa-chest"], pathologyId: "pneumothorax", device: "none", teachingPoints: ["Trace the pleural edge", "Compare peripheral lung markings", "Do not confuse skin folds with a pleural line"] },
  { id: "chest-rib-trauma", title: "Chest — rib trauma", clinicalHistory: "Older adult after a fall with focal left lateral chest pain. Mobile and able to stand.", patientId: "ruth", projections: ["pa-chest"], pathologyId: "rib-fracture", device: "none", teachingPoints: ["Acquire the requested chest projection", "Inspect the ribs systematically", "Look for associated pleural complications"] },
  { id: "chest-pacemaker", title: "Pacemaker follow-up", clinicalHistory: "Patient with a recently implanted pacemaker. Chest radiography requested to assess device and lead position.", patientId: "amara", projections: ["pa-chest", "lat-chest"], pathologyId: "none", device: "pacemaker", teachingPoints: ["Assess device and lead position", "Trace each lead", "Check for post-procedure pneumothorax"] },
  { id: "chest-post-line", title: "Post-procedure chest", clinicalHistory: "Patient following central venous access insertion. Portable imaging requested to assess the line and exclude an immediate complication.", patientId: "gordon", projections: ["pa-chest"], pathologyId: "none", device: "none", teachingPoints: ["Assess line course and tip", "Look for iatrogenic pneumothorax", "Clinical context changes the image check"] },
  { id: "chest-copd", title: "Chest — chronic obstructive change", clinicalHistory: "Long-term smoker with worsening exertional breathlessness. Mobile and able to stand.", patientId: "gordon", projections: ["pa-chest"], pathologyId: "none", device: "none", teachingPoints: ["Assess lung volumes", "Assess diaphragmatic configuration", "Distinguish chronic change from acute disease"] },
  { id: "chest-oedema", title: "Chest — pulmonary oedema", clinicalHistory: "Older patient with acute breathlessness, orthopnoea and bilateral basal crackles. Mobile enough for an erect PA examination.", patientId: "ruth", projections: ["pa-chest"], pathologyId: "none", device: "none", teachingPoints: ["Assess cardiac silhouette", "Look for bilateral pulmonary change", "Correlate with the clinical presentation"] },
];

type Scenario = { id: string; title: string; region: string; projections: string[]; pathologyId: PathologyId; history: string; points: string[] };

const SCENARIOS: Scenario[] = [
  { id: "chest-cough", title: "Chest — persistent cough", region: "Thorax", projections: ["pa-chest"], pathologyId: "none", history: "Persistent cough for several weeks without significant breathlessness.", points: ["PA chest", "Include apices and costophrenic angles", "Check rotation and exposure"] },
  { id: "chest-infection", title: "Chest — suspected infection", region: "Thorax", projections: ["pa-chest"], pathologyId: "consolidation", history: "Fever, productive cough and increasing shortness of breath.", points: ["Assess lung fields systematically", "Compare sides", "Relate opacity to symptoms"] },
  { id: "chest-trauma", title: "Chest — blunt trauma", region: "Thorax", projections: ["pa-chest"], pathologyId: "rib-fracture", history: "Blunt chest injury with focal pain on breathing.", points: ["Inspect ribs", "Check pleural spaces", "Avoid unnecessary patient movement"] },
  { id: "chest-breathlessness", title: "Chest — acute breathlessness", region: "Thorax", projections: ["pa-chest"], pathologyId: "pneumothorax", history: "Acute unilateral pleuritic pain with shortness of breath.", points: ["Check pleural edge", "Compare lung markings", "Check exposure"] },
  { id: "chest-device", title: "Chest — device review", region: "Thorax", projections: ["pa-chest", "lat-chest"], pathologyId: "none", history: "Follow-up after thoracic device or line placement.", points: ["Trace the device", "Assess tip/lead position", "Check for complications"] },
  { id: "abdomen-pain", title: "Abdomen — acute pain", region: "Abdomen", projections: ["ap-abdomen"], pathologyId: "none", history: "Abdominal pain with nausea and increasing distension.", points: ["Collimate to the required anatomy", "Assess bowel gas pattern", "Include relevant upper and lower margins"] },
  { id: "abdomen-obstruction", title: "Abdomen — suspected obstruction", region: "Abdomen", projections: ["ap-abdomen"], pathologyId: "none", history: "Colicky abdominal pain, vomiting and abdominal distension.", points: ["Assess bowel gas distribution", "Look for dilated loops", "Check image coverage"] },
  { id: "pelvis-fall", title: "Pelvis — fall", region: "Pelvis & hips", projections: ["ap-pelvis"], pathologyId: "femoral-neck-fracture", history: "Fall with pelvic or hip pain and difficulty weight-bearing.", points: ["Centre accurately", "Assess pelvic rotation", "Compare both hips"] },
  { id: "hip-pain", title: "Hip — painful weight-bearing", region: "Pelvis & hips", projections: ["ap-pelvis", "ap-hip"], pathologyId: "femoral-neck-fracture", history: "New hip pain with reduced ability to weight-bear.", points: ["Avoid forcing a painful hip", "Assess alignment", "Check the femoral neck"] },
  { id: "hand-trauma", title: "Hand — trauma", region: "Upper limb", projections: ["pa-hand"], pathologyId: "soft-tissue-swelling", history: "Hand injury with focal pain and swelling after a direct impact.", points: ["Include all phalanges and wrist", "Check rotation", "Assess soft tissues"] },
  { id: "hand-foreign-body", title: "Hand — foreign body", region: "Upper limb", projections: ["pa-hand"], pathologyId: "foreign-body", history: "Puncture wound to the hand with concern for a retained foreign body.", points: ["Include the symptomatic area", "Check soft tissues", "Look for radiopaque material"] },
  { id: "wrist-foosh", title: "Wrist — FOOSH", region: "Upper limb", projections: ["pa-wrist"], pathologyId: "distal-radius-fracture", history: "Fall onto an outstretched hand with wrist pain and swelling.", points: ["Confirm side", "Include distal radius and ulna", "Assess alignment"] },
  { id: "wrist-scaphoid", title: "Wrist — snuffbox tenderness", region: "Upper limb", projections: ["pa-wrist"], pathologyId: "scaphoid-fracture", history: "Fall onto the hand with persistent anatomical snuffbox tenderness.", points: ["Confirm the painful side", "Assess the scaphoid region", "Avoid overcalling projection artefact"] },
  { id: "elbow-foosh", title: "Elbow — FOOSH", region: "Upper limb", projections: ["ap-elbow"], pathologyId: "olecranon-fracture", history: "Fall onto an outstretched hand with painful swollen elbow.", points: ["Avoid forcing extension", "Include distal humerus and proximal forearm", "Assess joint alignment"] },
  { id: "shoulder-fall", title: "Shoulder — fall", region: "Upper limb", projections: ["ap-shoulder"], pathologyId: "humeral-shaft-fracture", history: "Fall onto the shoulder with painful restricted movement.", points: ["Do not force the injured arm", "Include the proximal humerus", "Assess glenohumeral alignment"] },
  { id: "shoulder-pain", title: "Shoulder — chronic pain", region: "Upper limb", projections: ["ap-shoulder"], pathologyId: "none", history: "Persistent shoulder pain affecting overhead movement.", points: ["Centre the joint", "Include clavicle and scapula", "Assess positioning"] },
  { id: "knee-fall", title: "Knee — fall", region: "Lower limb", projections: ["ap-knee", "lat-knee"], pathologyId: "patella-fracture", history: "Fall directly onto the knee with pain and swelling.", points: ["Do not force painful flexion", "Include the joint space", "Assess patella and tibial plateau"] },
  { id: "knee-pain", title: "Knee — persistent pain", region: "Lower limb", projections: ["ap-knee", "lat-knee"], pathologyId: "none", history: "Persistent knee pain with reduced mobility.", points: ["Centre to the joint", "Assess rotation", "Include soft tissues"] },
  { id: "ankle-inversion", title: "Ankle — inversion injury", region: "Lower limb", projections: ["ap-ankle"], pathologyId: "ankle-fracture", history: "Inversion injury with lateral ankle swelling and tenderness.", points: ["Confirm side", "Assess mortise", "Do not force weight-bearing"] },
  { id: "foot-impact", title: "Foot — direct impact", region: "Lower limb", projections: ["dp-foot"], pathologyId: "soft-tissue-swelling", history: "Heavy object landed on the foot with localised pain and swelling.", points: ["Include toes and hindfoot", "Assess alignment", "Check soft-tissue swelling"] },
  { id: "foot-midfoot", title: "Foot — midfoot pain", region: "Lower limb", projections: ["dp-foot"], pathologyId: "none", history: "Pain across the midfoot following a twisting injury.", points: ["Include the full foot", "Assess tarsometatarsal alignment", "Confirm side"] },
  { id: "cspine-trauma", title: "Cervical spine — trauma", region: "Spine", projections: ["lat-cspine"], pathologyId: "none", history: "Trauma with midline cervical tenderness and restricted movement.", points: ["Maintain immobilisation", "Do not force neck movement", "Assess the visible cervical alignment"] },
  { id: "cspine-pain", title: "Cervical spine — pain", region: "Spine", projections: ["ap-cspine", "lat-cspine"], pathologyId: "none", history: "Persistent neck pain after a period of reduced mobility.", points: ["Centre accurately", "Assess alignment", "Include the cervicothoracic junction where possible"] },
  { id: "lumbar-pain", title: "Lumbar spine — back pain", region: "Spine", projections: ["ap-lumbar", "lat-lumbar"], pathologyId: "none", history: "Persistent low back pain with focal lumbar tenderness.", points: ["Assess rotation", "Include the lumbar spine", "Check exposure and collimation"] },
  { id: "lumbar-trauma", title: "Lumbar spine — trauma", region: "Spine", projections: ["ap-lumbar", "lat-lumbar"], pathologyId: "none", history: "Fall with focal lower-back pain and limited movement.", points: ["Support the patient", "Avoid painful movement", "Assess vertebral alignment"] },
  { id: "skull-trauma", title: "Skull — trauma", region: "Skull", projections: ["lat-skull"], pathologyId: "none", history: "Head injury with focal scalp tenderness following a fall.", points: ["Check patient safety first", "Centre carefully", "Assess coverage and rotation"] },
  { id: "skull-headache", title: "Skull — persistent symptoms", region: "Skull", projections: ["lat-skull"], pathologyId: "none", history: "Persistent symptoms following clinical assessment where plain skull imaging is requested.", points: ["Confirm the indication", "Avoid unnecessary repeats", "Assess positioning"] },
];

const SETTINGS = [
  { id: "outpatient", label: "Outpatient", patientIds: ["amara", "malik", "elise", "gordon", "tomas"], urgency: "routine" as const, phrase: "Seen in clinic today; the patient is mobile and can usually achieve the standard position." },
  { id: "inpatient", label: "Inpatient", patientIds: ["ruth", "gordon", "amara", "tomas", "elise"], urgency: "urgent" as const, phrase: "The patient is currently on the ward; mobility and tolerance need checking before positioning." },
  { id: "ed", label: "Emergency department", patientIds: ["malik", "ruth", "tomas", "elise", "amara"], urgency: "stat" as const, phrase: "The patient has arrived through ED after an acute presentation; avoid unnecessary movement and establish what they can safely tolerate." },
  { id: "outpatient2", label: "Outpatient", patientIds: ["tomas", "amara", "gordon", "malik", "elise"], urgency: "routine" as const, phrase: "The patient has attended from home and is able to mobilise independently." },
  { id: "inpatient2", label: "Inpatient", patientIds: ["gordon", "ruth", "elise", "amara", "tomas"], urgency: "urgent" as const, phrase: "The patient is admitted on a ward and may need assistance with positioning." },
] as const;

const GENERATED_CASES: SimulationCase[] = SCENARIOS.flatMap((scenario, scenarioIndex) => SETTINGS.map((setting, settingIndex) => {
  const patientId = setting.patientIds[scenarioIndex % setting.patientIds.length];
  const acute = setting.id.startsWith("ed") || /trauma|fall|FOOSH|inversion|impact/i.test(scenario.title);
  const title = `${scenario.title} · ${setting.label}`;
  return {
    id: `${scenario.id}-${setting.id}`,
    title,
    clinicalHistory: `${scenario.history} ${setting.phrase}`,
    patientId,
    projections: scenario.projections,
    pathologyId: scenario.pathologyId,
    device: scenario.id === "chest-device" ? "pacemaker" : "none",
    teachingPoints: [...scenario.points, acute ? "Consider safe modification if movement is limited" : "Confirm the standard position is tolerated"],
  };
}));

export const CASE_BANK: SimulationCase[] = [...CORE_CASES, ...GENERATED_CASES];

export function caseById(id: string | null | undefined): SimulationCase | undefined { return CASE_BANK.find((item) => item.id === id); }
