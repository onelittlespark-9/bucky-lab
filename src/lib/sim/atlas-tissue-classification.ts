export interface AtlasTissuePartLike {
  system: string;
  name: string;
}

const AIRWAY_RE = /trache|bronch|laryn|pharyn|nasal|sinus/i;
const NON_LUNG_RESPIRATORY_RE = /cartilage|pleura|epiglott|vocal|thyroid/i;

/**
 * Human Atlas structure names are not guaranteed to contain the word "lung".
 * Treat the respiratory system as pulmonary parenchyma by exclusion instead of
 * relying on a fragile lung-name regex. This keeps lobes whose source names are
 * anatomical labels (for example superior/inferior lobe) in the aerated volume.
 */
export function isAtlasAirway(part: AtlasTissuePartLike) {
  return part.system === "respiratory" && AIRWAY_RE.test(part.name);
}

export function isAtlasLungParenchyma(part: AtlasTissuePartLike) {
  return part.system === "respiratory" &&
    !AIRWAY_RE.test(part.name) &&
    !NON_LUNG_RESPIRATORY_RE.test(part.name);
}
