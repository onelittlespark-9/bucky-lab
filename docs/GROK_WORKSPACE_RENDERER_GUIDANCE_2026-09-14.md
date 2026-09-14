# Renderer guidance extracted from the supplied Grok workspace

This note records the implementation-relevant conclusions from the evidence workspace supplied on 14 September 2026. It is a design constraint for Bucky Lab rather than a claim that the current browser renderer already implements every stage.

## Non-negotiable image model

A radiograph must be produced from material-dependent X-ray transmission, not an X-ray-looking shader or fixed greyscale lookup. Tissue geometry must be joined to energy-dependent attenuation data. The supplied review recommends ICRU 44/46 tissue composition with NIST SRD 126 / XCOM coefficients and explicitly distinguishes imaging attenuation (mu/rho) from energy-absorption coefficients used for dose.

The source review also recommends a polychromatic spectrum rather than a single effective photon energy. SpekPy plus the Omar 2020 angular/heel-effect model is the preferred spectrum direction, with TASMIP/spektr as a fallback/reference. The browser implementation may use a compact approximation for latency, but its kVp response must change the spectrum and therefore the relative material attenuation.

## Primary projection

The supplied evidence recommends gVirtualXRay/Freud-style primary transmission for polygon meshes and Siddon/Plastimatch for CT volumes. GATE/Geant4 is the validation target, not the interactive renderer. The intended learning loop should remain fast enough for repeated student exposures; the workspace proposes a sub-second target and cites ProjectionVR geometric agreement as a useful benchmark.

## Scatter, grid and detector

The workspace is explicit that primary-only transmission is not the final clinical image model. Scatter should be phased: first disclose limitations; then add low-frequency first-order Compton/scatter and grid transmission; finally validate or bake higher-fidelity Monte-Carlo scatter for high-stakes images. Detector response, noise, DQE/MTF and grid behaviour should remain physically linked to exposure factors rather than being decorative post-processing.

## Anatomy representation

The evidence favours labelled anatomical meshes/phantoms over game-character geometry. BodyParts3D/FMA is recommended as an open labelled mesh source, with XCAT/ICRP or patient-specific CT segmentation as higher-fidelity reference/twin options. Anatomy must be materially attributed so the same structure that is labelled in learning mode is also the structure participating in attenuation.

## Regression criteria prompted by the current renders

The current chest/abdomen/pelvis screenshots expose several failure modes that should be treated as automated visual/physics regression targets:

- no cortical wireframe or hollow-outline skeleton; projected bone must contain attenuating volume with cortical/trabecular variation;
- chest field must show a clinically recognisable thorax rather than a dark rectangular void, with lungs dark but containing vascular/interstitial markings and superimposed ribs;
- mediastinum, heart, diaphragms and chest wall should arise from summed path attenuation, not opaque masks;
- abdominal soft tissue must retain a broad diagnostic grey scale, including psoas/renal/bowel-gas relationships where anatomy permits;
- pelvis must show iliac, sacral, acetabular, pubic and proximal femoral structures as volumetric bone, with soft-tissue superimposition rather than luminous outlines;
- changing kVp must alter relative subject contrast through the spectrum/material calculation; mAs should primarily alter receptor exposure/noise rather than anatomy contrast;
- collimation and centring must crop the same physical atlas coordinates used by the assessment engine.

## Implementation order

1. Polychromatic material transmission and beam hardening.
2. Replace outline-heavy bone gain with volume/path-length attenuation and restrained cortical enhancement.
3. Region-specific display transforms for thorax versus abdomen/pelvis without painting anatomy into the image.
4. Low-frequency scatter plus grid transmission.
5. Detector MTF/noise calibration.
6. Validate canonical PA chest, AP abdomen and AP pelvis against reference radiographs before tuning less common projections.
7. Retain the labelled learning mode as an overlay generated from the same anatomical structures used by the attenuation renderer.
