import * as THREE from "three";
import type { Patient, Projection, TubeState } from "./types";
import type { ProjectionGeometry } from "./projection-physics";

const MODEL_ROOT = "/models/human-atlas/";
const ATLAS_HEIGHT_M = 1.7;

type Region =
  | "rib"
  | "scapula"
  | "clavicle"
  | "humerus"
  | "forearm"
  | "hand"
  | "femur"
  | "patella"
  | "lowerleg"
  | "foot"
  | "pelvis"
  | "axial"
  | "skull"
  | "other";

interface AtlasPart {
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
interface AtlasManifest {
  parts: AtlasPart[];
  chunks: { url: string; bytes: number }[];
}
interface LoadedPart {
  mesh: THREE.Mesh;
  region: Region;
}
interface NativeAtlas {
  root: THREE.Group;
  parts: LoadedPart[];
}

let cache: Promise<NativeAtlas> | null = null;

function regionFor(name: string): Region {
  const n = name.toLowerCase();
  if (n.includes("cartilage")) return "other";
  if (n.includes("rib") || n.includes("costal")) return "rib";
  if (n.includes("scapula")) return "scapula";
  if (n.includes("clavicle")) return "clavicle";
  if (n.includes("humerus")) return "humerus";
  if (n.includes("radius") || n.includes("ulna")) return "forearm";
  if (n.includes("hand") || n.includes("metacarp") || n.includes("phalan") || n.includes("carpal")) return "hand";
  if (n.includes("femur")) return "femur";
  if (n.includes("patella")) return "patella";
  if (n.includes("tibia") || n.includes("fibula")) return "lowerleg";
  if (n.includes("foot") || n.includes("metatars") || n.includes("talus") || n.includes("calcaneus") || n.includes("tarsal")) return "foot";
  if (
    n.includes("pelvis") ||
    n.includes("ilium") ||
    n.includes("ischium") ||
    n.includes("pubis") ||
    n.includes("sacrum") ||
    n.includes("hip bone") ||
    n.includes("coxal") ||
    n.includes("innominate") ||
    n.includes("acetabul") ||
    n.includes("os cox")
  ) return "pelvis";
  if (n.includes("vertebra") || n.includes("spine") || n.includes("sternum") || n.includes("coccyx")) return "axial";
  if (
    n.includes("skull") ||
    n.includes("mandible") ||
    n.includes("maxilla") ||
    n.includes("zygomatic") ||
    n.includes("temporal") ||
    n.includes("frontal") ||
    n.includes("parietal")
  ) return "skull";
  return "other";
}

async function loadNativeAtlas(): Promise<NativeAtlas> {
  if (cache) return cache;
  cache = (async () => {
    const response = await fetch(`${MODEL_ROOT}atlas.json`, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Whole-body atlas manifest failed (${response.status}).`);
    const atlas = (await response.json()) as AtlasManifest;
    const skeletal = atlas.parts.filter((p) => p.system === "skeletal");
    const chunks = new Map<number, ArrayBuffer>();
    await Promise.all(
      [...new Set(skeletal.map((p) => p.chunk))].map(async (i) => {
        const c = atlas.chunks[i];
        if (!c) throw new Error(`Whole-body atlas chunk ${i} missing.`);
        const r = await fetch(c.url, { cache: "force-cache" });
        if (!r.ok) throw new Error(`Whole-body atlas chunk ${i} failed.`);
        const b = await r.arrayBuffer();
        if (b.byteLength !== c.bytes) throw new Error(`Whole-body atlas chunk ${i} incomplete.`);
        chunks.set(i, b);
      }),
    );

    const root = new THREE.Group();
    const parts: LoadedPart[] = [];
    for (const part of skeletal) {
      const buffer = chunks.get(part.chunk);
      if (!buffer) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(buffer, part.positions, part.vertexCount * 3), 3));
      g.setAttribute("normal", new THREE.BufferAttribute(new Int16Array(buffer, part.normals, part.vertexCount * 3), 3, true));
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer, part.indices, part.indexCount), 1));
      const c = new THREE.Vector3(
        (part.bounds[0][0] + part.bounds[1][0]) * 0.5,
        (part.bounds[0][1] + part.bounds[1][1]) * 0.5,
        (part.bounds[0][2] + part.bounds[1][2]) * 0.5,
      );
      g.translate(-c.x, -c.y, -c.z);
      const mesh = new THREE.Mesh(g);
      mesh.position.copy(c);
      mesh.name = part.name;
      root.add(mesh);
      parts.push({ mesh, region: regionFor(part.name) });
    }
    return { root, parts };
  })();
  return cache;
}

function mu(hu: number, kvp: number) {
  const e = Math.pow(70 / Math.max(45, kvp), 0.28);
  const air = 0.0003 * e;
  const water = 0.205 * e;
  const bone = 0.72 * e;
  if (hu <= -1000) return air;
  if (hu <= 0) return water + (hu / 1000) * (water - air);
  if (hu <= 1000) return water + (hu / 1000) * (bone - water);
  return bone + Math.min(1000, hu - 1000) * 0.00018 * e;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function profile(region: Region) {
  switch (region) {
    case "skull": return { trabHU: 180, cortHU: 760, marrowHU: 25, gain: 0.155, cap: 1.15, shell: 0.050 };
    case "pelvis": return { trabHU: 145, cortHU: 690, marrowHU: 10, gain: 0.165, cap: 0.95, shell: 0.047 };
    case "axial": return { trabHU: 115, cortHU: 560, marrowHU: 5, gain: 0.118, cap: 0.64, shell: 0.036 };
    case "rib": return { trabHU: 80, cortHU: 430, marrowHU: 0, gain: 0.112, cap: 0.34, shell: 0.028 };
    case "clavicle":
    case "scapula": return { trabHU: 105, cortHU: 520, marrowHU: 0, gain: 0.135, cap: 0.50, shell: 0.036 };
    case "femur":
    case "lowerleg": return { trabHU: 125, cortHU: 710, marrowHU: -45, gain: 0.155, cap: 0.90, shell: 0.047 };
    case "humerus":
    case "forearm": return { trabHU: 120, cortHU: 680, marrowHU: -45, gain: 0.150, cap: 0.80, shell: 0.045 };
    case "patella": return { trabHU: 120, cortHU: 590, marrowHU: 0, gain: 0.145, cap: 0.52, shell: 0.039 };
    case "hand":
    case "foot": return { trabHU: 105, cortHU: 560, marrowHU: -20, gain: 0.150, cap: 0.50, shell: 0.036 };
    default: return { trabHU: 115, cortHU: 600, marrowHU: 0, gain: 0.145, cap: 0.58, shell: 0.040 };
  }
}

function isLongBone(region: Region) {
  return region === "femur" || region === "lowerleg" || region === "humerus" || region === "forearm";
}

function unpackDepth(b: Uint8Array, j: number) {
  return b[j]! / 255 + b[j + 1]! / 65025 + b[j + 2]! / 16581375;
}

function projectThickness(
  scene: THREE.Scene,
  root: THREE.Group,
  all: LoadedPart[],
  part: LoadedPart,
  camera: THREE.OrthographicCamera,
  renderer: THREE.WebGLRenderer,
  target: THREE.WebGLRenderTarget,
  frontMaterial: THREE.ShaderMaterial,
  backMaterial: THREE.ShaderMaterial,
  w: number,
  h: number,
) {
  for (const p of all) p.mesh.visible = p === part;
  root.updateMatrixWorld(true);
  const front = new Uint8Array(w * h * 4);
  const back = new Uint8Array(w * h * 4);

  scene.overrideMaterial = frontMaterial;
  renderer.setRenderTarget(target);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(target, 0, 0, w, h, front);

  scene.overrideMaterial = backMaterial;
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(target, 0, 0, w, h, back);

  const out = new Float32Array(w * h);
  const range = camera.far - camera.near;
  for (let i = 0; i < out.length; i++) {
    const j = i * 4;
    const a = unpackDepth(front, j);
    const z = unpackDepth(back, j);
    if (a >= 0.9999 || z >= 0.9999) continue;
    const cm = Math.abs(z - a) * range * 100;
    if (cm > 0.002 && cm < 12) out[i] = cm;
  }
  return out;
}

function blur(src: Float32Array, w: number, h: number, centreWeight = 8) {
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let weights = 0;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx++) {
          const wt = xx === x && yy === y ? centreWeight : xx === x || yy === y ? 1 : 0.35;
          sum += src[yy * w + xx]! * wt;
          weights += wt;
        }
      }
      out[y * w + x] = sum / weights;
    }
  }
  return out;
}

export async function wholeBodyAtlasOpticalDensity(args: {
  patient: Patient;
  projection: Projection;
  tube: TubeState;
  exposureKvp: number;
  width: number;
  height: number;
  geometry: ProjectionGeometry;
}): Promise<Float32Array | null> {
  if (typeof document === "undefined" || typeof window === "undefined") return null;
  const { patient, tube, exposureKvp, width, height, geometry } = args;

  try {
    const atlas = await loadNativeAtlas();
    atlas.root.position.set(0, 0, 0);
    atlas.root.rotation.set(0, 0, 0);
    atlas.root.scale.setScalar(patient.heightCm / 100 / ATLAS_HEIGHT_M);
    for (const p of atlas.parts) {
      p.mesh.visible = true;
      p.mesh.quaternion.identity();
    }
    atlas.root.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(atlas.root);
    const centre = bounds.getCenter(new THREE.Vector3());
    centre.x = 0;
    const rw = Math.min(640, Math.max(320, width));
    const rh = Math.min(1152, Math.max(512, height));
    const camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.01, 5);
    camera.left = -tube.collimationW / geometry.magnification / 200;
    camera.right = tube.collimationW / geometry.magnification / 200;
    camera.top = tube.collimationH / geometry.magnification / 200;
    camera.bottom = -tube.collimationH / geometry.magnification / 200;
    camera.position.set(centre.x, centre.y, centre.z + 2.5);
    camera.lookAt(centre);
    camera.updateProjectionMatrix();

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: false });
    renderer.setSize(rw, rh, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setClearColor(0xffffff, 1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    scene.add(atlas.root);
    const target = new THREE.WebGLRenderTarget(rw, rh, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    });

    const vertexShader = `varying float vDepth;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;vDepth=gl_Position.z/gl_Position.w*.5+.5;}`;
    const fragmentShader = `varying float vDepth;vec3 packDepth24(float v){v=clamp(v,0.0,0.999999);vec3 enc=fract(v*vec3(1.0,255.0,65025.0));enc-=enc.yzz*vec3(1.0/255.0,1.0/255.0,0.0);return enc;}void main(){gl_FragColor=vec4(packDepth24(vDepth),1.0);}`;
    const frontMaterial = new THREE.ShaderMaterial({ vertexShader, fragmentShader, side: THREE.FrontSide, depthTest: true, depthWrite: true });
    const backMaterial = new THREE.ShaderMaterial({ vertexShader, fragmentShader, side: THREE.BackSide, depthTest: true, depthWrite: true });

    const opticalDensity = new Float32Array(rw * rh);

    for (const part of atlas.parts) {
      if (part.region === "other") continue;
      const rawThickness = projectThickness(scene, atlas.root, atlas.parts, part, camera, renderer, target, frontMaterial, backMaterial, rw, rh);
      const smoothThickness = blur(rawThickness, rw, rh, 10);
      const p = profile(part.region);
      const muCort = mu(p.cortHU, exposureKvp);
      const muTrab = mu(p.trabHU, exposureKvp);
      const muMarrow = mu(p.marrowHU, exposureKvp);
      const longBone = isLongBone(part.region);

      for (let i = 0; i < opticalDensity.length; i++) {
        const raw = rawThickness[i]!;
        if (raw <= 0) continue;
        const projected = Math.min(p.cap, raw * 0.74 + smoothThickness[i]! * 0.26);

        // Treat every ray through a bone as a material path rather than an edge mask.
        // Two cortices are traversed in projection; the remaining depth is trabecular or marrow.
        const shellPath = Math.min(projected, p.shell * 2 * (0.88 + 0.12 * clamp01(projected / Math.max(0.05, p.cap))));
        let cancellousPath = Math.max(0, projected - shellPath);
        let marrowPath = 0;

        if (longBone && cancellousPath > 0) {
          const canalStrength = clamp01((projected - 0.17) / 0.46);
          marrowPath = cancellousPath * (0.18 + 0.42 * canalStrength);
          cancellousPath -= marrowPath;
        } else if ((part.region === "hand" || part.region === "foot") && cancellousPath > 0) {
          marrowPath = cancellousPath * 0.12;
          cancellousPath -= marrowPath;
        }

        let regionGain = p.gain;
        if (part.region === "rib") regionGain *= 0.90;
        if (part.region === "axial") regionGain *= 0.92;

        const value = (shellPath * muCort + cancellousPath * muTrab + marrowPath * muMarrow) * regionGain;
        opticalDensity[i] += value;
      }
    }

    for (const p of atlas.parts) p.mesh.visible = true;

    // A small detector-space point-spread blend removes mesh/voxel jaggies without creating hollow outlines.
    const softened = blur(opticalDensity, rw, rh, 14);
    for (let i = 0; i < opticalDensity.length; i++) {
      opticalDensity[i] = Math.max(0, opticalDensity[i]! * 0.84 + softened[i]! * 0.16);
    }

    scene.overrideMaterial = null;
    renderer.dispose();
    target.dispose();
    frontMaterial.dispose();
    backMaterial.dispose();

    const full = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      const sy = (1 - y / Math.max(1, height - 1)) * (rh - 1);
      const y0 = Math.floor(sy);
      const y1 = Math.min(rh - 1, y0 + 1);
      const fy = sy - y0;
      for (let x = 0; x < width; x++) {
        const sx = (x / Math.max(1, width - 1)) * (rw - 1);
        const x0 = Math.floor(sx);
        const x1 = Math.min(rw - 1, x0 + 1);
        const fx = sx - x0;
        const a = opticalDensity[y0 * rw + x0]!;
        const b = opticalDensity[y0 * rw + x1]!;
        const c = opticalDensity[y1 * rw + x0]!;
        const d = opticalDensity[y1 * rw + x1]!;
        full[y * width + x] = Math.min(0.18, a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy);
      }
    }
    return full;
  } catch (err) {
    console.warn("[Bucky Lab] Whole-body atlas projection failed", err);
    return null;
  }
}
