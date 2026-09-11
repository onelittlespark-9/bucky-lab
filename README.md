# Bucky Lab

A radiographic positioning and exposure simulator. Position a patient, collimate, set kVp / mAs / SID, and expose — then mark the image against Clark's *Positioning in Radiography* criteria.

Built for student radiographers who want to practise **centring, collimation, and exposure technique** on models with different body habitus before they step into a real room.

## What you practise

- **Six patients** spanning asthenic → hypersthenic habitus, with different part thickness, viscera height, and tissue attenuation
- **18 projections** across thorax, abdomen, pelvis, spine, skull, and upper/lower limb
- **Collimation, tube angle, SID, grid, focal spot, laterality marker, and respiration**
- **Exposure factors** (kVp, mAs) with a visible difference between under-exposure noise, a diagnostic window, and over-exposure burn-out
- **Tissue attenuation** — bone, air, fat, and soft tissue render as distinct densities on the simulated radiograph
- **Practice or assessment mode**, with a scored critique of centring, collimation, rotation, and exposure

Handbook values in the library (centring landmarks, FFD, collimation, kVp/mAs starting points) follow Clark's.

## Stack

React 19, TanStack Start, Three.js (`@react-three/fiber`), Zustand, Tailwind CSS v4.

## Run locally

```bash
npm install
npm run dev
```

The lab starts on port 8080.

```bash
npm run build    # production build
npm run typecheck
```

No account or database is required. Session state lives in the browser.

## How a session works

1. Pick a patient and a projection from the library.
2. In the room, move the model, centre the beam on the stated landmark, and collimate to the required field.
3. Set kVp, mAs, SID, grid, and marker to match the examination (and the patient's habitus).
4. Expose. The radiograph shows bone, air, and soft tissue with under-/over-exposure artefacts when the factors are wrong.
5. Open the critique to see how close the centring, collimation, and exposure were to the handbook standard.

## Licence

Personal / educational use. Clark's *Positioning in Radiography* is a trademark of its publisher; this project is an independent training aid, not an official product.
