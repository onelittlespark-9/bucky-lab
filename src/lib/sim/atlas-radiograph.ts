import * as THREE from "three";
import type { Patient, Projection, SimPose, TubeState, PlacementMode } from "./types";
import { patientKinematics, type V3 } from "./patient-kinematics";
import type { ProjectionGeometry } from "./projection-physics";

const MODEL_ROOT = "/models/human-atlas/";
const ATLAS_HEIGHT_M = 1.7;
const CACHE = new Map<string, AtlasScene>();

interface AtlasPart {
  id: string;
  name: string;
  system: string;
  chunk: number;
  positions: number;
  normals: number;
  indices: number;
  vertexCount: number;
  indexCount: number;
  bounds: [number[], number[]];
}
interface AtlasManifest { version: string; parts: AtlasPart[]; chunks: { url: string; bytes: number }[]; triangles: number; }
interface AtlasScene { root: THREE.Group; meshes: THREE.Mesh[]; }

/** Anatomical regions used to assign tissue-equivalent CT-number ranges. */
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
  if (n.includes("foot") || n.includes("metatars") || n.includes("talus") || n.includes("calcaneus") || n.includes("tarsal")) return "foot";
  if (n.includes("pelvis") || n.includes("ilium") || n.includes("ischium") || n.includes("pubis") || n.includes("sacrum")) return "pelvis";
  if (n.includes("vertebra") || n.includes("spine") || n.includes("sternum") || n.includes("coccyx")) return "axial";
  if (n.includes("skull") || n.includes("mandible") || n.includes("maxilla") || n.includes("zygomatic") || n.includes("temporal") || n.includes("frontal") || n.includes("parietal")) return "skull";
  return "axial";
}
function sideFor(bounds: [number[], number[]]): -1 | 1 { return ((bounds[0][0] + bounds[1][0]) * 0.5) < 0 ? -1 : 1; }

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
  const mid = (a: THREE.Vector3, b: THREE.Vector3) => a.clone().add(b).multiplyScalar(0.5);

  for (const object of meshes) {
    const region = object.userData.atlasRegion as string;
    const side = object.userData.atlasSide as -1 | 1;
    const centre = object.userData.atlasCenter as V3;
    object.position.copy(local(centre));
    object.rotation.set(0, 0, 0);
    object.scale.setScalar(1);
    if (region === "rib" || region === "axial" || region === "skull") continue;

    const arm = kin.arms[side < 0 ? 0 : 1];
    const leg = kin.legs[side < 0 ? 0 : 1];
    const shoulder = local(arm.shoulder), elbow = local(arm.elbow), wrist = local(arm.wrist), hand = local(arm.hand);
    const hip = local(leg.hip), knee = local(leg.knee), ankle = local(leg.ankle), foot = local(leg.foot);
    const upperQ = new THREE.Quaternion().setFromUnitVectors(yAxis, new THREE.Vector3(...arm.elbow).sub(new THREE.Vector3(...arm.shoulder)).normalize());
    const forearmQ = new THREE.Quaternion().setFromUnitVectors(yAxis, new THREE.Vector3(...arm.wrist).sub(new THREE.Vector3(...arm.elbow)).normalize());

    if (region === "scapula" || region === "clavicle") { object.position.copy(shoulder); continue; }
    if (region === "humerus") { object.position.copy(mid(shoulder, elbow)); object.quaternion.copy(upperQ); continue; }
    if (region === "forearm") { object.position.copy(mid(elbow, wrist)); object.quaternion.copy(forearmQ); continue; }
    if (region === "hand") { object.position.copy(hand); object.quaternion.copy(forearmQ); continue; }
    if (region === "pelvis") { object.position.set(0, 0.47 * H / scale, 0); continue; }

    const hipQ = new THREE.Quaternion().setFromUnitVectors(yAxis, new THREE.Vector3(...leg.knee).sub(new THREE.Vector3(...leg.hip)).normalize());
    const kneeQ = new THREE.Quaternion().setFromUnitVectors(yAxis, new THREE.Vector3(...leg.ankle).sub(new THREE.Vector3(...leg.knee)).normalize());
    if (region === "femur") { object.position.copy(mid(hip, knee)); object.quaternion.copy(hipQ); continue; }
    if (region === "lowerleg") { object.position.copy(mid(knee, ankle)); object.quaternion.copy(kneeQ); continue; }
    if (region === "foot") { object.position.copy(foot); object.quaternion.copy(kneeQ); }
  }
}

/**
 * HU is a CT calibration scale, not a native radiography quantity. Here it is
 * used as a tissue-equivalent density model so atlas geometry can be projected
 * with a reproducible attenuation model. Typical ranges are supported by
 * radiology references: air -1000, lung roughly -900 to -400, fat -100 to -60,
 * soft tissue ~10-80, trabecular bone ~300-700 and cortical bone commonly
 * ~800-1500+ HU.
 */
function materialHU(region: string, projection: Projection): { trabecular: number; cortical: number } {
  if (region === "skull") return { trabecular: 650, cortical: 1250 };
  if (region === "pelvis") return { trabecular: 500, cortical: 1150 };
  if (region === "rib" || region === "scapula" || region === "clavicle") return { trabecular: 450, cortical: 1050 };
  if (region === "axial") return { trabecular: projection.id.includes("lumbar") ? 500 : 450, cortical: 1050 };
  if (region === "femur" || region === "lowerleg") return { trabecular: 550, cortical: 1250 };
  if (region === "humerus" || region === "forearm") return { trabecular: 500, cortical: 1150 };
  if (region === "hand" || region === "foot") return { trabecular: 450, cortical: 1000 };
  return { trabecular: 500, cortical: 1100 };
}

function muFromHU(hu: number, kvp: number): number {
  const energyScale = Math.pow(70 / Math.max(45, kvp), 0.28);
  const muAir = 0.0003 * energyScale;
  const muWater = 0.205 * energyScale;
  const muBone1000 = 0.72 * energyScale;
  if (hu <= -1000) return muAir;
  if (hu <= 0) return muWater + (hu / 1000) * (muWater - muAir);
  if (hu <= 1000) return muWater + (hu / 1000) * (muBone1000 - muWater);
  return muBone1000 + Math.min(1000, hu - 1000) * 0.00018 * energyScale;
}

function unpackDepth(r: number, g: number, b: number, a: number): number {
  // The shader writes the same linear depth into all channels. Keep decoding
  // deliberately simple so colour-space transforms cannot create false depth.
  return r / 255;
}

function renderRegionThickness(
  scene: AtlasScene,
  region: string,
  camera: THREE.OrthographicCamera,
  renderer: THREE.WebGLRenderer,
  renderTarget: THREE.WebGLRenderTarget,
  frontMaterial: THREE.ShaderMaterial,
  backMaterial: THREE.ShaderMaterial,
  rw: number,
  rh: number,
): Float32Array {
  for (const mesh of scene.meshes) mesh.visible = mesh.userData.atlasRegion === region;
  const front = new Uint8Array(rw * rh * 4);
  const back = new Uint8Array(rw * rh * 4);

  scene.root.updateMatrixWorld(true);
  scene.overrideMaterial = frontMaterial;
  renderer.setRenderTarget(renderTarget);
  renderer.clear(true, true, true);
  renderer.render(scene.root.parent ?? scene.root, camera);
  renderer.readRenderTargetPixels(renderTarget, 0, 0, rw, rh, front);

  scene.overrideMaterial = backMaterial;
  renderer.clear(true, true, true);
  renderer.render(scene.root.parent ?? scene.root, camera);
  renderer.readRenderTargetPixels(renderTarget, 0, 0, rw, rh, back);

  const result = new Float32Array(rw * rh);
  const rangeCm = camera.far - camera.near;
  for (let i = 0; i < result.length; i++) {
    const j = i * 4;
    const f = unpackDepth(front[j]!, front[j + 1]!, front[j + 2]!, front[j + 3]!);
    const b = unpackDepth(back[j]!, back[j + 1]!, back[j + 2]!, back[j + 3]!);
    if (f >= 0.9999 || b >= 0.9999 || b <= f) continue;
    result[i] = Math.max(0, (b - f) * rangeCm * 100);
  }
  return result;
}

export async function atlasBoneOpticalDensity(args: {
  patient: Patient;
  projection: Projection;
  pose: SimPose;
  tube: TubeState;
  exposureKvp: number;
  width: number;
  height: number;
  geometry: ProjectionGeometry;
}): Promise<Float32Array | null> {
  if (typeof document === "undefined" || typeof window === "undefined") return null;
  const { patient, projection, pose, tube, exposureKvp, width, height, geometry } = args;

  try {
    const atlas = await loadAtlas();
    const placement: PlacementMode = projection.setup === "table" || projection.setup === "tabletop" ? "table" : "upright-bucky";
    articulate(atlas.root, atlas.meshes, pose, patient, placement, projection.id);

    // Render at a bounded working resolution and upscale. This keeps the browser
    // renderer responsive while preserving the full atlas anatomical silhouette.
    const rw = Math.min(448, Math.max(224, width));
    const rh = Math.min(448, Math.max(224, height));
    const targetYcm = projection.cr.y * patient.heightCm / 170;
    const targetXcm = projection.cr.x;
    const targetY = patient.heightCm / 100 - targetYcm / 100;
    const target = new THREE.Vector3(targetXcm / 100, targetY, 0);
    const lateral = projection.anatomy === "torso-lat" || projection.anatomy === "cspine-lat" || projection.anatomy === "skull-lat";

    const camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.01, 5);
    const halfW = tube.collimationW / geometry.magnification / 200;
    const halfH = tube.collimationH / geometry.magnification / 200;
    camera.left = -halfW; camera.right = halfW; camera.top = halfH; camera.bottom = -halfH;
    camera.position.copy(lateral ? new THREE.Vector3(target.x + 2.5, target.y, target.z) : new THREE.Vector3(target.x, target.y, target.z + 2.5));
    camera.lookAt(target);
    camera.updateProjectionMatrix();

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: false });
    renderer.setSize(rw, rh, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.add(atlas.root);

    const renderTarget = new THREE.WebGLRenderTarget(rw, rh, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    });

    const depthVertex = `varying float vDepth; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; vDepth=gl_Position.z/gl_Position.w*.5+.5; }`;
    const depthFragment = `varying float vDepth; void main(){ float z=clamp(vDepth,0.0,1.0); gl_FragColor=vec4(z,z,z,1.0); }`;
    const frontMaterial = new THREE.ShaderMaterial({ vertexShader: depthVertex, fragmentShader: depthFragment, side: THREE.FrontSide, depthTest: true, depthWrite: true });
    const backMaterial = new THREE.ShaderMaterial({ vertexShader: depthVertex, fragmentShader: depthFragment, side: THREE.BackSide, depthTest: true, depthWrite: true });

    // Each anatomical group receives its own tissue-equivalent HU assignment.
    // The projected optical densities are then summed, preserving true
    // superimposition between ribs, spine, pelvis, limbs and skull.
    const regions = ["axial", "rib", "scapula", "clavicle", "skull", "pelvis", "femur", "lowerleg", "humerus", "forearm", "hand", "foot"];
    const low = new Float32Array(rw * rh);
    for (const region of regions) {
      if (!atlas.meshes.some(m => m.userData.atlasRegion === region)) continue;
      const thickness = renderRegionThickness(atlas, region, camera, renderer, renderTarget, frontMaterial, backMaterial, rw, rh);
      const hu = materialHU(region, projection);
      const muTrab = muFromHU(hu.trabecular, exposureKvp);
      const muCort = muFromHU(hu.cortical, exposureKvp);
      for (let i = 0; i < low.length; i++) {
        const t = thickness[i]!;
        if (t <= 0) continue;
        // A surface-only atlas does not contain voxelised marrow. Model the
        // projected path as a realistic mixture of cortical shell and trabecular
        // interior. Thin bones are predominantly cortical; broad bones retain a
        // substantial cancellous component.
        const shellCm = Math.min(t * 0.28, 0.22);
        const corticalPath = Math.min(t, shellCm * 2);
        const trabPath = Math.max(0, t - corticalPath);
        low[i] += corticalPath * muCort + trabPath * muTrab;
      }
    }

    for (const mesh of atlas.meshes) mesh.visible = true;
    renderer.dispose();
    renderTarget.dispose();
    frontMaterial.dispose();
    backMaterial.dispose();

    const full = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      const sy = y / Math.max(1, height - 1) * (rh - 1);
      const y0 = Math.floor(sy), y1 = Math.min(rh - 1, y0 + 1), fy = sy - y0;
      for (let x = 0; x < width; x++) {
        const sx = x / Math.max(1, width - 1) * (rw - 1);
        const x0 = Math.floor(sx), x1 = Math.min(rw - 1, x0 + 1), fx = sx - x0;
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
