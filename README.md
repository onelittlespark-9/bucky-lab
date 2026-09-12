# Bucky Lab

A UK-focused radiographic positioning, exposure and request-vetting simulator for student radiographers.

Bucky Lab is designed as a **closed learning and engineering feedback loop**: students use the simulator, report what is unclear or clinically unrealistic, structured context is captured, and that evidence is used to prioritise the next architecture change.

## Continuous improvement loop

The app includes an in-app **Feedback** control available throughout the session. Feedback is structured by area (bug, positioning, anatomy, radiograph, workflow, performance, learning or other), rated 1–5, and stored locally in a bounded queue.

Each submission records only useful simulator context such as screen, mode, projection and request context. Patient identifiers are deliberately removed before storage. Free-text feedback should never contain patient-identifiable information.

The intended engineering loop is:

```text
Student action
    ↓
Result / friction / error
    ↓
In-app feedback + simulator context
    ↓
Prioritise repeated failures
    ↓
Architecture or clinical-model change
    ↓
Typecheck → tests → build → CI
    ↓
Verify in the simulator
    ↓
Release
    ↓
Collect the next cycle of evidence
```

Feedback is deliberately **evidence-led rather than change-on-request**. A single suggestion can expose a bug, but repeated reports and reproducible simulator behaviour should drive architectural changes. Clinical changes must also be checked against appropriate UK practice before becoming training rules.

The feedback store is currently local-first and dependency-free. This keeps the simulator usable offline and avoids silently sending educational-session data to a third party. A future authenticated export/sync layer can consume the same `FeedbackRecord` shape without changing the student-facing workflow.

## What you practise

### Request vetting
- Review clinical history and requested projections.
- Identify laterality, anatomy and clinical mismatches before exposure.
- Accept appropriate requests or stop and query unsuitable ones.

### Department-aware workflow
Requests can be separated into:
- **Inpatient** — ward-based patients and appropriate mobility constraints.
- **Outpatient** — planned examinations and routine positioning.
- **Emergency Department** — acute presentations where movement may be painful or unsafe.

ED cases can automatically surface modified-view options. For example, a simulated limited-mobility shoulder case can use a seated modified axial approach rather than forcing an injured patient into a standard position.

These are educational simulation choices, not universal clinical protocols; local departmental protocols and radiographer judgement take precedence in real practice.

### Positioning & technique
- Multiple projections across thorax, abdomen, pelvis, spine, skull and upper/lower limb.
- Patient positioning, detector/Bucky positioning, centring, tube angle, SID/OID and collimation.
- Physical laterality markers and respiration where relevant.
- Exposure factors with patient-habitus-dependent starting techniques.
- Projection physics intended to make positioning errors affect the resultant radiograph rather than merely changing a 3D scene.

### Anatomy
The patient is built as a cohesive anatomical rig rather than independent floating models:

- skin as the outer envelope;
- subcutaneous tissue and muscle beneath it;
- connected skeleton;
- naturally curved and connected ribs;
- shoulder girdle and limbs attached to the same kinematic system;
- internal organs positioned inside the body;
- pathology and devices able to move with the relevant anatomy.

The architecture is validated against multiple positioning states rather than only a neutral standing pose.

### Radiograph and critique
The intended chain is:

```text
Patient + pathology
        ↓
Positioning / SID / OID / tube angle / collimation
        ↓
Tissue attenuation + superimposition + exposure
        ↓
Simulated radiograph
        ↓
Technical assessment
        ↓
PLATECAANN critique
        ↓
Improvement / repeat / further view
```

PLATECAANN covers Patient Identification, Label/Marker, Area of Interest, Technique/Positioning, Exposure, Collimation, Artefacts, Abnormality, Need for Repeat and Need for Further Views.

A technically imperfect image is not automatically a repeat. The key question is whether it answers the clinical question without an avoidable diagnostic limitation.

## Request justification
Students are presented with realistic imaging requests and must decide whether the request is appropriate before positioning and exposing.

Example: a history of FOOSH on the **right** wrist with a request for the **left** wrist should trigger a stop/query rather than allowing the student to continue blindly.

## Exposure model
Each projection has a baseline technique representing an average patient. Patient habitus modifies the suggested starting technique:

- slim → baseline or slightly reduced;
- average → baseline;
- large → increased;
- very large → further increased.

Students can override kVp and mAs. Assessment focuses on the resulting diagnostic image as well as the student's technique decisions.

## Collimation / ALARP
Collimation follows a practical ALARP approach:

- include all required anatomy;
- use the smallest practical field that reliably achieves this;
- allow a small practical margin where it reduces the risk of clipping anatomy;
- avoid unnecessary irradiation and scatter;
- do not treat mathematically perfect field edges as more important than diagnostic completeness.

The simulator should distinguish between **poor positioning**, which cannot simply be fixed with a huge field, and **insufficient collimation**, which may clip required anatomy.

## Bootstrap and integrity
The application uses a defensive database bootstrap architecture:

- Neon/Postgres when `DATABASE_URL` is configured;
- PGLite fallback for local/preview operation;
- shared initialisation state across development/HMR module instances;
- serialised PGLite migration passes;
- migration tracking through `_migrations`;
- failed initialisation does not permanently poison the memoised promise;
- database access is server-only;
- schema is defined through migrations rather than ad-hoc server-function SQL.

The feedback system follows the same integrity principle: bounded local storage, explicit schema, no patient identifiers, and a defined path from observation to tested architecture change.

## Verification gate
A change is not considered integrated merely because the code has been committed. The normal gate is:

1. typecheck;
2. automated tests;
3. production build;
4. CI passes;
5. merge to `main`;
6. deployment completes;
7. live behaviour is checked where appropriate;
8. the next feedback cycle begins.

## Stack

React 19, TanStack Start, Three.js (`@react-three/fiber`), Zustand, Tailwind CSS v4, PGLite/Neon database support.

## Run locally

```bash
npm install
npm run dev
```

The lab starts on port 8080.

```bash
npm run typecheck
npm test
npm run build
```

No external analytics service is required for the feedback loop.

## Licence

Personal / educational use. Clark's *Positioning in Radiography* is a trademark of its publisher; this project is an independent training aid, not an official product.
