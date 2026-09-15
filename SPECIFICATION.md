# Bucky Lab v2 — clean specification

This branch is a from-scratch implementation. No renderer, generated route tree, historical test, database/auth layer, atlas connector, procedural phantom, or compatibility shim from Bucky Lab v1 is retained.

## Product goal
Bucky Lab is an educational radiography and advanced-imaging simulator. The target is clinically plausible imaging behaviour, not an illustration that resembles an X-ray.

## Source-of-truth rule
Production anatomy must come from appropriately licensed, de-identified volumetric imaging data. CT Hounsfield units are retained as the canonical patient anatomy. Synthetic ellipses, stick skeletons, surface-only meshes and cartoon phantoms must never silently replace missing clinical anatomy. When a dataset is absent the UI must say so.

## Radiography
A radiograph is a forward projection through the patient volume. Source/detector geometry, SID, central ray, patient position, rotation, collimation and detector dimensions must affect which anatomy is projected. Attenuation is calculated before display processing. Exposure controls must affect photon statistics and image quality rather than redraw anatomy. The long-term physical pipeline is spectrum -> material/HU attenuation -> Beer-Lambert primary -> scatter -> quantum noise -> focal-spot/motion/detector blur -> detector response -> display processing.

Anatomical fidelity must be sufficient to assess cortex/trabecular structure, joint margins, lungs, mediastinum/heart, diaphragm and abdominal soft tissues. Positioning and collimation consequences must remain anatomically visible; for example, incorrect chest collimation can include the iliac crests rather than cropping anatomy to an idealised view.

## CT Advanced Imaging
CT is a dedicated workspace and part of the test/learning environment. Initial protocol families: CT Head, CT CAP, CT Colonography, Major Trauma, CTPA, CT Aorta and CT KUB. Teaching phase presets include non-contrast, arterial, portal venous, delayed and Camp Bastion-style split-bolus trauma where relevant. These are educational UK/NHS-style presets; exact Trust/scanner/indication protocols vary.

CT cases must be real-volume case records with explicit source, collection, licence and attribution. Axial scrolling and clinical window/level are derived directly from HU data. Later MPR/MIP/3-D views must derive from the same volume, not a second synthetic renderer.

## Case library
Protocol and case are separate concepts. A protocol describes acquisition intent; a case points to one de-identified volume and verified metadata. Diagnoses/pathologies are shown only when supported by source metadata. Planned teaching coverage includes normal and pathological head, CAP/oncology, colonography, major trauma, pulmonary embolism, aortic pathology and urinary calculus cases.

## Engineering constraints
One anatomy representation feeds CT and radiography. No duplicate anatomy engines. No direct optical-density pathology painting. No tests that assert obsolete implementation variable names. Tests must validate observable contracts, geometry, HU integrity, attenuation monotonicity and image behaviour. Browser/DOM rendering is kept outside pure physics modules. Missing data fails visibly rather than invoking a hidden synthetic fallback.
