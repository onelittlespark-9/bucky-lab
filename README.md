# Bucky Lab

A radiographic positioning, exposure and **request-vetting** simulator for student radiographers.

Students are presented with realistic imaging requests. They must decide whether each request is appropriate before positioning the patient, collimating, setting exposure factors and exposing. Approximately 40% of valid cases contain pathology that is visible on the resulting radiograph.

## What you practise

### Request justification (new)
- Review clinical history and the requested projections
- Accept appropriate requests or correctly reject unsuitable ones
- Example: history of FOOSH on the **right** wrist but the request asks for the **left** wrist → must be rejected and amended

### Positioning & technique
- Six patients spanning asthenic → hypersthenic habitus
- Multiple projections across thorax, abdomen, pelvis, spine, skull and upper/lower limb
- Collimation, tube angle, SID, grid, focal spot, laterality marker and respiration
- Exposure factors (kVp, mAs) with realistic under-/over-exposure behaviour

### Image critique & pathology
- Tissue attenuation (bone, air, fat, soft tissue) rendered on the simulated radiograph
- Random pathology assigned to ~40% of valid cases (fractures, consolidation, pneumothorax, etc.)
- Practice or assessment mode with scored critique of centring, collimation, rotation and exposure

Handbook values follow Clark's *Positioning in Radiography*.

## Current imaging requests

There are currently **20 imaging requests**, including:

- Wrist (FOOSH – one deliberately incorrect laterality)
- Scaphoid series (4 views)
- Humerus, Femur, Tibia & fibula
- Facial bones
- Ankle, Knee, Shoulder, Elbow, Hand, Foot
- Cervical and lumbar spine
- Chest (acute and pre-operative)
- Hip / neck of femur
- Abdomen

Only ~5% of requests are deliberately unsuitable.

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

No account or database is required for basic use. Session state lives in the browser.

## How a session works

1. Open the library of imaging requests.
2. Select a request and read the clinical history + requested views.
3. Decide whether the request is appropriate:
   - **Accept** → proceed to the X-ray room with the linked patient and first projection.
   - **Reject** → receive feedback explaining why the request is unsuitable (or why it should have been accepted).
4. In the room, position the model, centre the beam, collimate and set exposure factors.
5. Expose. The radiograph shows anatomy (and any assigned pathology) together with under-/over-exposure effects.
6. Review the image critique.

## Licence

Personal / educational use. Clark's *Positioning in Radiography* is a trademark of its publisher; this project is an independent training aid, not an official product.
