# Bucky Lab — open-source research and integration policy

Bucky Lab is an educational radiography simulator. The target is a clinically recognisable patient, positioning workflow and resultant radiograph — not a decorative mannequin or a photographic overlay.

## Sources to use when they solve a problem better than hand-built code

### 1. Z-Anatomy / BodyParts3D
- Repository: https://github.com/Z-Anatomy/Models-of-human-anatomy
- Use for: detailed skeletal, muscular and organ geometry; anatomical naming and structure identity.
- Licence: Z-Anatomy content is CC BY-SA 4.0; BodyParts3D source attribution must also be preserved.
- Rule: keep source geometry and derivative geometry attribution visible in the repository. Do not silently merge assets with incompatible licences.

### 2. BodyParts3D-derived browser atlases
- Human Atlas: https://github.com/ashemag/human-atlas
- Open Anatomy Atlas: https://github.com/desmond9986/open-anatomy-atlas
- Use for: browser-ready Three.js patterns, structure lookup, system grouping and efficient anatomy rendering.
- Do not copy application code or assets unless their individual licence permits it; use these projects primarily as implementation references or explicitly compatible source material.

### 3. NIH Human Reference Atlas / HuBMAP
- Use when an open CC BY organ-scale or female anatomy source is more appropriate than extending the male BodyParts3D-derived model.
- Keep atlas files licence-scoped. Do not combine CC BY-SA and CC BY/other assets into a derivative asset without checking the resulting obligations.

### 4. gVirtualXray / gVXR
- Repository: https://github.com/effepivi/gvxr-CMPB
- Research: gVirtualXray uses the Beer-Lambert law and triangular anatomical meshes to produce GPU-accelerated X-ray simulations, with comparisons against Monte Carlo simulations, DRRs and real radiographs.
- Use for: validating Bucky Lab's projection model and as the reference architecture for a future WebGPU/WASM or server-side mesh-projection backend.
- Do not import a Python/C++ desktop dependency into the browser simply because it exists. Bucky Lab should keep its current browser-first analytic renderer and introduce a mesh projection backend only when it improves clinical fidelity without making the teaching workflow unusable.

### 5. OpenDRR
- Repository: https://github.com/Tiliquarugosa/OpenDRR
- Use for: DRR projection concepts, perspective geometry, density/material maps and validation methodology.
- It is particularly useful as a reference for SID/OID, perspective projection and attenuation rather than as a direct browser dependency.

### 6. Clinical visual reference
- The Radiologist Anatomy Gallery: https://theradiologist.co.uk/anatomy-gallery/
- Use as a visual/clinical reference for anatomy, projection appearance, superimposition and positioning criteria.
- Do not copy or redistribute its clinical images. Bucky Lab must generate its own resultant radiographs.

## Engineering decision

Prefer the following order:

1. **Use a genuinely open anatomical asset** when creating accurate 3D geometry would otherwise require thousands of hand-built structures.
2. **Implement projection mathematics ourselves** where it is small, deterministic and useful for teaching (SID/OID, magnification, tube angle, rotation, collimation and simple attenuation).
3. **Use an established open-source simulation engine or research implementation** when the underlying problem is a genuine physics/rendering problem that should not be approximated with visual tricks.
4. **Never use a reference radiograph as a texture to disguise inadequate anatomy.**
5. Keep the 3D anatomy and radiographic anatomy on the same anatomical coordinate/structure model so that a positioning error changes both the patient and the radiograph consistently.

## Clinical realism gates

Every new projection should eventually pass these gates:

- correct anatomy is present before exposure;
- positioning changes anatomical relationships, not just the camera;
- beam direction changes projected anatomy;
- rotation produces recognisable asymmetry/superimposition;
- SID/OID changes magnification and unsharpness;
- tissue thickness affects attenuation and technique requirements;
- collimation controls the exposed field;
- anatomical inclusion is assessed against the projection's actual criteria;
- exposure assessment is separated from positioning assessment;
- pathology is applied to the appropriate anatomy rather than pasted into a generic body region;
- the final image remains recognisable as a clinical radiograph without any reference-image overlay.

## Current implementation direction

`radiographic-anatomy-geometry.ts` is the bridge between projection-specific anatomical geometry and the existing attenuation renderer. This is intentional: it allows the project to improve anatomical fidelity incrementally now while leaving a clean path to a true mesh/volume DRR backend later.

The next major physics upgrade should therefore be **mesh-derived ray projection**, not more arbitrary 2D ellipses. The existing procedural geometry remains as a deterministic fallback for structures that are not yet represented by a suitable open mesh.
