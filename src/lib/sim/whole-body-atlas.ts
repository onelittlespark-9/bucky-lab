import * as THREE from "three";
import type { Patient, Projection, TubeState } from "./types";
import type { ProjectionGeometry } from "./projection-physics";

const MODEL_ROOT = "/models/human-atlas/";
const ATLAS_HEIGHT_M = 1.7;

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
  region: string;
}
interface NativeAtlas {
  root: THREE.Group;
  parts: LoadedPart[];
}

let cache: Promise<NativeAtlas> | null = null;

function regionFor(name: string) {
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
  if (n.includes("pelvis") || n.includes("ilium") || n.includes("ischium") || n.includes("pubis") || n.includes("sacrum") || n.includes("hip bone") || n.includes("coxal") || n.includes("innominate") || n.includes("acetabul") || n.includes("os cox")) return "pelvis";
  if (n.includes("vertebra") || n.includes("spine") || n.includes("sternum") || n.includes("coccyx")) return "axial";
  if (n.includes("skull") || n.includes("mandible") || n.includes("maxilla") || n.includes("zygomatic") || n.includes("temporal") || n.includes("frontal") || n.includes("parietal")) return "skull";
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
  const a = 0.0003 * e;
  const w = 0.205 * e;
  const b = 0.72 * e;
  if (hu <= -1000) return a;
  if (hu <= 0) return w + (hu / 1000) * (w - a);
  if (hu <= 1000) return w + (hu / 1000) * (b - w);
  return b + Math.min(1000, hu - 1000) * 0.00018 * e;
}

function material(r: string) {
  if (r === "skull") return { trab: 175, cort: 660, gain: 0.19, cap: 0.88, shell: 0.055 };
  if (r === "pelvis") return { trab: 140, cort: 620, gain: 0.19, cap: 0.82, shell: 0.052 };
  if (r === "axial") return { trab: 108, cort: 535, gain: 0.145, cap: 0.54, shell: 0.039 };
  if (r === "rib") return { trab: 66, cort: 385, gain: 0.142, cap: 0.29, shell: 0.032 };
  if (r === "clavicle" || r === "scapula") return { trab: 100, cort: 485, gain: 0.16, cap: 0.43, shell: 0.041 };
  if (r === "femur" || r === "lowerleg") return { trab: 112, cort: 700, gain: 0.19, cap: 0.72, shell: 0.062 };
  if (r === "humerus" || r === "forearm") return { trab: 108, cort: 670, gain: 0.185, cap: 0.66, shell: 0.058 };
  if (r === "patella") return { trab: 115, cort: 570, gain: 0.17, cap: 0.46, shell: 0.047 };
  if (r === "hand" || r === "foot") return { trab: 92, cort: 555, gain: 0.175, cap: 0.46, shell: 0.043 };
  return { trab: 112, cort: 585, gain: 0.175, cap: 0.53, shell: 0.047 };
}

function isLongBone(r: string) {
  return r === "femur" || r === "lowerleg" || r === "humerus" || r === "forearm";
}
function isShellBone(r: string) {
  return r === "skull" || r === "pelvis" || r === "rib" || r === "scapula" || r === "clavicle";
}
function isSmallBone(r: string) {
  return r === "hand" || r === "foot" || r === "patella";
}

function unpack(b: Uint8Array, j: number) {
  return b[j]! / 255 + b[j + 1]! / 65025 + b[j + 2]! / 16581375;
}

function thickness(
  scene: THREE.Scene,
  root: THREE.Group,
  all: LoadedPart[],
  part: LoadedPart,
  camera: THREE.OrthographicCamera,
  renderer: THREE.WebGLRenderer,
  target: THREE.WebGLRenderTarget,
  fm: THREE.ShaderMaterial,
  bm: THREE.ShaderMaterial,
  w: number,
  h: number,
) {
  for (const p of all) p.mesh.visible = p === part;
  root.updateMatrixWorld(true);
  const f = new Uint8Array(w * h * 4);
  const b = new Uint8Array(w * h * 4);
  scene.overrideMaterial = fm;
  renderer.setRenderTarget(target);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(target, 0, 0, w, h, f);
  scene.overrideMaterial = bm;
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(target, 0, 0, w, h, b);
  const out = new Float32Array(w * h);
  const range = camera.far - camera.near;
  for (let i = 0; i < out.length; i++) {
    const j = i * 4;
    const a = unpack(f, j);
    const z = unpack(b, j);
    if (a >= 0.9999 || z >= 0.9999 || z <= a) continue;
    const cm = (z - a) * range * 100;
    if (cm > 0 && cm < 12) out[i] = cm;
  }
  return out;
}

function blur(src: Float32Array, w: number, h: number) {
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx++) {
          const wt = xx === x && yy === y ? 12 : xx === x || yy === y ? 1 : 0.25;
          s += src[yy * w + xx]! * wt;
          n += wt;
        }
      }
      out[y * w + x] = s / n;
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
    const vs = `varying float vDepth;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;vDepth=gl_Position.z/gl_Position.w*.5+.5;}`;
    const fs = `varying float vDepth;vec3 packDepth24(float v){v=clamp(v,0.0,0.999999);vec3 enc=fract(v*vec3(1.0,255.0,65025.0));enc-=enc.yzz*vec3(1.0/255.0,1.0/255.0,0.0);return enc;}void main(){gl_FragColor=vec4(packDepth24(vDepth),1.0);}`;
    const fm = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, side: THREE.FrontSide, depthTest: true, depthWrite: true });
    const bm = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, side: THREE.BackSide, depthTest: true, depthWrite: true });
    const low = new Float32Array(rw * rh);
    const detail = new Float32Array(rw * rh);

    for (const part of atlas.parts) {
      if (part.region === "other") continue;
      const tmap = thickness(scene, atlas.root, atlas.parts, part, camera, renderer, target, fm, bm, rw, rh);
      const m = material(part.region);
      const mt = mu(m.trab, exposureKvp);
      const mc = mu(m.cort, exposureKvp);
      const longBone = isLongBone(part.region);
      const shellBone = isShellBone(part.region);
      const smallBone = isSmallBone(part.region);

      for (let y = 0; y < rh; y++) {
        for (let x = 0; x < rw; x++) {
          const i = y * rw + x;
          const raw = tmap[i]!;
          if (raw <= 0) continue;
          const t = Math.min(raw, m.cap);
          const l = x > 0 ? tmap[i - 1]! : 0;
          const r = x < rw - 1 ? tmap[i + 1]! : 0;
          const u = y > 0 ? tmap[i - rw]! : 0;
          const d = y < rh - 1 ? tmap[i + rw]! : 0;
          const boundary = l <= 0 || r <= 0 || u <= 0 || d <= 0;
          const minNeighbour = Math.min(l || t, r || t, u || t, d || t);
          const localGradient = Math.max(Math.abs(t - l), Math.abs(t - r), Math.abs(t - u), Math.abs(t - d)) / Math.max(0.03, t);
          const shell = Math.min(m.shell, Math.max(0.014, t * 0.095));
          const baseCort = Math.min(t, shell * 2);
          const baseTrab = Math.max(0, t - baseCort);
          let cort = baseCort;
          let trab = baseTrab;

          if (longBone) {
            const deepInterior = boundary ? 0 : Math.min(1, Math.max(0, (minNeighbour - 0.09) / 0.24));
            const thickInterior = Math.min(1, Math.max(0, (t - 0.12) / 0.34));
            const canal = deepInterior * thickInterior;
            trab *= 1 - 0.88 * canal;
            cort *= boundary ? 1.42 : 0.58 + (1 - canal) * 0.36;
            if (!boundary && canal > 0.15) {
              const marrow = mu(-45, exposureKvp) * Math.min(t * 0.38, 0.16) * m.gain;
              detail[i] -= marrow * canal * 0.32;
            }
          } else if (shellBone) {
            const shellLimit = shell * (part.region === "skull" ? 2.45 : part.region === "rib" ? 1.7 : 3.0);
            trab = Math.min(trab, shellLimit);
            cort *= boundary ? 1.16 : 0.78 + Math.min(0.24, localGradient * 0.16);
            if (part.region === "rib") {
              trab *= 0.66 + Math.min(0.22, localGradient * 0.18);
              cort *= 0.84 + Math.min(0.16, localGradient * 0.12);
            }
          } else if (part.region === "axial") {
            const centreStrength = boundary ? 0 : Math.min(1, Math.max(0, (minNeighbour - 0.045) / 0.16));
            trab *= 0.72 - centreStrength * 0.18;
            cort *= boundary ? 1.18 : 0.78 + Math.min(0.20, localGradient * 0.14);
          } else if (smallBone) {
            trab *= 0.84;
            cort *= boundary ? 1.28 : 0.88 + Math.min(0.20, localGradient * 0.16);
          }

          const corticalFraction = cort / Math.max(0.001, t);
          const corticalBoost = 0.86 + corticalFraction * 0.18;
          const value = (cort * mc * corticalBoost + trab * mt) * m.gain;
          low[i] += value;
          if (smallBone || part.region === "skull" || longBone) detail[i] += value * (smallBone ? 0.32 : longBone ? 0.16 : 0.12);
        }
      }
    }

    for (const p of atlas.parts) p.mesh.visible = true;
    const softened = blur(low, rw, rh);
    for (let i = 0; i < softened.length; i++) {
      const edgeDetail = Math.max(-0.035, Math.min(0.035, detail[i]!));
      softened[i] = Math.max(0, low[i]! * 0.48 + softened[i]! * 0.52 + edgeDetail);
    }

    scene.overrideMaterial = null;
    renderer.dispose();
    target.dispose();
    fm.dispose();
    bm.dispose();

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
        const a = softened[y0 * rw + x0]!;
        const b = softened[y0 * rw + x1]!;
        const c = softened[y1 * rw + x0]!;
        const d = softened[y1 * rw + x1]!;
        full[y * width + x] = Math.min(0.205, a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy);
      }
    }
    return full;
  } catch (err) {
    console.warn("[Bucky Lab] Whole-body atlas projection failed", err);
    return null;
  }
}
