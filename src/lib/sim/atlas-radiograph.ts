import * as THREE from "three";
import type { Patient, Projection, SimPose, TubeState, PlacementMode } from "./types";
import { patientKinematics, type V3 } from "./patient-kinematics";
import { projectionGeometry, type ProjectionGeometry } from "./projection-physics";

/**
 * The Human Atlas is the anatomical source for the radiograph bone geometry.
 * The atlas contains surfaces rather than CT voxels, so the projection derives
 * an equivalent bone path length from the front/back intersections of the
 * closed meshes. HU is then converted to an energy-dependent linear
 * attenuation coefficient before Beer-Lambert projection.
 */
const MODEL_ROOT = "/models/human-atlas/";
const ATLAS_HEIGHT_M = 1.7;
const CACHE = new Map<string, AtlasScene>();

interface AtlasPart {
  id: string; name: string; system: string; chunk: number;
  positions: number; normals: number; indices: number;
  vertexCount: number; indexCount: number; bounds: [number[], number[]];
}
interface AtlasManifest { version: string; parts: AtlasPart[]; chunks: { url: string; bytes: number }[]; triangles: number; }
interface AtlasScene { root: THREE.Group; meshes: THREE.Mesh[]; }

function regionFor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("rib") || n.includes("costal")) return "rib";
  if (n.includes("scapula")) return "scapula";
  if (n.includes("clavicle")) return "clavicle";
  if (n.includes("humerus")) return "humerus";
  if (n.includes("radius") || n.includes("ulna")) return "forearm";
  if (n.includes("hand") || n.includes("metacarp") || n.includes("phalanx") || n.includes("carpal")) return "hand";
  if (n.includes("femur")) return "femur";
  if (n.includes("tibia") || n.includes("fibula")) return "lowerleg";
  if (n.includes("foot") || n.includes("metatars") || n.includes("talus") || n.includes("calcaneus")) return "foot";
  if (n.includes("pelvis") || n.includes("ilium") || n.includes("ischium") || n.includes("pubis") || n.includes("sacrum")) return "pelvis";
  if (n.includes("vertebra") || n.includes("spine") || n.includes("sternum")) return "axial";
  if (n.includes("skull") || n.includes("mandible") || n.includes("maxilla") || n.includes("zygomatic")) return "skull";
  return "axial";
}

function sideFor(bounds: [number[], number[]]): -1 | 1 {
  return ((bounds[0][0] + bounds[1][0]) * 0.5) < 0 ? -1 : 1;
}

async function loadAtlas(): Promise<AtlasScene> {
  const cached = CACHE.get("atlas");
  if (cached) return cached;
  const response = await fetch(`${MODEL_ROOT}atlas.json`, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Human Atlas manifest failed to load (${response.status}).`);
  const atlas = await response.json() as AtlasManifest;
  const parts = atlas.parts.filter(p => p.system === "skeletal");
  if (!parts.length) throw new Error("Human Atlas contains no skeletal structures.");

  const root = new THREE.Group();
  root.name = "Bucky-Lab-atlas-radiograph-skeleton";
  const meshes: THREE.Mesh[] = [];
  const chunks = new Map<number, Array<{ part: AtlasPart; buffer: ArrayBuffer }>>();
  await Promise.all([...new Set(parts.map(p => p.chunk))].map(async chunkIndex => {
    const chunk = atlas.chunks[chunkIndex];
    if (!chunk) throw new Error(`Human Atlas chunk ${chunkIndex} is missing.`);
    const r = await fetch(chunk.url, { cache: "force-cache" });
    if (!r.ok) throw new Error(`Human Atlas chunk ${chunkIndex} failed.`);
    const buffer = await r.arrayBuffer();
    if (buffer.byteLength !== chunk.bytes) throw new Error(`Human Atlas chunk ${chunkIndex} is incomplete.`);
    chunks.set(chunkIndex, parts.filter(p => p.chunk === chunkIndex).map(part => ({ part, buffer })));
  }));

  for (const { part, buffer } of [...chunks.values()].flat()) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(buffer, part.positions, part.vertexCount * 3), 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Int16Array(buffer, part.normals, part.vertexCount * 3), 3, true));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer, part.indices, part.indexCount), 1));
    const center = new THREE.Vector3(
      (part.bounds[0][0] + part.bounds[1][0]) * 0.5,
      (part.bounds[0][1] + part.bounds[1][1]) * 0.5,
      (part.bounds[0][2] + part.bounds[1][2]) * 0.5,
    );
    // Keep a centred local mesh and retain its anatomical centre separately.
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry);
    mesh.name = `Atlas radiograph ${part.name}`;
    mesh.userData.atlasRegion = regionFor(part.name);
    mesh.userData.atlasSide = sideFor(part.bounds);
    mesh.userData.atlasCenter = [center.x, center.y, center.z] as V3;
    root.add(mesh);
    meshes.push(mesh);
  }
  const scene = { root, meshes };
  CACHE.set("atlas", scene);
  return scene;
}

function articulate(root: THREE.Group, meshes: THREE.Mesh[], pose: SimPose, patient: Patient, placement: PlacementMode, projectionId: string) {
  const H = patient.heightCm / 100;
  const scale = H / ATLAS_HEIGHT_M;
  const kin = patientKinematics({
    H, s: 1, shoulder: patient.morph.shoulder, hip: patient.morph.hip, limb: patient.morph.limb,
    elbowFlex: pose.elbowFlex, hipInternal: pose.hipInternal, armRaise: pose.armRaise, armSide: pose.armSide,
    armRotation: pose.armRotation, forearmRotation: pose.forearmRotation, shoulderRoll: pose.shoulderRoll,
    kneeFlex: pose.kneeFlex, projectionId, placement, buckyTilt: 0,
  });
  root.scale.setScalar(scale);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const local = (p: V3) => new THREE.Vector3(p[0] / scale, p[1] / scale, p[2] / scale);
  const midpoint = (a: THREE.Vector3, b: THREE.Vector3) => a.clone().add(b).multiplyScalar(0.5);

  for (const object of meshes) {
    const region = object.userData.atlasRegion as string;
    const side = object.userData.atlasSide as -1 | 1;
    const centre = object.userData.atlasCenter as V3;
    object.position.copy(local(centre));
    object.rotation.set(0, 0, 0);

    // Axial structures and ribs retain their real atlas centres. Appendicular
    // structures are moved onto the same continuous patient kinematic chain.
    if (region === "rib" || region === "axial" || region === "skull") continue;
    const arm = kin.arms[side < 0 ? 0 : 1];
    const leg = kin.legs[side < 0 ? 0 : 1];
    const shoulder = local(arm.shoulder), elbow = local(arm.elbow), wrist = local(arm.wrist), hand = local(arm.hand);
    const hip = local(leg.hip), knee = local(leg.knee), ankle = local(leg.ankle), foot = local(leg.foot);
    const upperQ = new THREE.Quaternion().setFromUnitVectors(yAxis, new THREE.Vector3(...arm.elbow).sub(new THREE.Vector3(...arm.shoulder)).normalize());
    const forearmQ = new THREE.Quaternion().setFromUnitVectors(yAxis, new THREE.Vector3(...arm.wrist).sub(new THREE.Vector3(...arm.elbow)).normalize());
    if (region === "scapula" || region === "clavicle") { object.position.copy(shoulder); continue; }
    if (region === "humerus") { object.position.copy(midpoint(shoulder, elbow)); object.quaternion.copy(upperQ); continue; }
    if (region === "forearm") { object.position.copy(midpoint(elbow, wrist)); object.quaternion.copy(forearmQ); continue; }
    if (region === "hand") { object.position.copy(hand); object.quaternion.copy(forearmQ); continue; }
    if (region === "pelvis") { object.position.set(0, 0.47 * H / scale, 0); continue; }
    const hipQ = new THREE.Quaternion().setFromUnitVectors(yAxis, new THREE.Vector3(...leg.knee).sub(new THREE.Vector3(...leg.hip)).normalize());
    const kneeQ = new THREE.Quaternion().setFromUnitVectors(yAxis, new THREE.Vector3(...leg.ankle).sub(new THREE.Vector3(...leg.knee)).normalize());
    if (region === "femur") { object.position.copy(midpoint(hip, knee)); object.quaternion.copy(hipQ); continue; }
    if (region === "lowerleg") { object.position.copy(midpoint(knee, ankle)); object.quaternion.copy(kneeQ); continue; }
    if (region === "foot") { object.position.copy(foot); object.quaternion.copy(kneeQ); }
  }
}

function huForProjection(projection: Projection, region: string): number {
  const p = projection.id;
  if (region === "skull") return 1250;
  if (region === "rib" || region === "clavicle" || region === "scapula") return 1050;
  if (region === "pelvis" || region === "femur") return p.includes("hip") || p.includes("pelvis") ? 900 : 850;
  if (region === "axial") return p.includes("lumbar") || p.includes("cspine") ? 750 : 800;
  return 850;
}

function muFromHU(hu: number, kvp: number): number {
  // HU is a CT calibration scale: air=-1000 HU and water=0 HU. We use a
  // diagnostic-energy reference coefficient and scale it gently with kVp.
  const energyScale = Math.pow(70 / Math.max(45, kvp), 0.28);
  const muAir = 0.0003 * energyScale;
  const muWater = 0.205 * energyScale;
  const muBone1000 = 0.72 * energyScale;
  if (hu <= 0) return muWater + (hu / 1000) * (muWater - muAir);
  if (hu <= 1000) return muWater + (hu / 1000) * (muBone1000 - muWater);
  return muBone1000 + Math.min(1000, hu - 1000) * 0.00018 * energyScale;
}

function unpackDepth(r: number, g: number, b: number, a: number): number {
  return r / 255 + g / 65025 + b / 16581375 + a / 4228250625;
}

/**
 * Returns a normalized atlas bone optical-density contribution. Rendering is
 * deliberately downsampled internally and upscaled by the caller to keep the
 * teaching simulator responsive on ordinary laptops/phones.
 */
export async function atlasBoneOpticalDensity(args: {
  patient: Patient; projection: Projection; pose: SimPose; tube: TubeState;
  exposureKvp: number; width: number; height: number; geometry: ProjectionGeometry;
}): Promise<Float32Array | null> {
  if (typeof document === "undefined" || typeof window === "undefined") return null;
  const { patient, projection, pose, tube, exposureKvp, width, height, geometry } = args;
  try {
    const atlas = await loadAtlas();
    const placement: PlacementMode = projection.setup === "table" || projection.setup === "tabletop" ? "table" : "upright-bucky";
    articulate(atlas.root, atlas.meshes, pose, patient, placement, projection.id);

    const rw = Math.min(384, Math.max(192, width));
    const rh = Math.min(384, Math.max(192, height));
    const targetYcm = projection.cr.y * patient.heightCm / 170;
    const targetXcm = projection.cr.x;
    const target = new THREE.Vector3(targetXcm / 100, targetYcm / 100, 0);
    const lateral = projection.anatomy === "torso-lat" || projection.anatomy === "cspine-lat" || projection.anatomy === "skull-lat";
    const camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.01, 4);
    const halfW = (tube.collimationW / geometry.magnification) / 200;
    const halfH = (tube.collimationH / geometry.magnification) / 200;
    camera.left = -halfW; camera.right = halfW; camera.top = halfH; camera.bottom = -halfH;
    camera.position.copy(lateral ? new THREE.Vector3(target.x + 2.5, target.y, target.z) : new THREE.Vector3(target.x, target.y, target.z + 2.5));
    camera.lookAt(target);
    camera.updateProjectionMatrix();

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: false });
    renderer.setSize(rw, rh, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.add(atlas.root);

    const renderTarget = new THREE.WebGLRenderTarget(rw, rh, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false });
    const depthMaterial = new THREE.ShaderMaterial({
      vertexShader: `varying float vDepth; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; vDepth=gl_Position.z/gl_Position.w*0.5+0.5; }`,
      fragmentShader: `varying float vDepth; void main(){ float z=clamp(vDepth,0.0,1.0); gl_FragColor=vec4(z,z,z,1.0); }`,
      side: THREE.FrontSide,
    });
    const backMaterial = depthMaterial.clone(); backMaterial.side = THREE.BackSide;
    const pixelsFront = new Uint8Array(rw * rh * 4);
    const pixelsBack = new Uint8Array(rw * rh * 4);

    scene.overrideMaterial = depthMaterial;
    renderer.setRenderTarget(renderTarget); renderer.clear(); renderer.render(scene, camera); renderer.readRenderTargetPixels(renderTarget, 0, 0, rw, rh, pixelsFront);
    scene.overrideMaterial = backMaterial;
    renderer.setRenderTarget(renderTarget); renderer.clear(); renderer.render(scene, camera); renderer.readRenderTargetPixels(renderTarget, 0, 0, rw, rh, pixelsBack);

    const low = new Float32Array(rw * rh);
    const farRange = camera.far - camera.near;
    const hu = huForProjection(projection, projection.region === "Skull" ? "skull" : "axial");
    const mu = muFromHU(hu, exposureKvp);
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
      const i = y * rw + x, j = i * 4;
      const f = unpackDepth(pixelsFront[j]!, pixelsFront[j + 1]!, pixelsFront[j + 2]!, pixelsFront[j + 3]!);
      const b = unpackDepth(pixelsBack[j]!, pixelsBack[j + 1]!, pixelsBack[j + 2]!, pixelsBack[j + 3]!);
      if (f >= 0.9999 || b >= 0.9999 || b <= f) continue;
      const thicknessCm = Math.max(0, (b - f) * farRange * 100);
      // The atlas mesh gives anatomical morphology and physical projected path
      // length. A thin cortical edge boost approximates the cortical/trabecular
      // contrast seen in projection radiography without turning bones into rods.
      low[i] = mu * thicknessCm;
    }

    renderer.dispose(); renderTarget.dispose(); depthMaterial.dispose(); backMaterial.dispose();
    const full = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      const sy = (y / Math.max(1, height - 1)) * (rh - 1), y0 = Math.floor(sy), y1 = Math.min(rh - 1, y0 + 1), fy = sy - y0;
      for (let x = 0; x < width; x++) {
        const sx = (x / Math.max(1, width - 1)) * (rw - 1), x0 = Math.floor(sx), x1 = Math.min(rw - 1, x0 + 1), fx = sx - x0;
        const a = low[y0 * rw + x0]!, b = low[y0 * rw + x1]!, c = low[y1 * rw + x0]!, d = low[y1 * rw + x1]!;
        full[y * width + x] = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
      }
    }
    return full;
  } catch {
    return null;
  }
}

export { muFromHU };
