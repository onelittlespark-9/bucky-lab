import type { ImagingRequest } from "./requests";
import { PATHOLOGIES } from "./requests";
import { projectionById } from "./projections";

export type AreaExtent = "proximal" | "midshaft" | "distal" | "whole" | "joint";
export type AreaSurface = "medial" | "lateral" | "anterior" | "posterior" | "dorsal" | "palmar" | "plantar" | "not specified";

export interface RequestSpecificity {
  laterality: "left" | "right" | "bilateral" | "not specified";
  anatomy: string;
  extent: AreaExtent;
  surface: AreaSurface;
  confirmationPrompt: string;
}

const AREA_BY_ANATOMY: Record<string, { anatomy: string; extent: AreaExtent }> = {
  "hand-pa": { anatomy: "hand / metacarpals / phalanges", extent: "distal" },
  "wrist-pa": { anatomy: "wrist / distal forearm / carpal region", extent: "distal" },
  "elbow-ap": { anatomy: "elbow / distal humerus / proximal forearm", extent: "joint" },
  "shoulder-ap": { anatomy: "shoulder / glenohumeral joint / proximal humerus", extent: "proximal" },
  "knee-ap": { anatomy: "knee / distal femur / proximal tibia-fibula", extent: "joint" },
  "knee-lat": { anatomy: "knee / patella / joint space", extent: "joint" },
  "foot-dp": { anatomy: "foot / metatarsals / toes", extent: "distal" },
  "ankle-ap": { anatomy: "ankle / distal tibia-fibula / talus", extent: "distal" },
  "ap-hip": { anatomy: "hip / acetabulum / femoral head-neck", extent: "proximal" },
  "ap-pelvis": { anatomy: "pelvis / both hips / proximal femora", extent: "whole" },
  "ap-lumbar": { anatomy: "lumbar spine / SI region", extent: "whole" },
  "lat-lumbar": { anatomy: "lumbar spine / lumbosacral junction", extent: "whole" },
  "lat-cspine": { anatomy: "cervical spine / C1-T1", extent: "whole" },
  "ap-cspine": { anatomy: "cervical spine / C3-C7", extent: "whole" },
  "lat-skull": { anatomy: "skull / facial bones as requested", extent: "whole" },
  "pa-chest": { anatomy: "both lungs / thorax", extent: "whole" },
  "lat-chest": { anatomy: "both lungs / thorax / sternum", extent: "whole" },
  "ap-abdomen": { anatomy: "abdomen / pelvis as collimated", extent: "whole" },
};

function surfaceFromText(text: string): AreaSurface {
  const t = text.toLowerCase();
  if (t.includes("medial")) return "medial";
  if (t.includes("lateral")) return "lateral";
  if (t.includes("posterior")) return "posterior";
  if (t.includes("anterior")) return "anterior";
  if (t.includes("dorsal")) return "dorsal";
  if (t.includes("palmar")) return "palmar";
  if (t.includes("plantar")) return "plantar";
  return "not specified";
}

export function requestSpecificity(request: ImagingRequest): RequestSpecificity {
  const projection = projectionById(request.requestedProjections[0] ?? "pa-chest");
  const mapped = AREA_BY_ANATOMY[projection.id] ?? { anatomy: projection.region, extent: "whole" as AreaExtent };
  const pathology = PATHOLOGIES[request.pathologyId];
  const text = `${request.title} ${request.clinicalHistory} ${pathology?.name ?? ""} ${pathology?.description ?? ""}`;
  const laterality = request.requestedLaterality ?? "not specified";
  const surface = surfaceFromText(text);
  const sideText = laterality === "not specified" ? "laterality" : `${laterality} side`;
  const surfaceText = surface === "not specified" ? "surface (e.g. medial/lateral, anterior/posterior)" : `${surface} surface`;
  return {
    laterality,
    anatomy: mapped.anatomy,
    extent: mapped.extent,
    surface,
    confirmationPrompt: `Confirm ${sideText}, ${mapped.extent} extent and ${surfaceText} before accepting the request.`,
  };
}
