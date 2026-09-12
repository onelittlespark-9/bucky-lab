# Bucky Lab

Bucky Lab is a UK-focused diagnostic radiography training simulator for practising the **whole acquisition workflow**: request vetting, patient communication, positioning, collimation, exposure, image critique and clinical decision-making.

It is an educational simulator, not a replacement for local departmental protocols, IR(ME)R procedures, supervision or clinical judgement.

## What the simulator practises

### 1. Department worklist and request vetting

Cases are organised through the departmental workflow rather than starting as a generic anatomy library.

- Inpatient
- Outpatient
- Emergency Department (ED)
- Clinical history and requested projections
- Patient identification and laterality confirmation
- Patient dialogue and discrepancy handling
- Requests can require the student to stop and query an inconsistency before exposure

ED cases also consider mobility. Where movement is unsafe or painful, the worklist can surface an appropriate **modified-view learning pathway** rather than forcing a routine position.

### 2. Positioning and acquisition

The room simulator covers general radiography rather than chest imaging alone.

Students practise:

- Patient positioning and rotation
- Projection selection
- Area of interest (AOI)
- Collimation and light-field adjustment
- Central ray and tube angulation
- SID / OID relationships
- Bucky / detector positioning
- Laterality markers
- Respiration where relevant
- kVp and mAs
- Patient habitus and technique adjustment

Exposure starts from a realistic baseline for the projection and can be adjusted for patient habitus. The student remains responsible for selecting and changing the technique.

### 3. Consequence-based radiographs

The radiograph is intended to be the consequence of the student's acquisition choices, not a pre-rendered answer.

The simulator is being developed around the chain:

**patient + anatomy → positioning → geometry → exposure → attenuation/scatter → detector image**

This includes realistic effects from positioning, rotation, collimation, SID/OID, tube angle and exposure rather than simply changing the appearance of a 3D model.

### 4. Anatomy and patient movement

The patient is treated as a cohesive anatomical rig.

- Skin forms the outer envelope.
- Fat and muscle remain inside and follow the body.
- Skeleton remains internally connected to the same patient rig.
- Ribs follow a natural curved thoracic cage rather than being laid out flat.
- Clavicles, scapulae, spine, pelvis and limbs remain anatomically connected.
- Internal anatomy moves with the patient rather than floating independently.
- Positioning can be changed without exposing internal anatomy during the setup phase.
- Pathology and devices are intended to remain attached to the relevant anatomy.

The model is validated against neutral, raised-arm, flexed-limb, rotated/oblique and supported positions as the anatomy system develops.

## PLATECAANN image critique

The simulator uses the following assessment structure:

- **P — Patient Identification**
- **L — Label / marker**
- **A — Area of Interest**
- **T — Technique / positioning**
- **E — Exposure**
- **C — Collimation**
- **A — Artefacts**
- **A — Abnormality**
- **N — Need for repeat**
- **N — Need for further views**

A technical imperfection is not automatically a repeat. The key question is whether the image answers the clinical question safely and diagnostically.

Collimation follows the same principle: include all required anatomy with the **smallest practical field**. A small safety margin is acceptable; clipping required anatomy is more serious because it can compromise the examination and cause a repeat.

## ED modified-view learning

Emergency cases can expose the student to alternative positioning when normal movement is inappropriate.

Examples currently supported by the simulation workflow include:

- Seated modified axial shoulder
- Seated AP shoulder
- Cross-table hip
- Cross-table knee
- Horizontal-beam cervical spine
- Supported elbow
- Supported ankle
- Portable AP chest

These are simulation pathways and should not be interpreted as universal clinical protocols. Local protocols and supervision always take precedence.

## Data and bootstrap integrity

Bucky Lab deliberately keeps database initialisation and schema changes deterministic.

### Database backends

- **Neon/Postgres** is used when `DATABASE_URL` is configured.
- **PGLite** provides the embedded fallback when `DATABASE_URL` is absent, primarily for development/preview.
- The application exposes one shared SQL surface through `src/lib/db.ts` so application code does not need to know which backend is active.

### Migration integrity

`migrations/*.sql` is the schema source of truth.

Migrations are tracked in `_migrations` and applied in deterministic filename order. The same migration bookkeeping is shared between the deploy-time migrator and the PGLite bootstrap so preview and production use the same schema contract.

The bootstrap is deliberately defensive:

- concurrent PGLite initialisation is shared rather than creating multiple instances;
- migration passes are serialised;
- failed initialisation is not permanently memoised;
- a failed migration transaction is rolled back rather than recorded as applied;
- empty/whitespace `DATABASE_URL` is treated as unset;
- client code cannot initialise the server-only database layer;
- Better Auth preview persistence uses the same PGLite instance as application data.

Do **not** add ad-hoc table creation to individual server functions. Add schema changes as a numbered SQL migration instead.

### Build and integrity checks

Run the following before treating a change as safe:

```bash
npm install
npm run typecheck
npm test
npm run check:auth
npm run build
```

`npm run build` also runs the migration step when `DATABASE_URL` is available. Without `DATABASE_URL`, the local/PGLite path remains available for development and preview.

The GitHub Actions CI build is the merge gate. A feature is not considered integrated into `main` merely because a local build succeeds: CI must pass, the change must be merged, and the resulting deployment should be checked before calling the feature live.

## Local development

```bash
npm install
npm run dev
```

The development server runs on port `8080`.

Useful commands:

```bash
npm run typecheck
npm test
npm run check:auth
npm run build
npm run preview
```

No external database is required for basic local development. Without `DATABASE_URL`, the app uses the PGLite fallback.

## Session workflow

A typical learning session follows:

1. Open the departmental worklist.
2. Select the patient/request.
3. Read the history and requested examination.
4. Identify the patient.
5. Speak to the patient and establish the presenting problem.
6. Confirm the area of interest and side.
7. Assess mobility and select a modified ED view when required.
8. Position the patient, detector and tube.
9. Set the AOI and collimate with the light field.
10. Select/adjust exposure factors for the patient's habitus.
11. Expose.
12. Assess the resulting radiograph using PLATECAANN.
13. Decide whether the image is acceptable, needs repeating, or requires further views.
14. Compare the student's interpretation with the reference information/PACS workflow.

## Current scope

The simulator contains general-radiography requests spanning the thorax, abdomen, pelvis, spine, skull and upper/lower limbs, with normal cases, common pathology, trauma, devices and postoperative scenarios being expanded progressively.

The system is intentionally being built in layers: **workflow integrity first, then positioning, then projection physics and increasingly realistic image formation**. A feature should not bypass the acquisition workflow simply to make a visual result easier to produce.

## Stack

React 19, TanStack Start, Three.js (`@react-three/fiber`), Zustand, Tailwind CSS v4, PGLite and Postgres/Neon.

## Educational reference

Technique values are informed by established radiographic positioning references and UK practice. Local departmental protocols remain authoritative.

## Licence

Personal / educational use. Clark's *Positioning in Radiography* is a trademark of its publisher; Bucky Lab is an independent training aid and is not an official product.
