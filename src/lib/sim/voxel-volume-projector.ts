import type { MaterialPath, RadiographicMaterial } from "./nist-attenuation";

/**
 * CPU reference projector for CT/label-map derived anatomy.
 *
 * The volume stores a material id and density scale per voxel. Rays are integrated
 * through the volume with a 3-D DDA traversal, so air/lung replaces tissue rather
 * than being composited as a surface-mesh tint. The resulting MaterialPath can be
 * passed directly to createPrimaryBeamModel(), retaining the existing polyenergetic
 * Beer-Lambert physics.
 */
export interface MaterialVolume {
  nx:number; ny:number; nz:number;
  spacingCm:readonly [number,number,number];
  originCm:readonly [number,number,number];
  material:Uint8Array;
  /** Relative physical density / partial-volume occupancy. 255 = nominal material density. */
  density:Uint8Array;
}

export interface VolumeRay {
  originCm:readonly [number,number,number];
  direction:readonly [number,number,number];
}

const MATERIAL_BY_ID:readonly (RadiographicMaterial|null)[]=[
  null,"air","inflatedLung","adipose","soft","muscle","blood","brain","trabecularBone","corticalBone","metal",
];

function axisInterval(o:number,d:number,lo:number,hi:number):[number,number]|null{
  if(Math.abs(d)<1e-10)return o>=lo&&o<=hi?[-Infinity,Infinity]:null;
  const a=(lo-o)/d,b=(hi-o)/d;return a<b?[a,b]:[b,a];
}

function volumeInterval(v:MaterialVolume,ray:VolumeRay):[number,number]|null{
  let lo=-Infinity,hi=Infinity;
  const max:[number,number,number]=[
    v.originCm[0]+v.nx*v.spacingCm[0],
    v.originCm[1]+v.ny*v.spacingCm[1],
    v.originCm[2]+v.nz*v.spacingCm[2],
  ];
  for(let a=0;a<3;a++){
    const q=axisInterval(ray.originCm[a]!,ray.direction[a]!,v.originCm[a]!,max[a]!);if(!q)return null;
    lo=Math.max(lo,q[0]);hi=Math.min(hi,q[1]);if(hi<=lo)return null;
  }
  return[lo,hi];
}

export function integrateMaterialVolume(v:MaterialVolume,ray:VolumeRay):MaterialPath{
  const hit=volumeInterval(v,ray);if(!hit)return{};
  const [entry,exit]=hit,d=ray.direction,norm=Math.hypot(d[0],d[1],d[2]);if(norm<1e-10)return{};
  const dir:[number,number,number]=[d[0]/norm,d[1]/norm,d[2]/norm];
  // Recompute parameter interval for unit direction so accumulated distances are centimetres.
  const unitHit=volumeInterval(v,{originCm:ray.originCm,direction:dir});if(!unitHit)return{};
  let t=Math.max(0,unitHit[0])+1e-6;const end=unitHit[1];if(end<=t)return{};
  const p:[number,number,number]=[ray.originCm[0]+dir[0]*t,ray.originCm[1]+dir[1]*t,ray.originCm[2]+dir[2]*t];
  let ix=Math.max(0,Math.min(v.nx-1,Math.floor((p[0]-v.originCm[0])/v.spacingCm[0]))),iy=Math.max(0,Math.min(v.ny-1,Math.floor((p[1]-v.originCm[1])/v.spacingCm[1]))),iz=Math.max(0,Math.min(v.nz-1,Math.floor((p[2]-v.originCm[2])/v.spacingCm[2])));
  const stepX=dir[0]>=0?1:-1,stepY=dir[1]>=0?1:-1,stepZ=dir[2]>=0?1:-1;
  const inf=Infinity;
  const deltaX=Math.abs(dir[0])>1e-10?v.spacingCm[0]/Math.abs(dir[0]):inf,deltaY=Math.abs(dir[1])>1e-10?v.spacingCm[1]/Math.abs(dir[1]):inf,deltaZ=Math.abs(dir[2])>1e-10?v.spacingCm[2]/Math.abs(dir[2]):inf;
  const boundary=(i:number,step:number,origin:number,spacing:number)=>origin+(i+(step>0?1:0))*spacing;
  let nextX=Math.abs(dir[0])>1e-10?t+(boundary(ix,stepX,v.originCm[0],v.spacingCm[0])-p[0])/dir[0]:inf;
  let nextY=Math.abs(dir[1])>1e-10?t+(boundary(iy,stepY,v.originCm[1],v.spacingCm[1])-p[1])/dir[1]:inf;
  let nextZ=Math.abs(dir[2])>1e-10?t+(boundary(iz,stepZ,v.originCm[2],v.spacingCm[2])-p[2])/dir[2]:inf;
  const out:MaterialPath={};
  while(t<end&&ix>=0&&ix<v.nx&&iy>=0&&iy<v.ny&&iz>=0&&iz<v.nz){
    const next=Math.min(end,nextX,nextY,nextZ),length=Math.max(0,next-t),idx=(iz*v.ny+iy)*v.nx+ix,id=v.material[idx]??0,material=MATERIAL_BY_ID[id]??null;
    if(material&&length>0){const density=(v.density[idx]??255)/255;out[material]=(out[material]??0)+length*density;}
    t=next;
    if(nextX<=next+1e-9){ix+=stepX;nextX+=deltaX;}
    if(nextY<=next+1e-9){iy+=stepY;nextY+=deltaY;}
    if(nextZ<=next+1e-9){iz+=stepZ;nextZ+=deltaZ;}
  }
  return out;
}

export function materialId(material:RadiographicMaterial):number{return Math.max(0,MATERIAL_BY_ID.indexOf(material));}

/** Convert a CT HU voxel to a coarse radiographic material and relative density. */
export function classifyCtHu(hu:number):{material:RadiographicMaterial;density:number}{
  if(hu<-900)return{material:"air",density:Math.max(.2,Math.min(1,(hu+1100)/200))};
  if(hu<-450)return{material:"inflatedLung",density:Math.max(.25,Math.min(1,(hu+1000)/550))};
  if(hu<-40)return{material:"adipose",density:Math.max(.75,Math.min(1.1,1+(hu+100)/500))};
  if(hu<80)return{material:"soft",density:Math.max(.85,Math.min(1.15,1+hu/1000))};
  if(hu<250)return{material:"muscle",density:Math.max(.9,Math.min(1.2,1+hu/1200))};
  if(hu<700)return{material:"trabecularBone",density:Math.max(.45,Math.min(1.25,(hu+150)/700))};
  return{material:"corticalBone",density:Math.max(.55,Math.min(1.35,(hu+250)/1200))};
}
