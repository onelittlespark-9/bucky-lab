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

/** Clinical scenarios for the future large patient bank. */
export const CASE_BANK: SimulationCase[] = [
  { id: "chest-normal-pa", title: "Routine chest — normal PA", clinicalHistory: "Adult outpatient with a persistent cough. Mobile and able to stand. No focal red flags.", patientId: "amara", projections: ["pa-chest"], pathologyId: "none", device: "none", teachingPoints: ["Routine ambulant chest: PA projection", "Include apices and costophrenic angles", "Assess inspiration, rotation and exposure before interpretation"] },
  { id: "chest-pneumonia", title: "Chest — right lower-lobe pneumonia", clinicalHistory: "48-year-old with fever, productive cough and right-sided pleuritic chest pain. Patient is mobile.", patientId: "tomas", projections: ["pa-chest"], pathologyId: "consolidation", device: "none", teachingPoints: ["PA chest is the routine projection for an ambulant patient", "Look for focal air-space opacity and associated signs", "Correlate the finding with the clinical history"] },
  { id: "chest-pneumothorax", title: "Chest — right apical pneumothorax", clinicalHistory: "Young adult with sudden unilateral pleuritic chest pain and shortness of breath. Mobile and able to stand.", patientId: "malik", projections: ["pa-chest"], pathologyId: "pneumothorax", device: "none", teachingPoints: ["Trace the pleural edge to the apex", "Compare peripheral lung markings with the contralateral side", "Do not confuse skin folds with a pleural line"] },
  { id: "chest-rib-trauma", title: "Chest — rib trauma", clinicalHistory: "Older adult after a fall with focal left lateral chest pain. Mobile and able to stand.", patientId: "ruth", projections: ["pa-chest"], pathologyId: "rib-fracture", device: "none", teachingPoints: ["Acquire the requested chest projection", "Inspect the ribs systematically", "Look for associated pleural complications"] },
  { id: "chest-pacemaker", title: "Pacemaker follow-up", clinicalHistory: "Patient with a recently implanted pacemaker. Chest radiography requested to assess device and lead position.", patientId: "amara", projections: ["pa-chest", "lat-chest"], pathologyId: "none", device: "pacemaker", teachingPoints: ["Lateral chest is used here for a specific device/lead assessment indication", "Trace each lead from the generator to its expected cardiac destination", "Check for an associated pneumothorax after implantation"] },
  { id: "chest-post-line", title: "Post-procedure chest", clinicalHistory: "Patient following central venous access insertion. Portable imaging requested to assess the line and exclude an immediate complication.", patientId: "gordon", projections: ["pa-chest"], pathologyId: "none", device: "none", teachingPoints: ["Clinical context changes what must be checked", "Assess the visible line course and tip position", "Look specifically for an iatrogenic pneumothorax"] },
  { id: "chest-copd", title: "Chest — chronic obstructive change", clinicalHistory: "Long-term smoker with worsening exertional breathlessness. Mobile and able to stand.", patientId: "gordon", projections: ["pa-chest"], pathologyId: "none", device: "none", teachingPoints: ["Recognise body habitus and positioning limitations", "Assess lung volumes and diaphragmatic configuration", "Distinguish chronic change from an acute abnormality"] },
  { id: "chest-oedema", title: "Chest — pulmonary oedema", clinicalHistory: "Older patient with acute breathlessness, orthopnoea and bilateral basal crackles. Mobile enough for an erect PA examination.", patientId: "ruth", projections: ["pa-chest"], pathologyId: "none", device: "none", teachingPoints: ["Assess cardiac silhouette and pulmonary vascular/interstitial pattern", "Look for bilateral rather than focal change", "Correlate with the clinical presentation"] },
];

export function caseById(id: string | null | undefined): SimulationCase | undefined {
  return CASE_BANK.find((item) => item.id === id);
}
