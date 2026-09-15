#!/usr/bin/env bash
set -euo pipefail
CASE="${1:-001}"; ROOT="${2:-data/work/${CASE}}"; ZIP="data/source/${CASE}.zip"; DICOM="$ROOT/dicom"; NIFTI="$ROOT/nifti"
mkdir -p "$DICOM" "$NIFTI"; command -v dcm2niix >/dev/null || { echo 'dcm2niix is required'; exit 1; }; [ -f "$ZIP" ] || { echo "Run node scripts/fetch-vsd-case.mjs $CASE first"; exit 1; }
unzip -q "$ZIP" -d "$DICOM"; dcm2niix -z n -f "vsd_${CASE}_%p_%s" -o "$NIFTI" "$DICOM"; echo "Inspect $NIFTI and select the diagnostic whole-body CT series for ingestion."
