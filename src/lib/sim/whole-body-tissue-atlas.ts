import * as THREE from "three";
import type { Patient, TubeState } from "./types";
import type { ProjectionGeometry } from "./projection-physics";
import { linearAttenuation } from "./nist-attenuation";

const MODEL_ROOT = "/models/human-atlas/";
const ATLAS_HEIGHT_M = 1.7;
const SYSTEMS = new Set([
  "integumentary",
  "muscular",
  "respiratory",
  "cardiac",
  "digestive",
  "urinary",
  "arterial",
  "venous",
  "lymphatic",
  "nervous",
]);

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
interface AtlasManifest { parts: AtlasPart[]; chunks: { url: string; bytes: number }[]; }
interface LoadedPart { mesh: THREE.Mesh; system: string; name: string; }
interface TissueAtlas { root: THREE.Group; parts: LoadedPart[]; }
let cache: Promise<TissueAtlas> | null = null;

async function loadAtlas(): Promise<TissueAtlas> {
  if (cache) return cache;
  cache = (async () => {
    const response = await fetch(`${MODEL_ROOT}atlas.json`, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Whole-body tissue atlas manifest failed (${response.status}).`);
    const atlas = (await response.json()) as AtlasManifest;
    const selected = atlas.parts.filter((p) => SYSTEMS.has(p.system));
    const chunks = new Map<number, ArrayBuffer>();
    await Promise.all([...new Set(selected.map((p) => p.chunk))].map(async (i) => {
      const c = atlas.chunks[i];
      if (!c) throw new Error(`Whole-body tissue atlas chunk ${i} missing.`);
      const r = await fetch(c.url, { cache: "force-cache" });
      if (!r.ok) throw new Error(`Whole-body tissue atlas chunk ${i} failed.`);
      const b = await r.arrayBuffer();
      if (b.byteLength !== c.bytes) throw new Error(`Whole-body tissue atlas chunk ${i} incomplete.`);
      chunks.set(i, b);
    }));
    const root = new THREE.Group();
    const parts: LoadedPart[] = [];
    for (const part of selected) {
      const buffer = chunks.get(part.chunk);
      if (!buffer) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(buffer, part.positions, part.vertexCount * 3), 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(new Int16Array(buffer, part.normals, part.vertexCount * 3), 3, true));
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer, part.indices, part.indexCount), 1));
      const centre = new THREE.Vector3(
        (part.bounds[0][0] + part.bounds[1][0]) * 0.5,
        (part.bounds[0][1] + part.bounds[1][1]) * 0.5,
        (part.bounds[0][2] + part.bounds[1][2]) * 0.5,
      );
      geometry.translate(-centre.x, -centre.y, -centre.z);
      const mesh = new THREE.Mesh(geometry);
      mesh.position.copy(centre);
      mesh.name = part.name;
      root.add(mesh);
      parts.push({ mesh, system: part.system, name: part.name });
    }
    return { root, parts };
  })();
  return cache;
}

function unpackDepth(buf: Uint8Array, j: number) {
  return buf[j]! / 255 + buf[j + 1]! / 65025 + buf[j + 2]! / 16581375;
}

function projectVisible(
  scene: THREE.Scene,
  root: THREE.Group,
  parts: LoadedPart[],
  visible: (p: LoadedPart) => boolean,
  camera: THREE.OrthographicCamera,
  renderer: THREE.WebGLRenderer,
  target: THREE.WebGLRenderTarget,
  frontMaterial: THREE.ShaderMaterial,
  backMaterial: THREE.ShaderMaterial,
  w: number,
  h: number,
) {
  for (const p of parts) p.mesh.visible = visible(p);
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
    const f = unpackDepth(front, j);
    const b = unpackDepth(back, j);
    if (f >= 0.9999 || b >= 0.9999) continue;
    const cm = Math.abs(b - f) * range * 100;
    if (cm > 0 && cm < 55) out[i] = cm;
  }
  return out;
}

function projectCoverage(
  scene: THREE.Scene,
  root: THREE.Group,
  parts: LoadedPart[],
  visible: (p: LoadedPart) => boolean,
  camera: THREE.OrthographicCamera,
  renderer: THREE.WebGLRenderer,
  target: THREE.WebGLRenderTarget,
  maskMaterial: THREE.MeshBasicMaterial,
  w: number,
  h: number,
) {
  for (const p of parts) p.mesh.visible = visible(p);
  root.updateMatrixWorld(true);
  const pixels = new Uint8Array(w * h * 4);
  scene.overrideMaterial = maskMaterial;
  renderer.setRenderTarget(target);
  renderer.setClearColor(0xffffff, 1);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(target, 0, 0, w, h, pixels);
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = pixels[i * 4]! < 245 ? 1 : 0;
  return out;
}

function projectParts(
  scene: THREE.Scene,
  root: THREE.Group,
  parts: LoadedPart[],
  test: (p: LoadedPart) => boolean,
  camera: THREE.OrthographicCamera,
  renderer: THREE.WebGLRenderer,
  target: THREE.WebGLRenderTarget,
  frontMaterial: THREE.ShaderMaterial,
  backMaterial: THREE.ShaderMaterial,
  w: number,
  h: number,
  perPartCap: number,
  totalCap: number,
) {
  const selected = parts.filter(test);
  const sum = new Float32Array(w * h);
  for (const part of selected) {
    const thickness = projectVisible(scene, root, parts, (p) => p === part, camera, renderer, target, frontMaterial, backMaterial, w, h);
    for (let i = 0; i < sum.length; i++) sum[i] = Math.min(totalCap, sum[i]! + Math.min(perPartCap, thickness[i]!));
  }
  return sum;
}

function blurMap(src: Float32Array, w: number, h: number, passes = 1) {
  let current = src;
  for (let pass = 0; pass < passes; pass++) {
    const tmp = new Float32Array(src.length);
    const out = new Float32Array(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let d = -1; d <= 1; d++) {
        const xx = Math.max(0, Math.min(w - 1, x + d));
        const wt = d === 0 ? 2 : 1;
        sum += current[y * w + xx]! * wt;
        n += wt;
      }
      tmp[y * w + x] = sum / n;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let d = -1; d <= 1; d++) {
        const yy = Math.max(0, Math.min(h - 1, y + d));
        const wt = d === 0 ? 2 : 1;
        sum += tmp[yy * w + x]! * wt;
        n += wt;
      }
      out[y * w + x] = sum / n;
    }
    current = out;
  }
  return current;
}

function maxValue(src: Float32Array) {
  let m = 0;
  for (let i = 0; i < src.length; i++) m = Math.max(m, src[i]!);
  return m;
}

function sampleBilinear(src: Float32Array, sw: number, sh: number, x: number, y: number) {
  const x0 = Math.floor(x), x1 = Math.min(sw - 1, x0 + 1);
  const y0 = Math.floor(y), y1 = Math.min(sh - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const a = src[y0 * sw + x0]!, b = src[y0 * sw + x1]!;
  const c = src[y1 * sw + x0]!, d = src[y1 * sw + x1]!;
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

export async function wholeBodyAtlasTissueOpticalDensity(args: {
  patient: Patient;
  tube: TubeState;
  exposureKvp: number;
  width: number;
  height: number;
  geometry: ProjectionGeometry;
}): Promise<Float32Array | null> {
  if (typeof document === "undefined" || typeof window === "undefined") return null;
  const { patient, tube, exposureKvp, width, height, geometry } = args;
  try {
    const atlas = await loadAtlas();
    atlas.root.position.set(0, 0, 0);
    atlas.root.rotation.set(0, 0, 0);
    atlas.root.scale.setScalar((patient.heightCm / 100) / ATLAS_HEIGHT_M);
    for (const p of atlas.parts) { p.mesh.visible = true; p.mesh.quaternion.identity(); }
    atlas.root.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(atlas.root);
    const centre = bounds.getCenter(new THREE.Vector3());
    centre.x = 0;
    const rw = Math.min(384, Math.max(192, width));
    const rh = Math.min(768, Math.max(384, height));
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
    const target = new THREE.WebGLRenderTarget(rw, rh, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false });
    const vertexShader = `varying float vDepth;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;vDepth=gl_Position.z/gl_Position.w*.5+.5;}`;
    const fragmentShader = `varying float vDepth;vec3 packDepth24(float v){v=clamp(v,0.0,0.999999);vec3 enc=fract(v*vec3(1.0,255.0,65025.0));enc-=enc.yzz*vec3(1.0/255.0,1.0/255.0,0.0);return enc;}void main(){gl_FragColor=vec4(packDepth24(vDepth),1.0);}`;
    const frontMaterial = new THREE.ShaderMaterial({ vertexShader, fragmentShader, side: THREE.FrontSide, depthTest: true, depthWrite: true });
    const backMaterial = new THREE.ShaderMaterial({ vertexShader, fragmentShader, side: THREE.BackSide, depthTest: true, depthWrite: true });
    const maskMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, depthTest: true, depthWrite: true });

    const skin = projectVisible(scene, atlas.root, atlas.parts, (p) => p.system === "integumentary", camera, renderer, target, frontMaterial, backMaterial, rw, rh);
    const skinSoft = blurMap(skin, rw, rh, 3);
    const muscleRaw = projectVisible(scene, atlas.root, atlas.parts, (p) => p.system === "muscular", camera, renderer, target, frontMaterial, backMaterial, rw, rh);
    const lungParts = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "respiratory" && /lung/i.test(p.name), camera, renderer, target, frontMaterial, backMaterial, rw, rh, 18, 34);
    const respiratoryUnion = projectVisible(scene, atlas.root, atlas.parts, (p) => p.system === "respiratory", camera, renderer, target, frontMaterial, backMaterial, rw, rh);
    const respiratoryMaskRaw = projectCoverage(scene, atlas.root, atlas.parts, (p) => p.system === "respiratory" && /lung/i.test(p.name), camera, renderer, target, maskMaterial, rw, rh);
    const respiratoryFallbackMask = projectCoverage(scene, atlas.root, atlas.parts, (p) => p.system === "respiratory", camera, renderer, target, maskMaterial, rw, rh);
    const respiratoryMask = blurMap(maxValue(respiratoryMaskRaw) > 0 ? respiratoryMaskRaw : respiratoryFallbackMask, rw, rh, 2);
    const heart = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "cardiac", camera, renderer, target, frontMaterial, backMaterial, rw, rh, 10, 14);
    const pulmonaryVessels = projectParts(scene, atlas.root, atlas.parts, (p) => (p.system === "arterial" || p.system === "venous") && /(pulmonary|aorta|aortic|vena cava|caval|brachiocephalic|subclavian|carotid)/i.test(p.name), camera, renderer, target, frontMaterial, backMaterial, rw, rh, 2.4, 8.5);
    const diaphragmRaw = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "muscular" && /diaphragm/i.test(p.name), camera, renderer, target, frontMaterial, backMaterial, rw, rh, 2.4, 4.2);
    const diaphragm = blurMap(diaphragmRaw, rw, rh, 2);
    const digestive = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "digestive", camera, renderer, target, frontMaterial, backMaterial, rw, rh, 8, 21);
    const urinary = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "urinary", camera, renderer, target, frontMaterial, backMaterial, rw, rh, 7, 12);
    const liver = projectParts(scene, atlas.root, atlas.parts, (p) => /liver|hepatic/i.test(p.name), camera, renderer, target, frontMaterial, backMaterial, rw, rh, 12, 15);
    const spleen = projectParts(scene, atlas.root, atlas.parts, (p) => /spleen|splenic/i.test(p.name), camera, renderer, target, frontMaterial, backMaterial, rw, rh, 7, 8);
    const kidneys = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "urinary" && /kidney|renal/i.test(p.name), camera, renderer, target, frontMaterial, backMaterial, rw, rh, 7, 12);
    const brain = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "nervous" && /brain|cerebr|encephal/i.test(p.name), camera, renderer, target, frontMaterial, backMaterial, rw, rh, 14, 18);

    const muSoft = linearAttenuation("soft", exposureKvp);
    const muFat = linearAttenuation("adipose", exposureKvp);
    const muLung = linearAttenuation("inflatedLung", exposureKvp);
    const muMuscle = linearAttenuation("muscle", exposureKvp);
    const muBlood = linearAttenuation("blood", exposureKvp);
    const muBrain = linearAttenuation("brain", exposureKvp);
    const spectrumScale = 0.72;
    const low = new Float32Array(rw * rh);

    for (let i = 0; i < low.length; i++) {
      const skinDepth = skin[i]!;
      const bodyDepth = skinDepth * 0.66 + skinSoft[i]! * 0.34;
      const muscleDepth = Math.min(bodyDepth > 0 ? bodyDepth * 0.78 : 18, muscleRaw[i]!);
      const body = bodyDepth > 0 ? bodyDepth : Math.min(32, muscleDepth * 1.18);
      if (body <= 0) continue;

      const inferredFat = Math.max(0, body - Math.min(body, muscleDepth));
      const fatPath = Math.min(body * 0.18, Math.max(body * 0.075, inferredFat * 0.34));
      const musclePath = Math.min(Math.max(0, body - fatPath), Math.max(body * 0.10, muscleDepth * 0.32));
      const internalCapacity = Math.max(0, body - fatPath - musclePath);
      const atlasLungDepth = Math.min(internalCapacity * 0.84, Math.max(lungParts[i]!, respiratoryUnion[i]! * 0.72) * 1.08);
      const silhouetteLungDepth = Math.min(internalCapacity * 0.78, internalCapacity * 0.72 * respiratoryMask[i]!);
      const requestedLung = Math.max(atlasLungDepth, silhouetteLungDepth);
      const heartDepth = Math.min(internalCapacity * 0.62, heart[i]!);
      const vesselDepth = Math.min(internalCapacity * 0.24, pulmonaryVessels[i]!);
      const diaphragmDepth = Math.min(internalCapacity * 0.14, diaphragm[i]!);
      const mediastinalOccupancy = Math.min(requestedLung, heartDepth * 0.86 + vesselDepth * 0.78 + diaphragmDepth * 0.38);
      const lungPath = Math.max(0, requestedLung - mediastinalOccupancy);
      const organDepth = Math.min(internalCapacity * 0.62, digestive[i]! * 0.28 + urinary[i]! * 0.16 + liver[i]! * 0.54 + spleen[i]! * 0.24 + kidneys[i]! * 0.30);
      const brainPath = Math.min(internalCapacity * 0.78, brain[i]! * 0.72);
      const bloodPath = Math.min(Math.max(0, internalCapacity - lungPath), heartDepth * 0.82 + vesselDepth * 0.92);
      const organPath = Math.min(Math.max(0, internalCapacity - lungPath - bloodPath - brainPath), organDepth);
      const generalSoftPath = Math.max(0, internalCapacity - lungPath - bloodPath - brainPath - organPath);
      const lungInterstitial = lungPath * 0.11;
      const aeratedLungPath = lungPath - lungInterstitial;

      let od = fatPath * muFat
        + musclePath * muMuscle
        + generalSoftPath * muSoft
        + aeratedLungPath * muLung
        + lungInterstitial * muSoft
        + bloodPath * muBlood
        + brainPath * muBrain
        + organPath * muSoft * 1.045;
      od += diaphragmDepth * Math.max(0, muMuscle - muSoft) * 0.65;
      od += Math.min(lungPath, vesselDepth * 0.72) * Math.max(0, muBlood - muLung) * 0.24;
      low[i] = Math.max(0.002, od * spectrumScale);
    }

    const coverageCount = respiratoryMaskRaw.reduce((a, v) => a + (v > 0 ? 1 : 0), 0);
    if (maxValue(lungParts) < 0.8 && coverageCount < rw * rh * 0.01) console.warn("[Bucky Lab] Lung-specific atlas projection is sparse; respiratory fallback is active.");
    const softened = blurMap(low, rw, rh, 1);
    for (let i = 0; i < low.length; i++) low[i] = low[i]! * 0.77 + softened[i]! * 0.23;

    for (const p of atlas.parts) p.mesh.visible = true;
    scene.overrideMaterial = null;
    renderer.dispose();
    target.dispose();
    frontMaterial.dispose();
    backMaterial.dispose();
    maskMaterial.dispose();

    const full = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      const sy = (1 - y / Math.max(1, height - 1)) * (rh - 1);
      for (let x = 0; x < width; x++) {
        const sx = x / Math.max(1, width - 1) * (rw - 1);
        full[y * width + x] = sampleBilinear(low, rw, rh, sx, sy);
      }
    }
    return full;
  } catch (err) {
    console.warn("[Bucky Lab] Whole-body tissue atlas projection failed", err);
    return null;
  }
}
