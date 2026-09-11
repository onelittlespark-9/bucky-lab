import type { ImagingRequest, PathologyId } from "./requests";
import { PATIENTS } from "./patients";

const projectionTemplates: Array<{
  projection: string;
  region: ImagingRequest["region"];
  title: string;
  history: string[];
  pathology: PathologyId;
  laterality?: "left" | "right";
  paired?: string[];
}> = [
  { projection: "pa-chest", region: "Thorax", title: "Chest – respiratory symptoms", history: ["shortness of breath", "pleuritic pain", "persistent cough", "fever and productive cough", "pre-operative assessment"], pathology: "consolidation", paired: ["pa-chest", "lat-chest"] },
  { projection: "lat-chest", region: "Thorax", title: "Chest – lateral view", history: ["follow-up of focal opacity", "pacemaker lead check", "localisation of retrocardiac opacity", "persistent cough", "pre-operative assessment"], pathology: "none", paired: ["pa-chest", "lat-chest"] },
  { projection: "ap-abdomen", region: "Abdomen", title: "Abdomen – acute pain", history: ["abdominal distension", "colicky pain and vomiting", "reduced bowel motions", "suspected obstruction", "post-operative abdominal pain"], pathology: "none" },
  { projection: "ap-pelvis", region: "Pelvis & hips", title: "Pelvis – trauma", history: ["fall onto the hip", "low-speed road traffic collision", "pelvic pain after a fall", "difficulty weight-bearing", "post-operative comparison"], pathology: "femoral-neck-fracture" },
  { projection: "ap-hip", region: "Pelvis & hips", title: "Hip – trauma", history: ["fall with groin pain", "shortened externally rotated limb", "new inability to weight-bear", "persistent hip pain", "post-operative follow-up"], pathology: "femoral-neck-fracture", laterality: "left" },
  { projection: "lat-cspine", region: "Spine", title: "Cervical spine – trauma", history: ["midline neck tenderness after RTA", "fall with cervical pain", "persistent neck pain", "whiplash injury", "trauma with collar in situ"], pathology: "none" },
  { projection: "ap-cspine", region: "Spine", title: "Cervical spine – AP", history: ["cervical trauma", "neck pain", "follow-up of degenerative change", "post-traumatic assessment", "persistent cervical symptoms"], pathology: "none" },
  { projection: "ap-lumbar", region: "Spine", title: "Lumbar spine – pain", history: ["acute low back pain", "pain after lifting", "fall with lumbar tenderness", "persistent mechanical back pain", "follow-up of known degenerative change"], pathology: "none", paired: ["ap-lumbar", "lat-lumbar"] },
  { projection: "lat-lumbar", region: "Spine", title: "Lumbar spine – lateral", history: ["assessment of lumbar alignment", "acute low back pain", "trauma with lumbar tenderness", "follow-up imaging", "persistent radicular symptoms"], pathology: "none", paired: ["ap-lumbar", "lat-lumbar"] },
  { projection: "pa-hand", region: "Upper limb", title: "Hand – trauma", history: ["punch injury", "fall onto the hand", "crush injury", "pain over the metacarpals", "swelling after sport"], pathology: "foreign-body", laterality: "right" },
  { projection: "pa-wrist", region: "Upper limb", title: "Wrist – trauma", history: ["FOOSH injury", "dinner-fork deformity", "snuffbox tenderness", "wrist swelling after a fall", "persistent wrist pain"], pathology: "distal-radius-fracture", laterality: "right" },
  { projection: "ap-elbow", region: "Upper limb", title: "Elbow – trauma", history: ["FOOSH with elbow pain", "direct blow to elbow", "swelling and reduced movement", "fall during sport", "posterior elbow tenderness"], pathology: "olecranon-fracture", laterality: "left" },
  { projection: "ap-shoulder", region: "Upper limb", title: "Shoulder – trauma", history: ["fall onto shoulder", "suspected dislocation", "direct blow during sport", "painful restricted movement", "post-reduction check"], pathology: "humeral-shaft-fracture", laterality: "left" },
  { projection: "ap-knee", region: "Lower limb", title: "Knee – trauma", history: ["fall onto knee", "twisting injury", "sporting injury", "anterior knee pain", "inability to weight-bear"], pathology: "patella-fracture", laterality: "left" },
  { projection: "lat-knee", region: "Lower limb", title: "Knee – lateral", history: ["trauma with suspected patellar injury", "follow-up of knee effusion", "pain after a fall", "sporting injury", "assessment of joint alignment"], pathology: "patella-fracture", laterality: "left" },
  { projection: "dp-foot", region: "Lower limb", title: "Foot – trauma", history: ["dropped object onto foot", "twisting injury", "midfoot pain", "pain at the fifth metatarsal", "sporting injury"], pathology: "foreign-body", laterality: "right" },
  { projection: "ap-ankle", region: "Lower limb", title: "Ankle – trauma", history: ["inversion injury", "lateral malleolar tenderness", "fall from a step", "sporting injury", "persistent ankle swelling"], pathology: "ankle-fracture", laterality: "right" },
  { projection: "lat-skull", region: "Skull", title: "Skull – trauma", history: ["head injury", "assault with facial impact", "fall with head strike", "persistent headache after trauma", "foreign-body localisation"], pathology: "foreign-body" },
];

const variants = [
  "Emergency department referral", "Urgent trauma referral", "Same-day assessment", "Outpatient referral", "Minor injuries review", "Follow-up examination", "Orthopaedic review", "Medical ward request", "Pre-operative work-up", "Post-operative comparison",
];

function sideLabel(side?: "left" | "right") { return side ? `${side[0].toUpperCase()}${side.slice(1)} ` : ""; }

export const REQUEST_BANK: ImagingRequest[] = Array.from({ length: 180 }, (_, index) => {
  const template = projectionTemplates[index % projectionTemplates.length]!;
  const patient = PATIENTS[index % PATIENTS.length]!;
  const variant = variants[Math.floor(index / projectionTemplates.length) % variants.length]!;
  const deliberatelyWrong = index % 19 === 0;
  const side = template.laterality;
  const requestedSide = deliberatelyWrong && side ? (side === "left" ? "right" : "left") : side;
  const projections = template.paired && index % 3 !== 1 ? template.paired : [template.projection];
  const viewLabel = `${sideLabel(requestedSide)}${template.title.replace(" – trauma", "").replace(" – lateral", "")} ${projections.map((p) => p.replaceAll("-", " ")).join(" + ")}`;
  const id = `req-${String(index + 1).padStart(3, "0")}`;
  return {
    id,
    title: `${template.title} · ${variant}`,
    clinicalHistory: `${patient.age}-year-old ${patient.sex} patient. ${template.history[index % template.history.length]}. ${variant}.`,
    requestedProjections: projections,
    requestedViewsLabel: viewLabel,
    requestedLaterality: requestedSide ?? null,
    correctLaterality: side ?? null,
    patientId: patient.id,
    isValid: !deliberatelyWrong,
    rejectionReason: deliberatelyWrong && side ? `The clinical history and laterality indicate the ${side} side, but the request specifies the ${requestedSide} side. Correct the request before exposure.` : undefined,
    pathologyId: template.pathology,
    region: template.region,
    urgency: index % 7 === 0 ? "stat" : index % 3 === 0 ? "urgent" : "routine",
  };
});

export function requestFromBank(id: string) { return REQUEST_BANK.find((request) => request.id === id); }
