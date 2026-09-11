import * as THREE from "three";
import { useMemo } from "react";
import { patientKinematics, type V3 } from "@/lib/sim/patient-kinematics";

type BoneSpec = { a: V3; b: V3; r: number };
type Marker = { p: V3; scale: V3 };
const V = (x: number, y: number, z: number): V3 => [x, y, z];
const add = (a: V3, b: V3, r: number, out: BoneSpec[]) => out.push({ a, b, r });
const mark = (p: V3, scale: V3, out: Marker[]) => out.push({ p, scale });

function Bone({ a, b, radius, opacity }: { a: V3; b: V3; radius: number; opacity: number }) {
  const g = useMemo(() => {
    const s = new THREE.Vector3(...a), e = new THREE.Vector3(...b), d = e.clone().sub(s);
    const len = d.length();
    return {
      position: s.clone().add(e).multiplyScalar(.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()),
      length: len,
    };
  }, [a, b]);
  return <mesh position={g.position} quaternion={g.quaternion} renderOrder={11}>
    <capsuleGeometry args={[radius, Math.max(.004, g.length - radius * 2), 8, 12]} />
    <meshPhysicalMaterial color="#eee6d2" transparent opacity={opacity} roughness={.82} depthWrite={false} depthTest={false} />
  </mesh>;
}

function Marker({ p, scale, opacity }: Marker & { opacity: number }) {
  return <mesh position={p} scale={scale} renderOrder={12}>
    <sphereGeometry args={[1, 16, 10]} />
    <meshPhysicalMaterial color="#eee6d2" transparent opacity={opacity} roughness={.82} depthWrite={false} depthTest={false} />
  </mesh>;
}

function atlas(out: BoneSpec[], markers: Marker[], y: number, s: number, depth: number) {
  // C1 has no vertebral body: anterior/posterior arches, lateral masses and transverse processes.
  const zA = .028 * depth, zP = -.012 * depth;
  add(V(-.052*s, y, zA), V(.052*s, y, zA), .007*s, out);
  add(V(-.052*s, y, zP), V(.052*s, y, zP), .007*s, out);
  for (const side of [-1, 1] as const) {
    add(V(side*.052*s, y, zA), V(side*.052*s, y, zP), .012*s, out);
    add(V(side*.052*s, y, zA), V(side*.090*s, y+.002*s, .004*depth), .007*s, out);
    mark(V(side*.050*s, y, .010*depth), V(.012*s,.012*s,.010*depth), markers);
  }
  mark(V(0, y, .028*depth), V(.009*s,.009*s,.006*depth), markers); // anterior tubercle
  mark(V(0, y, -.012*depth), V(.008*s,.009*s,.006*depth), markers); // posterior tubercle
}

function axis(out: BoneSpec[], markers: Marker[], y: number, s: number, depth: number) {
  // C2: body, dens, superior articular facets, pedicles/lamina, transverse and spinous processes.
  add(V(-.024*s,y,.020*depth), V(.024*s,y,.020*depth), .010*s, out);
  add(V(0,y+.014*s,.026*depth), V(0,y+.043*s,.030*depth), .008*s, out); // dens
  mark(V(0,y+.043*s,.030*depth), V(.009*s,.012*s,.009*depth), markers);
  for (const side of [-1,1] as const) {
    add(V(side*.024*s,y,.020*depth), V(side*.040*s,y+.006*s,0), .007*s, out);
    add(V(side*.040*s,y+.006*s,0), V(side*.070*s,y+.010*s,.004*depth), .006*s, out);
    add(V(side*.070*s,y+.010*s,.004*depth), V(side*.018*s,y+.026*s,-.010*depth), .006*s, out);
    mark(V(side*.035*s,y+.010*s,.012*depth), V(.010*s,.007*s,.006*depth), markers);
  }
  add(V(-.018*s,y+.026*s,-.010*depth), V(0,y+.032*s,-.018*depth), .007*s, out);
  add(V(.018*s,y+.026*s,-.010*depth), V(0,y+.032*s,-.018*depth), .007*s, out);
}

function vertebra(out: BoneSpec[], markers: Marker[], y: number, s: number, depth: number, region: "c"|"t"|"l", index: number) {
  const bodyW = region === "c" ? (.018+.001*index)*s : region === "t" ? (.021+.003*Math.sin(index/11*Math.PI))*s : (.030+.0015*index)*s;
  const bodyD = (region === "l" ? .026 : .021)*depth;
  const pedW = (region === "c"?.026:region === "t"?.043:.055)*s;
  const transW = (region === "c"?.052:region === "t"?.076:.088)*s;
  const spin = (region === "c"?.016:region === "t"?.021:.024)*s;
  const r = region === "c"?.0065:region === "t"?.0075:.0095;
  add(V(-bodyW,y,bodyD),V(bodyW,y,bodyD),r*1.2,out);
  for (const side of [-1,1] as const) {
    const ped = V(side*pedW,y-.004*s,0);
    const trans = V(side*transW,y+.003*s,.006*depth);
    const lam = V(side*(transW*.52),y+.010*s,-.006*depth);
    const spinous = V(0,y+spin,-.010*depth);
    add(V(side*bodyW,y,bodyD),ped,r,out);
    add(ped,trans,r*1.05,out);
    add(trans,lam,r,out);
    add(lam,spinous,r,out);
    const sup = V(side*(region === "c"?.032:region === "t"?.038:.046)*s,y+.010*s,.010*depth);
    const inf = V(side*(region === "c"?.030:region === "t"?.036:.044)*s,y-.010*s,.008*depth);
    add(ped,sup,r*.7,out); add(inf,lam,r*.7,out);
    mark(sup,V(.007*s,.004*s,.005*depth),markers);
    mark(inf,V(.007*s,.004*s,.005*depth),markers);
    if(region === "t") mark(V(side*.029*s,y,.017*depth),V(.006*s,.006*s,.006*depth),markers); // costal facet region
  }
}

function sacrum(out: BoneSpec[], markers: Marker[], H: number, s: number, depth: number) {
  const top=.455*H, bottom=.330*H;
  add(V(-.050*s,top,.006*depth),V(.050*s,top,.006*depth),.015*s,out);
  add(V(-.050*s,top,.006*depth),V(0,bottom,-.002*depth),.012*s,out);
  add(V(.050*s,top,.006*depth),V(0,bottom,-.002*depth),.012*s,out);
  for(let i=0;i<4;i++){
    const y=top-(i+.65)*(top-bottom)/4;
    add(V(-.035*s,y,.004*depth),V(.035*s,y,.004*depth),.007*s,out);
    mark(V(-.020*s,y,.010*depth),V(.005*s,.006*s,.004*depth),markers);
    mark(V(.020*s,y,.010*depth),V(.005*s,.006*s,.004*depth),markers);
  }
  add(V(-.035*s,top,.002*depth),V(-.060*s,.410*H,.002*depth),.008*s,out);
  add(V(.035*s,top,.002*depth),V(.060*s,.410*H,.002*depth),.008*s,out);
  for(let i=0;i<4;i++) add(V(0,(.405-i*.020)*H,0),V(0,(.390-i*.020)*H,-.004*depth),.007*s,out);
  mark(V(0,.475*H,.006*depth),V(.008*s,.008*s,.006*depth),markers);
}

function ribs(out: BoneSpec[], s: number, depth: number, H: number) {
  const top=.77*H,bottom=.535*H;
  for(let i=0;i<12;i++){
    const t=i/11,y=top-t*(top-bottom), span=(.103-.010*Math.abs(t-.45))*s;
    for(const side of [-1,1] as const){
      const head=V(side*.026*s,y,-.002*depth), neck=V(side*.041*s,y+.001*s,-.010*depth), tub=V(side*.052*s,y+.003*s,-.012*depth), angle=V(side*.070*s,y-.002*s,-.003*depth), shaft=V(side*span,y-.004*s,.014*depth);
      add(head,neck,.005*s,out); add(neck,tub,.005*s,out); add(tub,angle,.0055*s,out); add(angle,shaft,.005*s,out);
      if(i<7){ add(shaft,V(side*span*.92,y-.005*s,.024*depth),.0035*s,out); }
      else if(i<10){ add(shaft,V(side*span*.90,y-.005*s,.020*depth),.0032*s,out); }
      // Ribs 11-12 are floating: no anterior cartilage.
      if(i>=10) continue;
      mark(head,V(.006*s,.006*s,.006*depth),[] = []);
    }
  }
}

function sternum(out: BoneSpec[], markers: Marker[], H:number,s:number,depth:number){
  const manTop=.765*H, angle=.705*H, bodyBottom=.575*H;
  add(V(0,manTop,.034*depth),V(0,angle,.036*depth),.012*s,out);
  add(V(0,angle,.036*depth),V(0,bodyBottom,.034*depth),.011*s,out);
  add(V(0,bodyBottom,.034*depth),V(0,.548*H,.030*depth),.008*s,out);
  mark(V(0,angle,.038*depth),V(.030*s,.010*s,.008*depth),markers);
}

function clavicle(out:BoneSpec[], shoulder:V3, side:-1|1,s:number,depth:number){
  const medial=V(side*.010*s,shoulder[1]+.018*s,.034*depth);
  const mid=V(side*.052*s,shoulder[1]+.020*s,.031*depth);
  const lateral=V(side*.098*s,shoulder[1]+.012*s,.025*depth);
  add(medial,mid,.0065*s,out);add(mid,lateral,.006*s,out);
}

function scapula(out:BoneSpec[],markers:Marker[],shoulder:V3,side:-1|1,s:number){
  const x=shoulder[0],y=shoulder[1],z=shoulder[2];
  const medial=V(x-side*.065*s,y-.005*s,z-.004*s), inf=V(x-side*.045*s,y-.095*s,z-.002*s), lat=V(x+side*.004*s,y-.025*s,z+.014*s);
  const spine=V(x-side*.018*s,y+.004*s,z+.022*s), ac=V(x+side*.036*s,y+.020*s,z+.020*s), cor=V(x+side*.025*s,y-.004*s,z+.032*s);
  add(medial,inf,.008*s,out);add(inf,lat,.010*s,out);add(lat,medial,.008*s,out);add(spine,ac,.007*s,out);add(spine,medial,.006*s,out);add(lat,ac,.008*s,out);add(lat,cor,.007*s,out);
  mark(lat,V(.014*s,.018*s,.012*s),markers);mark(ac,V(.012*s,.007*s,.008*s),markers);mark(cor,V(.009*s,.012*s,.009*s),markers);
}

function pelvis(out:BoneSpec[],markers:Marker[],k:ReturnType<typeof patientKinematics>,s:number,depth:number){
  const y=k.Y.pelvis, hip= k.hipGap*2.5;
  for(const side of [-1,1] as const){
    const crest=V(side*.112*s,y+.058*s,.010*depth), asis=V(side*.118*s,y+.022*s,.022*depth), aiis=V(side*.092*s,y-.010*s,.026*depth), acet=V(side*hip,y-.006*s,.022*depth), ischSp=V(side*.078*s,y-.040*s,.010*depth), tub=V(side*.066*s,y-.086*s,.004*depth), pub=V(side*.026*s,y-.055*s,.026*depth), psis=V(side*.100*s,y+.010*s,-.006*depth);
    add(V(side*.030*s,y+.020*s,.010*depth),crest,.011*s,out);add(crest,asis,.010*s,out);add(asis,aiis,.009*s,out);add(aiis,acet,.010*s,out);add(acet,ischSp,.009*s,out);add(ischSp,tub,.009*s,out);add(tub,pub,.008*s,out);add(pub,V(0,y-.052*s,.028*depth),.007*s,out);add(psis,crest,.008*s,out);add(psis,ischSp,.008*s,out);
    mark(asis,V(.009*s,.009*s,.009*s),markers);mark(aiis,V(.008*s,.008*s,.008*s),markers);mark(acet,V(.018*s,.018*s,.013*depth),markers);mark(tub,V(.009*s,.009*s,.009*s),markers);
    // Obturator foramen boundary.
    add(V(side*.048*s,y-.020*s,.018*depth),V(side*.083*s,y-.058*s,.012*depth),.006*s,out);add(V(side*.083*s,y-.058*s,.012*depth),V(side*.048*s,y-.078*s,.008*depth),.006*s,out);add(V(side*.048*s,y-.078*s,.008*depth),pub,.006*s,out);
  }
  add(V(-.026*s,y-.052*s,.028*depth),V(.026*s,y-.052*s,.028*depth),.007*s,out);
  mark(V(0,y-.052*s,.029*depth),V(.007*s,.008*s,.006*depth),markers);
}

function upperLimb(out:BoneSpec[],markers:Marker[],a:ReturnType<typeof patientKinematics>["arms"][number],side:-1|1,s:number){
  const sh=new THREE.Vector3(...a.shoulder),el=new THREE.Vector3(...a.elbow),wr=new THREE.Vector3(...a.wrist),hand=new THREE.Vector3(...a.hand);
  const upperAxis=el.clone().sub(sh).normalize(), foreAxis=wr.clone().sub(el).normalize();
  const perp=new THREE.Vector3(-upperAxis.z,0,upperAxis.x).normalize(), forePerp=new THREE.Vector3(-foreAxis.z,0,foreAxis.x).normalize();
  // Humerus: head/neck/tubercles/shaft/distal condylar region.
  add(a.shoulder,a.upper,.013*s,out);add(a.upper,a.elbow,.010*s,out);mark(sh.toArray() as V3,V(.018*s,.018*s,.018*s),markers);
  mark(sh.clone().add(perp.clone().multiplyScalar(side*.014*s)).toArray() as V3,V(.008*s,.010*s,.008*s),markers); // greater tubercle
  mark(sh.clone().add(perp.clone().multiplyScalar(-side*.010*s)).toArray() as V3,V(.007*s,.008*s,.007*s),markers); // lesser tubercle
  mark(el.toArray() as V3,V(.013*s,.012*s,.012*s),markers);
  // Separate radius and ulna. Radius is lateral/thumb side; ulna is medial/little-finger side.
  const radial=el.clone().add(forePerp.clone().multiplyScalar(side*.010*s)), ulnar=el.clone().add(forePerp.clone().multiplyScalar(-side*.010*s));
  const radialW=wr.clone().add(forePerp.clone().multiplyScalar(side*.007*s)), ulnarW=wr.clone().add(forePerp.clone().multiplyScalar(-side*.006*s));
  add(radial.toArray() as V3,radialW.toArray() as V3,.0075*s,out);add(ulnar.toArray() as V3,ulnarW.toArray() as V3,.006*s,out);
  mark(radial.toArray() as V3,V(.009*s,.009*s,.009*s),markers);mark(ulnar.toArray() as V3,V(.008*s,.010*s,.008*s),markers);
  mark(radialW.toArray() as V3,V(.007*s,.010*s,.007*s),markers);mark(ulnarW.toArray() as V3,V(.006*s,.009*s,.006*s),markers);
  // Eight distinct carpal centres and five metacarpals/phalanges.
  const palm=hand.clone();
  const carp=[[-.014,.008],[-.005,.012],[.005,.012],[.014,.008],[-.014,-.004],[-.005,-.004],[.005,-.004],[.014,-.004]];
  carp.forEach(([dx,dz])=>mark([palm.x+dx*s,palm.y,palm.z+dz*s],V(.0048*s,.006*s,.0048*s),markers));
  for(let i=0;i<5;i++){
    const x=palm.x+(i-2)*.009*s, base=V(x,palm.y-.004*s,palm.z), mcp=V(x,palm.y-.034*s,palm.z+.002*s), pip=V(x,palm.y-.052*s,palm.z+.003*s), tip=V(x,palm.y-.066*s,palm.z+.003*s);
    add(base,mcp,.0032*s,out);add(mcp,pip,.0028*s,out);if(i!==0)add(pip,tip,.0024*s,out);else add(pip,tip,.0026*s,out);
  }
}

function lowerLimb(out:BoneSpec[],markers:Marker[],l:ReturnType<typeof patientKinematics>["legs"][number],side:-1|1,s:number){
  add(l.hip,l.thigh,.015*s,out);add(l.thigh,l.knee,.012*s,out);mark(l.knee,V(.015*s,.012*s,.010*s),markers);
  const knee=new THREE.Vector3(...l.knee),ank=new THREE.Vector3(...l.ankle),calfAxis=ank.clone().sub(knee).normalize(),perp=new THREE.Vector3(-calfAxis.z,0,calfAxis.x).normalize();
  const tibK=knee.clone().add(perp.clone().multiplyScalar(-side*.008*s)), fibK=knee.clone().add(perp.clone().multiplyScalar(side*.012*s));
  const tibA=ank.clone().add(perp.clone().multiplyScalar(-side*.008*s)), fibA=ank.clone().add(perp.clone().multiplyScalar(side*.010*s));
  add(tibK.toArray() as V3,tibA.toArray() as V3,.009*s,out);add(fibK.toArray() as V3,fibA.toArray() as V3,.0055*s,out);
  mark(tibK.toArray() as V3,V(.009*s,.008*s,.009*s),markers);mark(knee.clone().add(new THREE.Vector3(0,-.010*s,.006*s)).toArray() as V3,V(.008*s,.010*s,.008*s),markers);mark(tibA.toArray() as V3,V(.007*s,.012*s,.007*s),markers);mark(fibA.toArray() as V3,V(.006*s,.010*s,.006*s),markers);
  const foot=l.foot, heel=V(foot[0]-side*.026*s,foot[1],foot[2]); add(heel,foot,.007*s,out);
  const tars=[[-.018,.004],[-.008,.007],[.003,.007],[.014,.004],[-.014,-.005],[-.003,-.006],[.009,-.005]];
  tars.forEach(([dx,dz])=>mark([foot[0]+dx*s,foot[1],foot[2]+dz*s],V(.0048*s,.006*s,.0048*s),markers));
  for(let i=0;i<5;i++){const x=foot[0]+(i-2)*.009*s;add(V(x,foot[1]-.002*s,foot[2]),V(x+side*.003*s,foot[1]-.040*s,foot[2]+.003*s),.003*s,out);add(V(x+side*.003*s,foot[1]-.040*s,foot[2]+.003*s),V(x+side*.004*s,foot[1]-.058*s,foot[2]+.003*s),.0024*s,out);}
}

function skull(out:BoneSpec[],markers:Marker[],H:number,s:number){
  const y=.955*H;
  // Calvarium and facial skeleton are deliberately separated into recognisable landmarks.
  add(V(-.070*s,y+.010*s,.006*s),V(.070*s,y+.010*s,.006*s),.020*s,out);
  add(V(-.070*s,y+.010*s,.006*s),V(-.095*s,y-.030*s,0),.011*s,out);add(V(.070*s,y+.010*s,.006*s),V(.095*s,y-.030*s,0),.011*s,out);
  add(V(-.095*s,y-.030*s,0),V(-.072*s,y-.072*s,-.004*s),.010*s,out);add(V(.095*s,y-.030*s,0),V(.072*s,y-.072*s,-.004*s),.010*s,out);
  add(V(-.072*s,y-.072*s,-.004*s),V(.072*s,y-.072*s,-.004*s),.009*s,out);
  // Zygomatic arches and orbital rims.
  for(const side of [-1,1] as const){
    add(V(side*.072*s,y-.040*s,.030*s),V(side*.035*s,y-.065*s,.042*s),.006*s,out);
    add(V(side*.035*s,y-.065*s,.042*s),V(side*.020*s,y-.090*s,.038*s),.006*s,out);
    add(V(side*.020*s,y-.090*s,.038*s),V(side*.055*s,y-.082*s,.026*s),.006*s,out);
    add(V(side*.055*s,y-.082*s,.026*s),V(side*.072*s,y-.040*s,.030*s),.006*s,out);
    mark(V(side*.045*s,y-.065*s,.043*s),V(.011*s,.009*s,.007*s),markers);
    mark(V(side*.085*s,y-.045*s,.018*s),V(.008*s,.010*s,.008*s),markers); // external acoustic meatus region
    add(V(side*.055*s,y-.082*s,.026*s),V(side*.022*s,y-.106*s,.028*s),.006*s,out); // maxilla
  }
  add(V(-.022*s,y-.106*s,.028*s),V(.022*s,y-.106*s,.028*s),.006*s,out);
  add(V(-.042*s,y-.095*s,.020*s),V(0,y-.115*s,.024*s),.006*s,out);add(V(.042*s,y-.095*s,.020*s),V(0,y-.115*s,.024*s),.006*s,out);
  // Mandible.
  add(V(-.055*s,y-.116*s,.020*s),V(-.042*s,y-.150*s,.012*s),.008*s,out);add(V(.055*s,y-.116*s,.020*s),V(.042*s,y-.150*s,.012*s),.008*s,out);add(V(-.042*s,y-.150*s,.012*s),V(.042*s,y-.150*s,.012*s),.008*s,out);
  mark(V(0,y-.150*s,.014*s),V(.045*s,.007*s,.009*s),markers); // mandibular body
}

export function DetailedSkeletalLayer({ H,s,torsoWidth,torsoDepth,shoulder,hip,patientMorph,pose,projectionId,placement,buckyTilt,opacity }:{
  H:number;s:number;torsoWidth:number;torsoDepth:number;shoulder:number;hip:number;patientMorph:{limb:number};
  pose:{elbowFlex:number;hipInternal:number;armRaise:number;shoulderRoll:number;kneeFlex:number};
  projectionId:string;placement:"standing"|"seated"|"upright-bucky"|"table";buckyTilt:number;opacity:number;
}){
  void torsoWidth;
  const k=patientKinematics({H,s,shoulder,hip,limb:patientMorph.limb,elbowFlex:pose.elbowFlex,hipInternal:pose.hipInternal,armRaise:pose.armRaise,shoulderRoll:pose.shoulderRoll,kneeFlex:pose.kneeFlex,projectionId,placement,buckyTilt});
  const {bones,markers}=useMemo(()=>{
    const bones:BoneSpec[]=[],markers:Marker[]=[]; const depth=torsoDepth*s;
    const cTop=.875*H,cBottom=.790*H,tTop=.785*H,tBottom=.565*H,lTop=.560*H,lBottom=.465*H;
    atlas(bones,markers,cTop,s,depth); axis(bones,markers,cTop-.014*H,s,depth);
    for(let i=0;i<5;i++) vertebra(bones,markers,cBottom-i*(cBottom-tBottom*.0)/5,s,depth,"c",i+2);
    for(let i=0;i<12;i++) vertebra(bones,markers,tTop-i*(tTop-tBottom)/11,s,depth,"t",i);
    for(let i=0;i<5;i++) vertebra(bones,markers,lTop-i*(lTop-lBottom)/4,s,depth,"l",i);
    ribs(bones,s,depth,H);sternum(bones,markers,H,s,depth);sacrum(bones,markers,H,s,depth);pelvis(bones,markers,k,s,depth);skull(bones,markers,H,s);
    for(const side of [-1,1] as const){const idx=side===-1?0:1;scapula(bones,markers,k.arms[idx].shoulder,side,s);clavicle(bones,k.arms[idx].shoulder,side,s,depth);upperLimb(bones,markers,k.arms[idx],side,s);lowerLimb(bones,markers,k.legs[idx],side,s);}
    return {bones,markers};
  },[H,s,torsoWidth,torsoDepth,shoulder,hip,patientMorph.limb,pose.elbowFlex,pose.hipInternal,pose.armRaise,pose.shoulderRoll,pose.kneeFlex,projectionId,placement,buckyTilt,k]);
  return <group>{bones.map((b,i)=><Bone key={`detail-bone-${i}`} {...b} opacity={opacity}/>)}{markers.map((m,i)=><Marker key={`detail-marker-${i}`} {...m} opacity={opacity}/>)}</group>;
}
