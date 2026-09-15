#!/usr/bin/env python3
"""Prepare an authorised de-identified CT series for Bucky Lab.

The script intentionally does not download controlled datasets. It operates on a
DICOM directory the user is already authorised to access, calls dcm2niix, then
converts the resulting NIfTI into Bucky Lab's little-endian int16 HU volume and
manifest. Requires: dcm2niix, Python packages nibabel and numpy.
"""
from __future__ import annotations
import argparse, json, shutil, subprocess, tempfile
from pathlib import Path
import numpy as np
import nibabel as nib


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('dicom_dir', type=Path)
    p.add_argument('output_dir', type=Path)
    p.add_argument('--case-id', required=True)
    p.add_argument('--source-name', required=True)
    p.add_argument('--collection', required=True)
    p.add_argument('--licence', required=True)
    p.add_argument('--citation', required=True)
    p.add_argument('--doi', required=True)
    args = p.parse_args()

    if not args.dicom_dir.is_dir():
        raise SystemExit(f'DICOM directory not found: {args.dicom_dir}')
    if shutil.which('dcm2niix') is None:
        raise SystemExit('dcm2niix is required and was not found on PATH')

    args.output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['dcm2niix', '-z', 'n', '-f', 'volume', '-o', tmp, str(args.dicom_dir)], check=True)
        nii = Path(tmp) / 'volume.nii'
        if not nii.exists():
            candidates = list(Path(tmp).glob('*.nii'))
            if len(candidates) != 1:
                raise SystemExit('Expected one CT NIfTI volume; split/ambiguous series must be resolved before import')
            nii = candidates[0]
        image = nib.load(str(nii))
        data = np.asanyarray(image.dataobj, dtype=np.float32)
        if data.ndim != 3:
            raise SystemExit(f'Expected a 3-D CT volume, got shape {data.shape}')
        finite = data[np.isfinite(data)]
        if finite.size == 0 or finite.min() > -500 or finite.max() < 300:
            raise SystemExit('Voxel range is not credible for a CT HU volume; verify rescale/orientation before import')
        hu = np.clip(np.rint(data), -32768, 32767).astype('<i2', copy=False)
        volume_name = 'volume.i16'
        hu.tofile(args.output_dir / volume_name)
        spacing = [float(x) for x in image.header.get_zooms()[:3]]
        affine = [[float(x) for x in row] for row in image.affine]
        manifest = {
            'version': 1,
            'caseId': args.case_id,
            'dimensions': list(map(int, hu.shape)),
            'spacingMm': spacing,
            'affine': affine,
            'encoding': 'int16-le',
            'volumeUrl': f'/cases/{args.case_id}/{volume_name}',
            'huRange': [int(hu.min()), int(hu.max())],
            'source': {
                'name': args.source_name,
                'collection': args.collection,
                'licence': args.licence,
                'citation': args.citation,
                'doi': args.doi,
            },
        }
        (args.output_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        print(json.dumps({'caseId': args.case_id, 'shape': hu.shape, 'spacingMm': spacing, 'huRange': manifest['huRange']}, indent=2))


if __name__ == '__main__':
    main()
