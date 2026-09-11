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
    return { position: s.clone().add(e).multiplyScalar(.5), quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()), length: d.length() };
  }, [a, b]);
  return <mesh position={g.position} quaternion={g.quaternion} renderOrder={11}><capsuleGeometry args={[radius, Math.max(.004, g.length - radius * 2), 8, 12]} /><meshPhysicalMaterial color="#eee6d2" transparent opacity={opacity} roughness={.82} depthWrite={false} depthTest={false} /></mesh>;
}

function Marker({ p, scale, opacity }: Marker & { opacity: number }) {
  return <mesh position={p} scale={scale} renderOrder={12}><sphereGeometry args={[1, 16, 10]} /><meshPhysicalMaterial color="#eee6d2" transparent opacity={opacity} roughness={.82} depthWrite={false} depthTest={false} /></mesh>;
}

function vertebra(out: BoneSpec[], markers: Marker[], y: number, s: number, depth: number, region: "c" | "t" | "l", index: number) {
  const bodyW = region === "c" ? (.015 + index * .001) * s : region === "t" ? (.020 + Math.sin(index / 11 * Math.PI) * .003) * s : (.027 + index * .0012) * s;
  const bodyD = (region === "l" ? .024 : .020) * depth;
  const pedW = region === "c" ? .026 : region === "t" ? .043 : .053;
  const transW = region === "c" ? .050 : region === "t" ? .074 : .086;
  const spinY = region === "c" ? .014 : region === "t" ? .020 : .022;
  const r = region === "c" ? .006 : region === "t" ? .007 : .009;
  add(V(-bodyW, y, bodyD), V(bodyW, y, bodyD), r * 1.15, out); // vertebral body
  for (const side of [-1, 1] as const) {
    add(V(side * bodyW, y, bodyD), V(side * pedW * s, y - .004 * s, 0), r, out); // pedicle
    add(V(side * pedW * s, y - .004 * s, 0), V(side * transW * s, y + .004 * s, .006 * depth), r * 1.05, out); // transverse process
    add(V(side * transW * s, y + .004 * s, .006 * depth), V(0, y + spinY * s, -.006 * depth), r, out); // lamina to spinous process
    const facetX = side * (region === "c" ? .030 : region === "t" ? .036 : .043) * s;
    const facetY = y + .008 * s;
    add(V(side * pedW * s, y + .002 * s, .002 * depth), V(facetX, facetY, .010 * depth), r * .65, out); // articular pillar
    mark(V(facetX, facetY, .010 * depth), V(.006 * s, .004 * s, .005 * depth), markers); // articular facet
  }
  mark(V(0, y, bodyD), V(bodyW * .9, .010 * s, bodyD * .8), markers);
}

function ribs(out: BoneSpec[], s: number, depth: number, H: number) {
  const chestTop = .77 * H, chestBottom = .53 * H;
  for (let i = 0; i < 12; i++) {
    const t = i / 11, y = chestTop - t * (chestTop - chestBottom);
    const span = (.105 - .012 * Math.abs(t - .48)) * s;
    const posterior = -.004 * depth;
    const lateral = .90 + .12 * Math.sin(t * Math.PI);
    for (const side of [-1, 1] as const) {
      const head = V(side * .024 * s, y, posterior);
      const neck = V(side * .039 * s, y + .002 * s, -.010 * depth);
      const tub = V(side * .050 * s, y + .004 * s, -.012 * depth);
      const angle = V(side * .066 * s, y - .002 * s, -.004 * depth);
      const anterior = V(side * span * lateral, y - .004 * s, .018 * depth);
      add(head, neck, .005 * s, out); // head/neck
      add(neck, tub, .005 * s, out); // tubercle
      add(tub, angle, .0055 * s, out); // rib angle
      add(angle, anterior, .005 * s, out); // shaft
      const cartilageEnd = V(side * span * .88, y - .004 * s, .022 * depth);
      add(anterior, cartilageEnd, .0035 * s, out); // costal cartilage
    }
  }
}

function sternum(out: BoneSpec[], markers: Marker[], H: number, s: number, depth: number) {
  const manTop = .765 * H, manBottom = .705 * H, bodyBottom = .575 * H;
  add(V(0, manTop, .035 * depth), V(0, manBottom, .036 * depth), .012 * s, out);
  add(V(0, manBottom, .036 * depth), V(0, bodyBottom, .034 * depth), .011 * s, out);
  add(V(0, bodyBottom, .034 * depth), V(0, .548 * H, .032 * depth), .008 * s, out); // xiphoid
  mark(V(0, manBottom, .037 * depth), V(.026 * s, .010 * s, .008 * depth), markers); // sternal angle
}

function scapula(out: BoneSpec[], markers: Marker[], shoulder: V3, side: -1 | 1, s: number) {
  const x = shoulder[0], y = shoulder[1], z = shoulder[2];
  const medial = V(x - side * .060 * s, y - .005 * s, z - .004 * s);
  const inferior = V(x - side * .045 * s, y - .090 * s, z - .002 * s);
  const glenoid = V(x + side * .004 * s, y - .025 * s, z + .015 * s);
  const acromion = V(x + side * .032 * s, y + .018 * s, z + .018 * s);
  const coracoid = V(x + side * .024 * s, y - .005 * s, z + .030 * s);
  add(medial, inferior, .009 * s, out); add(inferior, glenoid, .010 * s, out); add(glenoid, medial, .008 * s, out);
  add(glenoid, acromion, .008 * s, out); add(glenoid, coracoid, .007 * s, out);
  mark(glenoid, V(.014 * s, .018 * s, .012 * s), markers);
  mark(acromion, V(.012 * s, .007 * s, .008 * s), markers);
  mark(coracoid, V(.009 * s, .012 * s, .009 * s), markers);
}

function clavicle(out: BoneSpec[], shoulder: V3, side: -1 | 1, s: number, depth: number) {
  add(V(side * .018 * s, shoulder[1] + .018 * s, .030 * depth), V(side * .095 * s, shoulder[1] + .012 * s, .026 * depth), .0065 * s, out);
}

function pelvis(out: BoneSpec[], markers: Marker[], k: ReturnType<typeof patientKinematics>, s: number, depth: number) {
  const y = k.Y.pelvis;
  for (const side of [-1, 1] as const) {
    const x = side * k.hipGap * 2.5;
    const crest = V(side * .105 * s, y + .055 * s, .010 * depth);
    const asis = V(side * .115 * s, y + .025 * s, .024 * depth);
    const acet = V(x, y - .004 * s, .020 * depth);
    const ischial = V(side * .070 * s, y - .085 * s, .006 * depth);
    const pubic = V(side * .028 * s, y - .060 * s, .024 * depth);
    add(V(side * .022 * s, y + .018 * s, .020 * depth), crest, .012 * s, out);
    add(crest, asis, .010 * s, out); add(asis, acet, .012 * s, out); add(acet, ischial, .011 * s, out); add(ischial, pubic, .009 * s, out); add(pubic, V(0, y - .050 * s, .026 * depth), .007 * s, out);
    mark(asis, V(.010 * s, .010 * s, .010 * depth), markers);
    mark(acet, V(.019 * s, .019 * s, .014 * depth), markers);
  }
  add(V(-.030 * s, y - .050 * s, .026 * depth), V(.030 * s, y - .050 * s, .026 * depth), .007 * s, out);
  add(V(0, y - .050 * s, .026 * depth), V(0, y - .140 * s, .004 * depth), .009 * s, out); // pubic symphysis to coccyx axis
}

function upperLimb(out: BoneSpec[], markers: Marker[], a: ReturnType<typeof patientKinematics>["arms"][number], side: -1 | 1, s: number) {
  const sh = new THREE.Vector3(...a.shoulder), el = new THREE.Vector3(...a.elbow), wr = new THREE.Vector3(...a.wrist), hand = new THREE.Vector3(...a.hand);
  const axisU = el.clone().sub(sh).normalize(), axisF = wr.clone().sub(el).normalize();
  const perpU = new THREE.Vector3(-axisU.z, 0, axisU.x).normalize(), perpF = new THREE.Vector3(-axisF.z, 0, axisF.x).normalize();
  add(a.shoulder, a.upper, .013 * s, out); add(a.upper, a.elbow, .010 * s, out);
  mark(sh.clone().add(perpU.clone().multiplyScalar(side * .014 * s)).toArray() as V3, V(.019 * s, .019 * s, .019 * s), markers);
  mark(sh.clone().add(axisU.clone().multiplyScalar(.020 * s)).add(perpU.clone().multiplyScalar(side * .013 * s)).toArray() as V3, V(.007 * s, .009 * s, .007 * s), markers); // greater tubercle
  add(a.elbow, a.wrist, .0075 * s, out); // radius
  add(a.elbow, a.wrist, .006 * s, out); // ulna overlay; visual separation is supplied by markers
  mark(el.toArray() as V3, V(.012 * s, .012 * s, .012 * s), markers);
  mark(wr.clone().add(perpF.clone().multiplyScalar(side * .007 * s)).toArray() as V3, V(.008 * s, .010 * s, .007 * s), markers); // radial styloid
  mark(wr.clone().add(perpF.clone().multiplyScalar(-side * .006 * s)).toArray() as V3, V(.007 * s, .009 * s, .007 * s), markers); // ulnar styloid
  const palm = hand.clone();
  const fingers = 5;
  for (let i = 0; i < fingers; i++) {
    const offset = (i - 2) * .009 * s;
    const base = palm.clone().add(new THREE.Vector3(offset, -.004 * s, 0));
    const tip = base.clone().add(new THREE.Vector3(0, -.045 * s, .004 * s));
    add([base.x, base.y, base.z], [tip.x, tip.y, tip.z], .0035 * s, out);
    add([tip.x, tip.y, tip.z], [tip.x, tip.y - .022 * s, tip.z], .0028 * s, out);
  }
  for (let i = 0; i < 8; i++) mark([hand[0] + ((i % 4) - 1.5) * .008 * s, hand[1] - .006 * s, hand[2] + (i < 4 ? .008 : -.008) * s], V(.0045 * s, .007 * s, .0045 * s), markers);
}

function lowerLimb(out: BoneSpec[], markers: Marker[], l: ReturnType<typeof patientKinematics>["legs"][number], side: -1 | 1, s: number) {
  add(l.hip, l.thigh, .015 * s, out); add(l.thigh, l.knee, .012 * s, out); add(l.knee, l.calf, .009 * s, out); add(l.calf, l.ankle, .007 * s, out);
  mark(l.knee, V(.015 * s, .012 * s, .010 * s), markers); // patella
  mark([l.knee[0] + side * .014 * s, l.knee[1], l.knee[2] + .006 * s], V(.009 * s, .008 * s, .008 * s), markers); // tibial plateau
  mark([l.knee[0] + side * .006 * s, l.knee[1] - .010 * s, l.knee[2] + .006 * s], V(.008 * s, .010 * s, .008 * s), markers); // tibial tuberosity
  mark([l.ankle[0] + side * .010 * s, l.ankle[1], l.ankle[2]], V(.007 * s, .012 * s, .007 * s), markers); // malleolus
  const foot = l.foot;
  const heel = V(foot[0] - side * .026 * s, foot[1], foot[2]);
  add(heel, foot, .007 * s, out);
  for (let i = 0; i < 7; i++) mark([foot[0] + ((i % 3) - 1) * .010 * s, foot[1] - .004 * s, foot[2] + ((i % 2) ? .006 : -.006) * s], V(.0045 * s, .006 * s, .0045 * s), markers);
  for (let i = 0; i < 5; i++) {
    const x = foot[0] + (i - 2) * .009 * s;
    add([x, foot[1] - .002 * s, foot[2]], [x + side * .004 * s, foot[1] - .043 * s, foot[2] + .003 * s], .0032 * s, out);
    add([x + side * .004 * s, foot[1] - .043 * s, foot[2] + .003 * s], [x + side * .005 * s, foot[1] - .060 * s, foot[2] + .003 * s], .0025 * s, out);
  }
}

function skull(out: BoneSpec[], markers: Marker[], H: number, s: number) {
  const y = .955 * H;
  // Frontal, parietal, temporal, zygomatic, maxilla and mandible landmarks.
  add(V(-.070 * s, y + .010 * s, .008 * s), V(.070 * s, y + .010 * s, .008 * s), .022 * s, out);
  add(V(-.070 * s, y + .010 * s, .008 * s), V(-.095 * s, y - .030 * s, 0), .012 * s, out);
  add(V(.070 * s, y + .010 * s, .008 * s), V(.095 * s, y - .030 * s, 0), .012 * s, out);
  add(V(-.095 * s, y - .030 * s, 0), V(-.060 * s, y - .078 * s, -.006 * s), .011 * s, out);
  add(V(.095 * s, y - .030 * s, 0), V(.060 * s, y - .078 * s, -.006 * s), .011 * s, out);
  add(V(-.060 * s, y - .078 * s, -.006 * s), V(.060 * s, y - .078 * s, -.006 * s), .010 * s, out);
  add(V(-.070 * s, y - .038 * s, .040 * s), V(-.028 * s, y - .065 * s, .046 * s), .006 * s, out);
  add(V(.070 * s, y - .038 * s, .040 * s), V(.028 * s, y - .065 * s, .046 * s), .006 * s, out);
  add(V(-.028 * s, y - .065 * s, .046 * s), V(0, y - .047 * s, .052 * s), .006 * s, out);
  add(V(.028 * s, y - .065 * s, .046 * s), V(0, y - .047 * s, .052 * s), .006 * s, out);
  add(V(-.042 * s, y - .082 * s, .032 * s), V(0, y - .103 * s, .030 * s), .007 * s, out);
  add(V(.042 * s, y - .082 * s, .032 * s), V(0, y - .103 * s, .030 * s), .007 * s, out);
  mark(V(-.055 * s, y - .040 * s, .048 * s), V(.014 * s, .010 * s, .009 * s), markers); // orbit
  mark(V(.055 * s, y - .040 * s, .048 * s), V(.014 * s, .010 * s, .009 * s), markers);
  mark(V(0, y - .103 * s, .030 * s), V(.050 * s, .008 * s, .010 * s), markers); // mandible
}

export function DetailedSkeletalLayer({ H, s, torsoDepth, shoulder, hip, patientMorph, pose, projectionId, placement, buckyTilt, opacity }: {
  H: number; s: number; torsoWidth: number; torsoDepth: number; shoulder: number; hip: number; patientMorph: { limb: number };
  pose: { elbowFlex: number; hipInternal: number; armRaise: number; shoulderRoll: number; kneeFlex: number };
  projectionId: string; placement: "standing" | "seated" | "upright-bucky" | "table"; buckyTilt: number; opacity: number;
}) {
  const k = patientKinematics({ H, s, shoulder, hip, limb: patientMorph.limb, elbowFlex: pose.elbowFlex, hipInternal: pose.hipInternal, armRaise: pose.armRaise, shoulderRoll: pose.shoulderRoll, kneeFlex: pose.kneeFlex, projectionId, placement, buckyTilt });
  const { bones, markers } = useMemo(() => {
    const bones: BoneSpec[] = [], markers: Marker[] = [];
    const depth = torsoDepth * s;
    const cervicalTop = .875 * H, cervicalBottom = .79 * H, thoracicTop = .785 * H, thoracicBottom = .565 * H, lumbarTop = .56 * H, lumbarBottom = .465 * H;
    for (let i = 0; i < 7; i++) vertebra(bones, markers, cervicalTop - i * (cervicalTop - cervicalBottom) / 6, s, depth, "c", i);
    for (let i = 0; i < 12; i++) vertebra(bones, markers, thoracicTop - i * (thoracicTop - thoracicBottom) / 11, s, depth, "t", i);
    for (let i = 0; i < 5; i++) vertebra(bones, markers, lumbarTop - i * (lumbarTop - lumbarBottom) / 4, s, depth, "l", i);
    ribs(bones, s, depth, H); sternum(bones, markers, H, s, depth); pelvis(bones, markers, k, s, depth); skull(bones, markers, H, s);
    for (const side of [-1, 1] as const) { scapula(bones, markers, k.arms[side === -1 ? 0 : 1].shoulder, side, s); clavicle(bones, k.arms[side === -1 ? 0 : 1].shoulder, side, s, depth); upperLimb(bones, markers, k.arms[side === -1 ? 0 : 1], side, s); lowerLimb(bones, markers, k.legs[side === -1 ? 0 : 1], side, s); }
    // Sacrum and coccyx.
    add(V(-.050 * s, .455 * H, .008 * depth), V(.050 * s, .455 * H, .008 * depth), .014 * s, bones);
    for (let i = 0; i < 4; i++) add(V(0, (.435 - i * .018) * H, .004 * depth), V(0, (.420 - i * .018) * H, 0), .008 * s, bones);
    return { bones, markers };
  }, [H, s, torsoDepth, shoulder, hip, patientMorph.limb, pose.elbowFlex, pose.hipInternal, pose.armRaise, pose.shoulderRoll, pose.kneeFlex, projectionId, placement, buckyTilt, k]);
  return <group>
    {bones.map((b, i) => <Bone key={`detail-bone-${i}`} {...b} opacity={opacity} />)}
    {markers.map((m, i) => <Marker key={`detail-marker-${i}`} {...m} opacity={opacity} />)}
  </group>;
}
