# Bucky Lab branch audit — 12 September 2026

## Decision

All 27 existing branches were reviewed against `main`. No stale branch should be merged wholesale into `main`. The branches that contain work aligned with the current roadmap are either already represented in the newer `main` history or are superseded by a later implementation that is safer and more complete.

The current architecture remains the source of truth:

`landing → case library → clinical interview → setup → articulated patient → projection-specific anatomy → radiographic projection/attenuation → radiograph → PLATECAANN assessment`

## Branch review

| Branch | Result | Action |
|---|---|---|
| `main` | Current source of truth | Keep |
| `codex-test-write-access` | Diverged; 15 commits ahead but contains broad older rewrites of Library, PatientModel, XrayRoom, viewer, exposure, scoring, store and types | Do not merge; later main architecture supersedes it |
| `feature/anatomically-detailed-skeleton` | 3 commits ahead; adds `DetailedSkeletalLayer`/`DetailedSkeletalOverlay` | Do not merge wholesale; superseded by the Human Atlas skeletal layer and later articulated anatomy work |
| `feature/anatomy-bone-joint-rig` | 4 commits ahead; adds `BoneJointLayer` | Do not merge; later atlas skeletal rig is the preferred anatomical source |
| `feature/attached-soft-tissue-ribcage` | 0 commits ahead; fully behind main | Already represented in later main history |
| `feature/cloudflare-deploy-fix` | Same tip as the other Cloudflare-fix branches; 0 commits ahead | No action |
| `feature/cloudflare-deploy-fix-2` | Same tip as Cloudflare-fix | No action |
| `feature/cloudflare-deploy-fix-3` | Same tip as Cloudflare-fix | No action |
| `feature/cloudflare-deploy-fix-4` | Same tip as Cloudflare-fix | No action |
| `feature/cloudflare-deploy-fix-5` | Same tip as Cloudflare-fix | No action |
| `feature/cloudflare-deploy-fix-6` | Same tip as Cloudflare-fix | No action |
| `feature/cloudflare-deploy-fix-7` | Same tip as Cloudflare-fix | No action |
| `feature/cloudflare-deploy-fix-8` | Same tip as Cloudflare-fix | No action |
| `feature/cloudflare-deploy-fix-9` | Same tip as Cloudflare-fix | No action |
| `feature/cloudflare-deploy-fix-10` | Same tip as Cloudflare-fix | No action |
| `feature/cloudflare-deploy-fix-11` | Same tip as Cloudflare-fix | No action |
| `feature/cloudflare-deploy-fix-final` | Same tip as Cloudflare-fix | No action |
| `feature/cloudflare-deploy-fix-use` | Same tip as Cloudflare-fix | No action |
| `feature/cloudflare-deploy-fix-use2` | Same tip as Cloudflare-fix | No action |
| `feature/cloudflare-deploy-fix-use3` | Same tip as Cloudflare-fix | No action |
| `feature/easier-room-positioning` | 0 commits ahead; its deployment-cleanup change is already effective on main | No action |
| `feature/general-radiography-training` | 0 commits ahead; fully incorporated | No action |
| `feature/patient-case-simulation-engine` | 0 commits ahead; fully incorporated | No action |
| `feature/radiographic-physics-and-anatomy` | 4 commits ahead but based on an older PatientModel/scoring architecture | Do not merge; current Human Atlas patient and PLATECAANN implementations supersede it |
| `feature/radiographic-projection-physics` | 2 commits ahead; older XrayRoom/render-radiograph implementation | Do not merge wholesale; current projection-physics and radiographic anatomy pipeline supersede it |
| `fix/assessment-engine-pa-chest` | 1 commit ahead, but the current `platecaann.ts` already contains the substantive improvements | No action |
| `fix/unified-patient-anatomy-rig` | 7 commits ahead but its PatientRig/atlas integration is an intermediate version | Do not merge; current PatientRig + HumanAtlas layers are later and more complete |

## Important findings

1. **There is no missing branch that should simply replace `main`.** Several branches are older snapshots of work that has subsequently been rebuilt in a better architecture.
2. The most important anatomy branches are **superseded rather than ignored**. Main now uses the cohesive Human Atlas patient architecture, articulated kinematics and projection-specific radiographic anatomy.
3. The PA-chest assessment branch is **already represented** in the current PLATECAANN engine, including geometry-based sharpness, detector exposure, collimation and positioning logic.
4. The case-simulation branch is already represented and has since been expanded to the current 150-case bank.
5. The rib-cage branch is an ancestor of the current line and therefore requires no merge.
6. The large family of Cloudflare-fix branches all point to the same historical commit and contribute nothing unique to the current codebase.
7. The old `codex-test-write-access` branch is specifically excluded because it rewrites major parts of the application around an older architecture and would regress the current simulator.

## Merge policy going forward

Do not merge feature branches wholesale merely because their names match the roadmap. Compare the branch with `main`, inspect the changed files, and transplant only a genuinely missing improvement when it is compatible with the current architecture and passes the clinical-realism requirements.

For anatomy, prefer:

`open anatomical atlas → articulated patient rig → projection-specific anatomy → ray/projection physics`

For assessment, prefer observable radiographic consequences over labels or arbitrary score changes.

For cases, prefer clinically coherent patient/request/interview scenarios over simply increasing the case count.
