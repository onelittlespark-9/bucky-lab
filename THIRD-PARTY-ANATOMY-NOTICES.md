# Bucky Lab anatomy provenance

Bucky Lab uses open anatomy resources where reproducing clinically meaningful anatomy from scratch would be unnecessarily weak or time-consuming.

## 3D anatomy

- **Z-Anatomy / BodyParts3D** is used as the anatomical reference/asset source for the interactive skeletal and body atlas. Z-Anatomy is distributed under CC BY-SA 4.0 and identifies BodyParts3D as an upstream source.
- **BodyParts3D** models are CC BY-SA material. Attribution and ShareAlike obligations remain with any distributed derivatives.
- The Bucky Lab radiograph renderer does **not** copy screenshots from third-party teaching websites. It uses independently authored projection geometry and the open anatomical atlas as reference material.

## Radiographic appearance reference

The Radiologist Anatomy Gallery is used as a **clinical visual reference standard** for projection appearance, anatomical inclusion, positioning and recognisable radiographic relationships. Its published images are not bundled as Bucky Lab assets.

## Engineering rule

Where an open-source module provides a substantially better anatomical or geometric primitive than a hand-built approximation, prefer the open module provided its licence is compatible with the application's distribution model. Record provenance here before shipping derived assets.

Where no suitable open module exists, Bucky Lab uses independently authored geometry rather than substituting generic boxes, capsules or decorative shapes.
