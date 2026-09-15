#!/usr/bin/env python3
import argparse,json,math
from pathlib import Path
import nibabel as nib
import numpy as np
from nibabel.processing import resample_to_output
p=argparse.ArgumentParser();p.add_argument('nifti');p.add_argument('out');p.add_argument('--case-id',default='vsd-z053');p.add_argument('--voxel-mm',type=float,default=2.5);p.add_argument('--chunk-mb',type=int,default=16);a=p.parse_args()
img=nib.load(a.nifti);img=resample_to_output(img,voxel_sizes=(a.voxel_mm,)*3,order=1);data=np.asarray(img.dataobj,dtype=np.float32)
if data.ndim!=3:raise SystemExit(f'Expected 3D CT, got {data.shape}')
finite=data[np.isfinite(data)];lo,hi=float(finite.min()),float(finite.max())
if lo>-500 or hi<300:raise SystemExit(f'Not credible CT HU: {lo}..{hi}')
hu=np.clip(np.rint(np.nan_to_num(data,nan=-1000)), -32768,32767).astype('<i2');out=Path(a.out);out.mkdir(parents=True,exist_ok=True);raw=hu.tobytes(order='F');chunk=a.chunk_mb*1024*1024;urls=[]
for i in range(math.ceil(len(raw)/chunk)):
 name=f'volume-{i:03d}.i16';(out/name).write_bytes(raw[i*chunk:(i+1)*chunk]);urls.append(f'/cases/{a.case_id}/{name}')
manifest={'version':1,'caseId':a.case_id,'dimensions':[int(x) for x in hu.shape],'spacingMm':[float(x) for x in img.header.get_zooms()[:3]],'affine':img.affine.tolist(),'encoding':'int16-le','chunks':urls,'huRange':[int(hu.min()),int(hu.max())],'source':{'name':'VSDFullBody z053','collection':'The Virtual Skeleton Database Full Body CT Collection','licence':'CC BY-NC-SA (source record)','attribution':'Kistler, Michael. VSDFullBody. Zenodo, 2013.','doi':'10.5281/zenodo.8270365','patientType':'postmortem'}}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps({'shape':manifest['dimensions'],'spacing':manifest['spacingMm'],'chunks':len(urls),'bytes':len(raw),'huRange':manifest['huRange']},indent=2))
