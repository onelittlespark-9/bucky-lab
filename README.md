# Bucky Lab v2

Clinical imaging simulator rebuilt around real volumetric CT anatomy.

`PatientVolume` is the single anatomical source of truth. CT views and radiographic DRRs derive from the same HU volume. Missing anatomy fails visibly; there is no procedural/cartoon fallback.

The first open development source is VSDFullBody, Zenodo DOI 10.5281/zenodo.8270365. These are anonymised postmortem whole-body CT scans and must be labelled as postmortem teaching/development data. The source describes them as CC BY-NC-SA and warns of inconsistencies/duplicates. Multi-GB source archives are not committed to Git.
