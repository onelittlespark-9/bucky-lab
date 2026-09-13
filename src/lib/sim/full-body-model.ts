import type { Patient } from "./types";
import type { Paths } from "./anatomy";
import { fbm, softCapsule, softEllipse } from "./geometry";
const empty=():Paths=>({air:0,lung:0,fat:0,soft:0,bone:0,cortical:0,gas:0,metal:0});
const U=(...v:number[])=>Math.max(0,...v);
function cap(x:number,y:number,x1:number,y1:number,x2:number,y2:number,r:number,s:number,e=.22){return softCapsule(x,y,x1*s,y1*s,x2*s,y2*s,r*s,e);}
function ell(x:number,y:number,cx:number,cy:number,rx:number,ry:number,s:number,e=.18){return softEllipse(x,y,cx*s,cy*s,rx*s,ry*s,0,e);}
function body(x:number,y:number,s:number,p:Patient){const sw=p.morph.shoulder,tw=p.morph.torsoWidth,aw=p.morph.abdomen,hw=p.morph.hip;
 const head=U(ell(x,y,0,8.3,5.9,7.6,s,.10),ell(x,y,0,13.0,4.45,3.8,s,.12));
 const neck=cap(x,y,0,14.2,0,22.8,2.15,s,.14),trap=U(cap(x,y,-1.5,21.8,-8.8*sw,26.2,2.0,s,.14),cap(x,y,1.5,21.8,8.8*sw,26.2,2.0,s,.14));
 const thorax=U(ell(x,y,0,34.0,11.2*tw,10.3,s,.10),ell(x,y,0,43.0,10.4*tw,8.8,s,.12));
 const waist=ell(x,y,0,55.0,7.9*aw,6.8,s,.14),abd=ell(x,y,0,63.2,8.7*aw,7.5,s,.14),pel=U(ell(x,y,0,72.2,10.0*hw,6.4,s,.12),ell(x,y,0,78.0,8.7*hw,5.2,s,.14));
 const arms=U(cap(x,y,-10.8*sw,27,-13.0*sw,54,1.72,s,.15),cap(x,y,10.8*sw,27,13.0*sw,54,1.72,s,.15),cap(x,y,-13.0*sw,55,-14.0*sw,85,1.38,s,.15),cap(x,y,13.0*sw,55,14.0*sw,85,1.38,s,.15),ell(x,y,-14.1*sw,90.5,1.55,4.5,s,.16),ell(x,y,14.1*sw,90.5,1.55,4.5,s,.16));
 const legs=U(cap(x,y,-4.9*hw,78,-5.2*hw,116,2.55,s,.14),cap(x,y,4.9*hw,78,5.2*hw,116,2.55,s,.14),cap(x,y,-5.2*hw,117,-5.0*hw,155,1.85,s,.15),cap(x,y,5.2*hw,117,5.0*hw,155,1.85,s,.15),cap(x,y,-5.0*hw,156,-4.5*hw,168,1.65,s,.16),cap(x,y,5.0*hw,156,4.5*hw,168,1.65,s,.16));return U(head,neck,trap,thorax,waist,abd,pel,arms,legs);}
export function sampleFullBody(x:number,y:number,patient:Patient,seed:number):Paths{const p=empty(),s=patient.heightCm/170,env=body(x,y,s,patient);if(env<.001){p.air=42;return p;}const yy=y/s;
 // Tissue thickness follows regional body depth rather than a constant translucent mannequin shell.
 let halfW=yy<20?5.9:yy<24?3.1:yy<50?11.1:yy<69?8.5:yy<82?9.7:yy<98?7.2:yy<118?6.4:yy<156?4.4:3.2;const q=Math.min(.985,Math.abs(x)/(halfW*s)),edge=Math.sqrt(Math.max(.015,1-q*q));let depth=yy<20?.48:yy<24?.34:yy<50?.62:yy<69?.54:yy<82?.58:yy<98?.39:yy<118?.35:yy<156?.31:.25;depth*=.22+.78*edge;p.soft=env*depth;p.fat=env*(patient.habitus==="hypersthenic"?.085:patient.habitus==="asthenic"?.024:.045)*(.35+.65*edge);
 // Aerated lungs with tapered apices, medial cardiac notches and basal costophrenic taper.
 const r=U(ell(x,y,-4.8,34.0,5.25,10.7,s,.11),ell(x,y,-5.0,42.5,5.45,7.7,s,.12)),l=U(ell(x,y,4.7,33.9,5.15,10.6,s,.11),ell(x,y,5.0,42.0,5.15,7.5,s,.12));const lungs=U(r,l);p.lung+=(r+l)*(1.88+patient.thickness.chest*.014);p.soft*=Math.max(.035,1-lungs*.965);p.fat*=Math.max(.10,1-lungs*.84);
 // Mediastinum and cardiac silhouette assembled from overlapping low-gradient tissue fields.
 const medi=U(ell(x,y,0,30.5,1.35,6.3,s,.16),ell(x,y,.25,37.5,1.7,6.0,s,.17)),heart=U(ell(x,y,-.6,43.3,2.5,4.5,s,.15),ell(x,y,2.0,44.8,3.45,5.0,s,.14),ell(x,y,2.9,47.1,2.45,2.8,s,.15));p.soft+=medi*.24+heart*.48;p.lung*=Math.max(.12,1-heart*.80);p.air+=cap(x,y,0,15.0,0,29.0,.24,s,.20)*2.5;
 // Hila are soft-tissue densities; vascular branches taper and bifurcate instead of appearing as bright spokes.
 const rh=ell(x,y,-2.8,37.6,.9,1.7,s,.22),lh=ell(x,y,3.0,37.3,.85,1.65,s,.22);p.soft+=(rh+lh)*.25;const vv=[[-2.9,37.7,-5.0,33.7,.16],[-5.0,33.7,-7.2,31.3,.085],[-2.9,38,-5.9,39.2,.15],[-5.9,39.2,-8.0,38.4,.075],[-2.8,38.2,-4.8,43.1,.15],[-4.8,43.1,-6.8,47.0,.075],[-3.0,38.3,-3.9,46.7,.105],[3.0,37.4,5.0,33.2,.15],[5.0,33.2,7.1,30.9,.08],[3.0,37.8,5.8,38.7,.14],[5.8,38.7,7.9,37.8,.07],[3.0,38.0,5.0,42.7,.14],[5.0,42.7,7.0,46.3,.07],[3.1,38.2,4.0,46.4,.10]];for(const v of vv)p.soft+=cap(x,y,v[0]!,v[1]!,v[2]!,v[3]!,v[4]!,s,.28)*.11;
 // Hemidiaphragms and upper abdominal organs: broad attenuation transitions, not luminous drawn arcs.
 const rd=ell(x,y,-4.6,49.3,5.8,1.25,s,.28),ld=ell(x,y,4.8,50.1,5.4,1.15,s,.28);p.soft+=(rd+ld)*.12;const liver=ell(x,y,-3.2,54.1,6.2,4.3,s,.20),spleen=ell(x,y,4.8,55.0,3.0,3.1,s,.22),kidR=ell(x,y,-3.7,61.4,2.0,3.2,s,.24),kidL=ell(x,y,3.7,60.9,2.0,3.2,s,.24);p.soft+=liver*.22+spleen*.09+(kidR+kidL)*.045;p.gas+=ell(x,y,4.3,53.9,1.6,1.05,s,.22)*.75;
 // Pelvic soft tissues and bladder provide gradual density variation behind the bony pelvis.
 p.soft+=ell(x,y,0,66.5,7.2,5.5,s,.24)*.055+ell(x,y,0,75.0,7.5,4.5,s,.24)*.05+ell(x,y,0,76.2,2.2,2.7,s,.24)*.04;
 const broad=fbm(x*.07,y*.07,seed+211)-.5,mid=fbm(x*.20,y*.20,seed+223)-.5,fine=fbm(x*.62,y*.62,seed+227)-.5;p.soft=Math.max(0,p.soft+env*(broad*.032+mid*.014+fine*.004));return p;}
