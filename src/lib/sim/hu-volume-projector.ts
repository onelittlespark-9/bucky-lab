import type {CtVolume} from "../ct/ct-volume";
import {classifyCtHu,materialId,integrateMaterialVolume,type MaterialVolume,type VolumeRay,type MaterialPaths} from "./voxel-volume-projector";

const cache=new WeakMap<CtVolume,MaterialVolume>();

/** Convert diagnostic CT HU voxels into the material/density representation used by
 * the polyenergetic radiograph projector. This makes CT and plain-film simulation
 * share one patient anatomy instead of maintaining separate hand-drawn models. */
export function ctToMaterialVolume(ct:CtVolume):MaterialVolume{
 const prior=cache.get(ct);if(prior)return prior;
 const[nx,ny,nz]=ct.manifest.dimensions,[sx,sy,sz]=ct.manifest.spacingMm;
 const material=new Uint8Array(ct.voxels.length),density=new Uint8Array(ct.voxels.length);
 for(let i=0;i<ct.voxels.length;i++){
  const c=classifyCtHu(ct.voxels[i]??-1000);
  material[i]=materialId(c.material);
  density[i]=Math.max(0,Math.min(255,Math.round(c.density/1.35*255)));
 }
 const origin=ct.manifest.originMm??[-nx*sx/2,-ny*sy/2,-nz*sz/2];
 const out:MaterialVolume={nx,ny,nz,spacingCm:[sx/10,sy/10,sz/10],originCm:[origin[0]/10,origin[1]/10,origin[2]/10],material,density};
 cache.set(ct,out);return out;
}

export function integrateCtVolume(ct:CtVolume,ray:VolumeRay):MaterialPaths{
 return integrateMaterialVolume(ctToMaterialVolume(ct),ray);
}

/** Parallel-beam DRR reference projection. Geometry-aware cone-beam callers can use
 * integrateCtVolume directly; this helper is useful for previews and validation. */
export function projectCtDrr(ct:CtVolume,width:number,height:number,axis:"ap"|"lateral"="ap"){
 const v=ctToMaterialVolume(ct),out=new Float32Array(width*height),[sx,sy,sz]=v.spacingCm;
 const sizeX=v.nx*sx,sizeY=v.ny*sy,sizeZ=v.nz*sz;
 for(let py=0;py<height;py++)for(let px=0;px<width;px++){
  const u=(px+.5)/width-.5,w=(py+.5)/height-.5;
  const ray:VolumeRay=axis==="ap"
   ?{originCm:[v.originCm[0]+sizeX*(u+.5),v.originCm[1]+sizeY*(w+.5),v.originCm[2]-2],direction:[0,0,1]}
   :{originCm:[v.originCm[0]-2,v.originCm[1]+sizeY*(w+.5),v.originCm[2]+sizeZ*(u+.5)],direction:[1,0,0]};
  const p=integrateMaterialVolume(v,ray);
  out[py*width+px]=p.soft+p.muscle+p.blood+p.brain+p.adipose*.8+p.inflatedLung*.18+p.trabecularBone*1.8+p.corticalBone*3.2;
 }
 return out;
}
