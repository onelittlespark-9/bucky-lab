import type { Projection } from "./types";

export interface RadiographLearningLabel {
  id: string;
  label: string;
  x: number;
  y: number;
  side?: "left" | "right";
  note?: string;
}

/**
 * Normalised image-space teaching labels (0..1 from image top-left).
 * These are educational landmarks for a correctly positioned projection, not
 * segmentation masks. They intentionally describe anatomy expected to be
 * visible on the radiograph rather than every atlas structure present in 3D.
 */
const LABELS: Record<string, RadiographLearningLabel[]> = {
  "pa-chest": [
    { id:"right-apex", label:"Right lung apex", x:.33, y:.13, side:"right" },
    { id:"left-apex", label:"Left lung apex", x:.67, y:.13, side:"left" },
    { id:"trachea", label:"Trachea", x:.50, y:.19 },
    { id:"clavicles", label:"Clavicles", x:.50, y:.22 },
    { id:"right-hilum", label:"Right hilum", x:.43, y:.43, side:"right" },
    { id:"left-hilum", label:"Left hilum", x:.57, y:.41, side:"left" },
    { id:"right-lung", label:"Right lung field", x:.34, y:.50, side:"right" },
    { id:"left-lung", label:"Left lung field", x:.68, y:.50, side:"left" },
    { id:"heart", label:"Cardiac silhouette", x:.56, y:.61 },
    { id:"thoracic-spine", label:"Thoracic spine", x:.50, y:.55 },
    { id:"right-hemi", label:"Right hemidiaphragm", x:.38, y:.78, side:"right" },
    { id:"left-hemi", label:"Left hemidiaphragm", x:.64, y:.80, side:"left" },
    { id:"right-cpa", label:"Right costophrenic angle", x:.20, y:.84, side:"right" },
    { id:"left-cpa", label:"Left costophrenic angle", x:.80, y:.84, side:"left" },
  ],
  "lat-chest": [
    { id:"apex", label:"Lung apices", x:.52, y:.14 },
    { id:"sternum", label:"Sternum", x:.27, y:.43 },
    { id:"retrosternal", label:"Retrosternal clear space", x:.36, y:.38 },
    { id:"heart", label:"Cardiac silhouette", x:.49, y:.57 },
    { id:"spine", label:"Thoracic spine", x:.72, y:.52 },
    { id:"posterior-ribs", label:"Posterior ribs", x:.78, y:.38 },
    { id:"diaphragms", label:"Hemidiaphragms", x:.53, y:.78 },
    { id:"cpa", label:"Costophrenic angles", x:.76, y:.83 },
  ],
  "pa-hand": [
    { id:"distal-phalanges", label:"Distal phalanges", x:.50, y:.16 },
    { id:"ip-joints", label:"IP joints", x:.50, y:.31 },
    { id:"mcp-joints", label:"MCP joints", x:.50, y:.52 },
    { id:"metacarpals", label:"Metacarpals", x:.50, y:.65 },
    { id:"carpals", label:"Carpal bones", x:.50, y:.82 },
    { id:"radius-ulna", label:"Distal radius and ulna", x:.50, y:.94 },
  ],
  "pa-wrist": [
    { id:"metacarpal-bases", label:"Metacarpal bases", x:.50, y:.14 },
    { id:"carpals", label:"Carpal bones", x:.50, y:.46 },
    { id:"radiocarpal", label:"Radiocarpal joint", x:.50, y:.62 },
    { id:"radius", label:"Distal radius", x:.40, y:.80 },
    { id:"ulna", label:"Distal ulna", x:.68, y:.80 },
  ],
  "elbow-ap": [
    { id:"distal-humerus", label:"Distal humerus", x:.50, y:.30 },
    { id:"epicondyles", label:"Humeral epicondyles", x:.50, y:.46 },
    { id:"joint-space", label:"Elbow joint space", x:.50, y:.53 },
    { id:"radial-head", label:"Radial head", x:.37, y:.61 },
    { id:"olecranon", label:"Olecranon / proximal ulna", x:.62, y:.62 },
  ],
  "shoulder-ap": [
    { id:"clavicle", label:"Clavicle", x:.48, y:.22 },
    { id:"acromion", label:"Acromion", x:.35, y:.34 },
    { id:"glenoid", label:"Glenoid", x:.48, y:.47 },
    { id:"humeral-head", label:"Humeral head", x:.60, y:.47 },
    { id:"greater-tuberosity", label:"Greater tuberosity", x:.69, y:.47 },
  ],
  "knee-ap": [
    { id:"femoral-condyles", label:"Femoral condyles", x:.50, y:.38 },
    { id:"patella", label:"Patella", x:.50, y:.45 },
    { id:"joint", label:"Femorotibial joint space", x:.50, y:.55 },
    { id:"tibial-plateau", label:"Tibial plateaus", x:.50, y:.61 },
    { id:"fibular-head", label:"Fibular head", x:.70, y:.64 },
  ],
  "knee-lat": [
    { id:"condyles", label:"Superimposed femoral condyles", x:.51, y:.42 },
    { id:"patella", label:"Patella", x:.32, y:.45 },
    { id:"pf-joint", label:"Patellofemoral joint", x:.39, y:.50 },
    { id:"tibial-plateau", label:"Tibial plateau", x:.53, y:.60 },
  ],
  "foot-dp": [
    { id:"phalanges", label:"Phalanges", x:.52, y:.21 },
    { id:"metatarsals", label:"Metatarsals", x:.51, y:.49 },
    { id:"tarsals", label:"Tarsal bones", x:.49, y:.72 },
    { id:"talus", label:"Talus", x:.49, y:.83 },
  ],
  "ankle-ap": [
    { id:"tibia", label:"Distal tibia", x:.44, y:.33 },
    { id:"fibula", label:"Distal fibula", x:.68, y:.40 },
    { id:"mortise", label:"Ankle mortise", x:.52, y:.57 },
    { id:"talus", label:"Talus", x:.52, y:.68 },
  ],
  "ap-pelvis": [
    { id:"iliac-wings", label:"Iliac wings", x:.50, y:.28 },
    { id:"sacrum", label:"Sacrum", x:.50, y:.43 },
    { id:"acetabula", label:"Acetabula", x:.50, y:.56 },
    { id:"obturator", label:"Obturator foramina", x:.50, y:.68 },
    { id:"femoral-necks", label:"Femoral necks", x:.50, y:.62 },
    { id:"symphysis", label:"Pubic symphysis", x:.50, y:.75 },
  ],
  "ap-cspine": [
    { id:"c3", label:"C3", x:.50, y:.28 },
    { id:"c4", label:"C4", x:.50, y:.39 },
    { id:"c5", label:"C5", x:.50, y:.50 },
    { id:"c6", label:"C6", x:.50, y:.61 },
    { id:"c7", label:"C7", x:.50, y:.72 },
  ],
  "lat-cspine": [
    { id:"c1c2", label:"C1–C2", x:.55, y:.25 },
    { id:"bodies", label:"Cervical vertebral bodies", x:.54, y:.49 },
    { id:"disc-spaces", label:"Intervertebral disc spaces", x:.54, y:.57 },
    { id:"c7t1", label:"C7/T1 junction", x:.55, y:.78 },
    { id:"prevertebral", label:"Prevertebral soft tissues", x:.37, y:.48 },
  ],
};

export function learningLabelsForProjection(projection: Projection): RadiographLearningLabel[] {
  const direct = LABELS[projection.id];
  if (direct) return direct;
  if (projection.id.includes("pelvis")) return LABELS["ap-pelvis"] ?? [];
  if (projection.anatomy === "hand-pa") return LABELS["pa-hand"] ?? [];
  if (projection.anatomy === "wrist-pa") return LABELS["pa-wrist"] ?? [];
  if (projection.anatomy === "shoulder-ap") return LABELS["shoulder-ap"] ?? [];
  if (projection.anatomy === "knee-ap") return LABELS["knee-ap"] ?? [];
  if (projection.anatomy === "knee-lat") return LABELS["knee-lat"] ?? [];
  if (projection.anatomy === "foot-dp") return LABELS["foot-dp"] ?? [];
  if (projection.anatomy === "ankle-ap") return LABELS["ankle-ap"] ?? [];
  return [];
}
