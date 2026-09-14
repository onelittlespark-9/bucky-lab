import { readFile } from "node:fs/promises";
import {
  linearAttenuationAtEnergy,
  materialDensity,
} from "../src/lib/sim/nist-attenuation.ts";

const LOCAL_MANIFEST = new URL("../public/models/human-atlas/atlas.json", import.meta.url);
const UPSTREAM_MANIFEST = "https://raw.githubusercontent.com/ashemag/human-atlas/main/public/models/atlas.json";
const USED_SYSTEMS = new Set([
  "skeletal",
  "integumentary",
  "muscular",
  "respiratory",
  "cardiac",
  "digestive",
  "urinary",
  "arterial",
  "venous",
  "lymphatic",
  "nervous",
]);

async function loadManifest() {
  const local = await readFile(LOCAL_MANIFEST, "utf8").catch(() => null);
  if (local) return JSON.parse(local);
  const response = await fetch(UPSTREAM_MANIFEST);
  if (!response.ok) throw new Error(`Could not load Human Atlas manifest (${response.status}).`);
  return response.json();
}

const AIRWAY_RE = /trache|bronch|laryn|pharyn|nasal|sinus/i;
const NON_LUNG_RESPIRATORY_RE = /cartilage|pleura|epiglott|vocal|thyroid/i;
const BRAIN_RE = /brain|cerebr|encephal/i;

function assignment(part) {
  const system = String(part.system);
  const name = String(part.name);
  if (system === "skeletal") {
    return {
      material: "layered corticalBone + trabecularBone + adipose marrow",
      materials: ["corticalBone", "trabecularBone", "adipose"],
      mode: "layered-bone",
    };
  }
  if (system === "respiratory") {
    if (AIRWAY_RE.test(name)) return { material: "air", materials: ["air"], mode: "material" };
    if (NON_LUNG_RESPIRATORY_RE.test(name)) return { material: "soft", materials: ["soft"], mode: "material" };
    return { material: "inflatedLung", materials: ["inflatedLung"], mode: "material" };
  }
  if (system === "muscular") return { material: "muscle", materials: ["muscle"], mode: "material" };
  if (system === "integumentary") return { material: "adipose + soft", materials: ["adipose", "soft"], mode: "mixture" };
  if (system === "cardiac") return { material: "muscle + blood", materials: ["muscle", "blood"], mode: "mixture" };
  if (system === "arterial" || system === "venous") return { material: "blood", materials: ["blood"], mode: "material" };
  if (system === "digestive") return { material: "soft + muscle", materials: ["soft", "muscle"], mode: "mixture" };
  if (system === "urinary") return { material: "soft + blood", materials: ["soft", "blood"], mode: "mixture" };
  if (system === "lymphatic") return { material: "soft", materials: ["soft"], mode: "material" };
  if (system === "nervous") return BRAIN_RE.test(name)
    ? { material: "brain", materials: ["brain"], mode: "material" }
    : { material: "soft", materials: ["soft"], mode: "material" };
  return { material: "UNASSIGNED", materials: [], mode: "unassigned" };
}

function fmt(values) {
  return values.map(v => Number(v).toFixed(4)).join(" / ");
}

const manifest = await loadManifest();
if (!Array.isArray(manifest.parts)) throw new Error("Human Atlas manifest has no parts array.");
const parts = manifest.parts.filter(part => USED_SYSTEMS.has(String(part.system)));
if (!parts.length) throw new Error("No runtime atlas parts found.");

const rows = [];
let unassigned = 0;
let genericBone = 0;
for (const part of parts) {
  const a = assignment(part);
  if (a.mode === "unassigned") unassigned++;
  if (String(part.system) === "skeletal" && a.mode !== "layered-bone") genericBone++;
  const densities = a.materials.map(materialDensity);
  const mu60 = a.materials.map(m => linearAttenuationAtEnergy(m, 60));
  const mu80 = a.materials.map(m => linearAttenuationAtEnergy(m, 80));
  rows.push({
    object: String(part.name),
    system: String(part.system),
    material: a.material,
    "density g/cm3": densities.length ? fmt(densities) : "—",
    "mu@60keV cm^-1": mu60.length ? fmt(mu60) : "—",
    "mu@80keV cm^-1": mu80.length ? fmt(mu80) : "—",
  });
}

rows.sort((a,b) => a.system.localeCompare(b.system) || a.object.localeCompare(b.object));
console.table(rows);

const minimumMaterials = ["corticalBone", "trabecularBone", "soft", "muscle", "adipose", "air"];
const assigned = new Set(parts.flatMap(part => assignment(part).materials));
for (const material of minimumMaterials) {
  if (!assigned.has(material)) throw new Error(`Required radiographic material is absent from atlas assignments: ${material}`);
}

const corticalDensity = materialDensity("corticalBone");
if (corticalDensity < 1.85 || corticalDensity > 1.92) {
  throw new Error(`Cortical bone density ${corticalDensity} g/cm3 is outside 1.85–1.92 g/cm3.`);
}
if (materialDensity("trabecularBone") >= corticalDensity) {
  throw new Error("Trabecular bone density must remain below cortical bone density.");
}
if (linearAttenuationAtEnergy("air", 60) > 0.001 || linearAttenuationAtEnergy("air", 80) > 0.001) {
  throw new Error("Air attenuation is unexpectedly high.");
}
if (genericBone > 0) throw new Error(`${genericBone} skeletal parts are not using the layered energy-dependent bone model.`);
if (unassigned > 0) throw new Error(`${unassigned} atlas parts have no radiographic material assignment.`);

const skeletalSource = await readFile(new URL("../src/lib/sim/atlas-skeletal-projector.ts", import.meta.url), "utf8");
for (const token of ["primaryOpticalDepth", 'corticalBone:', 'trabecularBone:', 'adipose:']) {
  if (!skeletalSource.includes(token)) throw new Error(`Skeletal projector is missing required energy-dependent material path: ${token}`);
}
if (/fixed\s*gray|grayscale\s*bone|boneGray|boneGrey/i.test(skeletalSource)) {
  throw new Error("Skeletal projector appears to contain a fixed grayscale bone path.");
}

console.log(`\nAtlas material audit PASS: ${rows.length} meshes/volumes audited; ${rows.filter(r=>r.system==="skeletal").length} skeletal structures use layered cortical/trabecular/marrow attenuation.`);
