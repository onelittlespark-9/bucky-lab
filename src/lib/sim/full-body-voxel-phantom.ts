import type { Patient } from "./types";
import { classifyCtHu, materialId, type MaterialVolume } from "./voxel-volume-projector";

const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ell=(x:number,y:number,z:number,cx:number,cy:number,cz:number,rx:number,ry:number,rz:number)=>1-((x-cx)/rx)**2-((y-cy)/ry)**2-((z-cz)/rz)**2;
const seg=(x:number,y:number,z:number,ax:number,ay:number,az:number,bx:number,by:number,bz:number,r:number)=>{const vx=bx-ax,vy=by-ay,vz=bz-az,wx=x-ax,wy=y-ay,wz=z-az,t=clamp((wx*vx+wy*vy+wz*vz)/(vx*vx+vy*vy+vz*vz));return r-Math.hypot(x-(ax+vx*t),y-(ay+vy*t),z-(az+vz*t));};
function insideBody(x:number,y:number,z:number,s:number,p:Patient){const tw=p.morph.torsoWidth,hw=p.morph.hip;return Math.max(ell(x,y,z,0,10*s,0,6*s,8*s,8*s),ell(x,y,z,0,37*s,0,12*tw*s,16*s,10*s),ell(x,y,z,0,64*s,0,9.5*s,15*s,9*s),ell(x,y,z,0,77*s,0,10.5*hw*s,8*s,10*s),seg(x,y,z,-10*s,26*s,0,-14*s,86*s,0,2.2*s),seg(x,y,z,10*s,26*s,0,14*s,86*s,0,2.2*s),seg(x,y,z,-5*s,79*s,0,-5*s,158*s,0,3.0*s),seg(x,y,z,5*s,79*s,0,5*s,158*s,0,3.0*s));}
function boneHu(x:number,y:number,z:number,s:number){let q=0;q=Math.max(q,seg(x,y,z,0,22*s,2*s,0,76*s,2*s,1.05*s));for(let k=0;k<12;k++){const yy=(27+k*2.05)*s,spread=(5.3+k*.18)*s;q=Math.max(q,seg(x,y,z,-.5*s,yy,1.5*s,-spread,yy+.9*s,0,0.34*s),seg(x,y,z,.5*s,yy,1.5*s,spread,yy+.9*s,0,.34*s));}q=Math.max(q,seg(x,y,z,-10*s,27*s,0,-13*s,52*s,0,.72*s),seg(x,y,z,10*s,27*s,0,13*s,52*s,0,.72*s),seg(x,y,z,-13*s,54*s,0,-14*s,84*s,0,.52*s),seg(x,y,z,13*s,54*s,0,14*s,84*s,0,.52*s),seg(x,y,z,-5*s,80*s,0,-5*s,116*s,0,1.05*s),seg(x,y,z,5*s,80*s,0,5*s,116*s,0,1.05*s),seg(x,y,z,-5*s,119*s,0,-5*s,156*s,0,.72*s),seg(x,y,z,5*s,119*s,0,5*s,156*s,0,.72*s));const skull=Math.max(ell(x,y,z,0,9*s,0,5.2*s,6.8*s,6.6*s),0);if(skull>0){const inner=ell(x,y,z,0,9*s,0,4.5*s,6.0*s,5.8*s);if(inner<0)return 1050;}return q>0?850:0;}

/** Low-resolution CT-derived-style reference phantom. It is intentionally generated as a 3-D
 * HU field first; the radiograph then traverses voxels. This removes the old 2-D surface-atlas
 * compositing path and gives lung, mediastinum, marrow and overlapping anatomy real depth. */
export function buildFullBodyVoxelPhantom(patient:Patient):MaterialVolume{
  const s=patient.heightCm/170,nx=112,ny=336,nz=72,spacing:[number,number,number]=[.32*s,.52*s,.34*s],origin:[number,number,number]=[-nx*spacing[0]/2,-3*s,-nz*spacing[2]/2],material=new Uint8Array(nx*ny*nz),density=new Uint8Array(nx*ny*nz);
  for(let iz=0;iz<nz;iz++){const z=origin[2]+(iz+.5)*spacing[2];for(let iy=0;iy<ny;iy++){const y=origin[1]+(iy+.5)*spacing[1];for(let ix=0;ix<nx;ix++){const x=origin[0]+(ix+.5)*spacing[0],idx=(iz*ny+iy)*nx+ix;if(insideBody(x,y,z,s,patient)<=0)continue;let hu=25;const edge=insideBody(x,y,z,s,patient);if(edge<.18)hu=-80;
    const lungL=ell(x,y,z,-4.1*s,38*s,0,5.0*s,12.8*s,7.1*s),lungR=ell(x,y,z,4.1*s,38*s,0,5.0*s,12.8*s,7.1*s);if(Math.max(lungL,lungR)>0)hu=-760+55*Math.sin(x*.75+y*.19+z*.42);
    const medi=ell(x,y,z,.2*s,39*s,1.0*s,2.7*s,11*s,5.0*s),heart=ell(x,y,z,1.2*s,44*s,1.0*s,4.8*s,6.2*s,5.0*s);if(medi>0)hu=42;if(heart>0)hu=52;
    const liver=ell(x,y,z,-3.0*s,56*s,0,6.7*s,6.2*s,7.0*s),spleen=ell(x,y,z,5.2*s,56*s,0,2.5*s,4*s,4.5*s);if(Math.max(liver,spleen)>0)hu=58;
    const bh=boneHu(x,y,z,s);if(bh)hu=bh;
    const c=classifyCtHu(hu);material[idx]=materialId(c.material);density[idx]=Math.round(clamp(c.density,0,1.35)/1.35*255);
  }}}
  return{nx,ny,nz,spacingCm:spacing,originCm:origin,material,density};
}

const cache=new Map<string,MaterialVolume>();
export function fullBodyVoxelPhantom(patient:Patient){const key=`${patient.id}:${patient.heightCm}:${patient.weightKg}:${patient.habitus}`;let v=cache.get(key);if(!v){v=buildFullBodyVoxelPhantom(patient);cache.set(key,v);}return v;}
