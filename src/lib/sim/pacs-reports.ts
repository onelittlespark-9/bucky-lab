import type { PACSReport } from "./types";

export const PACS_REPORTS: Record<string, PACSReport> = {
  "chest-normal-pa": {
    clinicalHistory: "Adult outpatient with a persistent cough. Mobile and able to stand.",
    technique: "PA chest radiograph obtained in the erect position.",
    findings: "Cardiomediastinal silhouette is within normal limits. Lungs are clear with no focal air-space consolidation, pleural effusion or pneumothorax. No acute osseous abnormality identified on this view.",
    impression: "No acute cardiopulmonary abnormality.",
  },
  "chest-pneumonia": {
    clinicalHistory: "48-year-old with fever, productive cough and right-sided pleuritic chest pain.",
    technique: "PA chest radiograph obtained in the erect position.",
    findings: "Focal air-space opacity within the right lower zone with partial obscuration of the right hemidiaphragm. No pleural effusion or pneumothorax. Cardiomediastinal silhouette is not enlarged.",
    impression: "Right lower-lobe air-space consolidation, in keeping with pneumonia in the stated clinical context.",
  },
  "chest-pneumothorax": {
    clinicalHistory: "Young adult with sudden unilateral pleuritic chest pain and shortness of breath.",
    technique: "PA chest radiograph obtained in the erect position.",
    findings: "Visible visceral pleural line at the right apex with absence of peripheral lung markings beyond it. No mediastinal shift.",
    impression: "Small right apical pneumothorax without radiographic evidence of tension.",
  },
  "chest-rib-trauma": {
    clinicalHistory: "Older adult after a fall with focal left lateral chest pain.",
    technique: "PA chest radiograph obtained in the erect position.",
    findings: "Cortical irregularity consistent with an acute fracture involving a left lateral rib. No focal pulmonary contusion, pleural effusion or pneumothorax identified on this examination.",
    impression: "Left lateral rib fracture. No visible acute pleural complication.",
  },
  "chest-pacemaker": {
    clinicalHistory: "Recent pacemaker implantation; assessment of device and lead position.",
    technique: "PA and lateral chest radiographs obtained in the erect position.",
    findings: "Left chest cardiac device with leads projecting over expected right atrial and right ventricular locations. No visible lead discontinuity. No pneumothorax or pleural effusion.",
    impression: "Pacemaker leads project in expected position. No post-procedural pneumothorax.",
  },
  "chest-post-line": {
    clinicalHistory: "Following central venous access insertion; assess line position and exclude immediate complication.",
    technique: "Portable AP chest radiograph.",
    findings: "Central venous catheter courses to the upper right atrial/cavoatrial region. No visible pneumothorax. Cardiomediastinal silhouette is mildly enlarged on this AP projection.",
    impression: "Central venous catheter tip projects in an acceptable position. No visible pneumothorax.",
  },
  "chest-copd": {
    clinicalHistory: "Long-term smoker with worsening exertional breathlessness.",
    technique: "PA chest radiograph obtained in the erect position.",
    findings: "Hyperinflation with increased retrosternal lucency and relatively flattened diaphragms. No focal air-space consolidation or pleural effusion.",
    impression: "Hyperinflation and chronic obstructive-type change. No focal acute air-space abnormality.",
  },
  "chest-oedema": {
    clinicalHistory: "Older patient with acute breathlessness, orthopnoea and bilateral basal crackles.",
    technique: "PA chest radiograph obtained in the erect position.",
    findings: "Mild cardiomegaly with bilateral perihilar/interstitial pulmonary vascular and air-space opacity. Small bilateral pleural effusions are present.",
    impression: "Radiographic features of pulmonary oedema with small bilateral pleural effusions.",
  },
};

export function pacsReportForCase(caseId: string | null | undefined): PACSReport | undefined {
  return caseId ? PACS_REPORTS[caseId] : undefined;
}
