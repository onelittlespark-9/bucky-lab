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

interface AtlasManifest {
  parts: AtlasPart[];
  chunks: { url: string; bytes: number }[];
}

interface LoadedPart {
  mesh: THREE.Mesh;
  system: string;
  name: string;
}

interface TissueAtlas {
  root: THREE.Group;
  parts: LoadedPart[];
}

let cache: Promise<TissueAtlas> | null = null;

async function loadAtlas(): Promise<TissueAtlas> {
  if (cache) return cache;
  cache = (async () => {
    const response = await fetch(`${MODEL_ROOT}atlas.json`, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Whole-body tissue atlas manifest failed (${response.status}).`);
    const atlas = (await response.json()) as AtlasManifest;
    const selected = atlas.parts.filter((p) => SYSTEMS.has(p.system));
    const chunks = new Map<number, ArrayBuffer>();

    await Promise.all(
      [...new Set(selected.map((p) => p.chunk))].map(async (i) => {
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
    for (const part of selected) {
      const buffer = chunks.get(part.chunk);
      if (!buffer) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(buffer, part.positions, part.vertexCount * 3), 3),
      );
      g.setAttribute(
        "normal",
        new THREE.BufferAttribute(new Int16Array(buffer, part.normals, part.vertexCount * 3), 3, true),
      );
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
  fm: THREE.ShaderMaterial,
  bm: THREE.ShaderMaterial,
  w: number,
  h: number,
) {
  for (const p of parts) p.mesh.visible = visible(p);
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
    const a = unpackDepth(f, j);
    const z = unpackDepth(b, j);
    if (a >= 0.9999 || z >= 0.9999) continue;
    const cm = Math.abs(z - a) * range * 100;
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
  mat: THREE.MeshBasicMaterial,
  w: number,
  h: number,
) {
  for (const p of parts) p.mesh.visible = visible(p);
  root.updateMatrixWorld(true);
  const px = new Uint8Array(w * h * 4);
  scene.overrideMaterial = mat;
  renderer.setRenderTarget(target);
  renderer.setClearColor(0xffffff, 1);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(target, 0, 0, w, h, px);
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = px[i * 4]! < 245 ? 1 : 0;
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
  fm: THREE.ShaderMaterial,
  bm: THREE.ShaderMaterial,
  w: number,
  h: number,
  perPartCap: number,
  totalCap: number,
) {
  const selected = parts.filter(test);
  const sum = new Float32Array(w * h);
  for (const part of selected) {
    const t = projectVisible(scene, root, parts, (p) => p === part, camera, renderer, target, fm, bm, w, h);
    for (let i = 0; i < sum.length; i++) {
      sum[i] = Math.min(totalCap, sum[i]! + Math.min(perPartCap, t[i]!));
    }
  }
  return sum;
}

function blurMap(src: Float32Array, w: number, h: number, passes = 1) {
  let current = src;
  for (let pass = 0; pass < passes; pass++) {
    const tmp = new Float32Array(src.length);
    const out = new Float32Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        let n = 0;
        for (let d = -1; d <= 1; d++) {
          const xx = Math.max(0, Math.min(w - 1, x + d));
          const wt = d === 0 ? 2 : 1;
          s += current[y * w + xx]! * wt;
          n += wt;
        }
        tmp[y * w + x] = s / n;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        let n = 0;
        for (let d = -1; d <= 1; d++) {
          const yy = Math.max(0, Math.min(h - 1, y + d));
          const wt = d === 0 ? 2 : 1;
          s += tmp[yy * w + x]! * wt;
          n += wt;
        }
        out[y * w + x] = s / n;
      }
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

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function sampleBilinear(src: Float32Array, sw: number, sh: number, x: number, y: number) {
  const x0 = Math.floor(x);
  const x1 = Math.min(sw - 1, x0 + 1);
  const y0 = Math.floor(y);
  const y1 = Math.min(sh - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const a = src[y0 * sw + x0]!;
  const b = src[y0 * sw + x1]!;
  const c = src[y1 * sw + x0]!;
  const d = src[y1 * sw + x1]!;
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
    atlas.root.scale.setScalar(patient.heightCm / 100 / ATLAS_HEIGHT_M);
    for (const p of atlas.parts) {
      p.mesh.visible = true;
      p.mesh.quaternion.identity();
    }
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
    const maskMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, depthTest: true, depthWrite: true });

    const skin = projectVisible(scene, atlas.root, atlas.parts, (p) => p.system === "integumentary", camera, renderer, target, fm, bm, rw, rh);
    const skinSoft = blurMap(skin, rw, rh, 7);
    const skinMaskRaw = projectCoverage(scene, atlas.root, atlas.parts, (p) => p.system === "integumentary", camera, renderer, target, maskMaterial, rw, rh);
    const skinMask = blurMap(skinMaskRaw, rw, rh, 11);
    const muscleRaw = projectVisible(scene, atlas.root, atlas.parts, (p) => p.system === "muscular", camera, renderer, target, fm, bm, rw, rh);
    const lungParts = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "respiratory" && /lung/i.test(p.name), camera, renderer, target, fm, bm, rw, rh, 20, 38);
    const respiratoryUnion = projectVisible(scene, atlas.root, atlas.parts, (p) => p.system === "respiratory", camera, renderer, target, fm, bm, rw, rh);
    const respiratoryMaskRaw = projectCoverage(scene, atlas.root, atlas.parts, (p) => p.system === "respiratory" && /lung/i.test(p.name), camera, renderer, target, maskMaterial, rw, rh);
    const respiratoryFallbackMask = projectCoverage(scene, atlas.root, atlas.parts, (p) => p.system === "respiratory", camera, renderer, target, maskMaterial, rw, rh);
    const respiratoryMask = blurMap(maxValue(respiratoryMaskRaw) > 0 ? respiratoryMaskRaw : respiratoryFallbackMask, rw, rh, 5);
    const heartRaw = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "cardiac", camera, renderer, target, fm, bm, rw, rh, 10, 14);
    const centralVesselsRaw = projectParts(scene, atlas.root, atlas.parts, (p) => (p.system === "arterial" || p.system === "venous") && /(pulmonary|aorta|aortic|vena cava|caval|brachiocephalic|subclavian|carotid)/i.test(p.name), camera, renderer, target, fm, bm, rw, rh, 2.4, 8.5);
    const allVesselsRaw = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "arterial" || p.system === "venous", camera, renderer, target, fm, bm, rw, rh, 0.85, 5.5);
    const diaphragmRaw = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "muscular" && /diaphragm/i.test(p.name), camera, renderer, target, fm, bm, rw, rh, 2.4, 4.2);
    const digestiveRaw = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "digestive", camera, renderer, target, fm, bm, rw, rh, 8, 21);
    const urinaryRaw = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "urinary", camera, renderer, target, fm, bm, rw, rh, 7, 12);
    const liverRaw = projectParts(scene, atlas.root, atlas.parts, (p) => /liver|hepatic/i.test(p.name), camera, renderer, target, fm, bm, rw, rh, 12, 15);
    const spleenRaw = projectParts(scene, atlas.root, atlas.parts, (p) => /spleen|splenic/i.test(p.name), camera, renderer, target, fm, bm, rw, rh, 7, 8);
    const kidneysRaw = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "urinary" && /kidney|renal/i.test(p.name), camera, renderer, target, fm, bm, rw, rh, 7, 12);
    const brainRaw = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "nervous" && /brain|cerebr|encephal/i.test(p.name), camera, renderer, target, fm, bm, rw, rh, 14, 18);

    const heart = blurMap(heartRaw, rw, rh, 6);
    const centralVessels = blurMap(centralVesselsRaw, rw, rh, 5);
    const allVessels = blurMap(allVesselsRaw, rw, rh, 7);
    const diaphragm = blurMap(diaphragmRaw, rw, rh, 5);
    const digestive = blurMap(digestiveRaw, rw, rh, 5);
    const urinary = blurMap(urinaryRaw, rw, rh, 4);
    const liver = blurMap(liverRaw, rw, rh, 6);
    const spleen = blurMap(spleenRaw, rw, rh, 4);
    const kidneys = blurMap(kidneysRaw, rw, rh, 4);
    const brain = blurMap(brainRaw, rw, rh, 3);
    const lungProjectionSparse = maxValue(lungParts) < 0.8;

    const muSoft = linearAttenuation("soft", exposureKvp);
    const muFat = linearAttenuation("adipose", exposureKvp);
    const muLung = linearAttenuation("inflatedLung", exposureKvp);
    const muMuscle = linearAttenuation("muscle", exposureKvp);
    const muBlood = linearAttenuation("blood", exposureKvp);
    const muBrain = linearAttenuation("brain", exposureKvp);
    const spectrumScale = 0.7;
    const low = new Float32Array(rw * rh);

    for (let i = 0; i < low.length; i++) {
      const edgeTaper = Math.pow(clamp01((skinMask[i]! - 0.0015) / 0.982), 0.88);
      const bodyDepth = (skin[i]! * 0.4 + skinSoft[i]! * 0.6) * edgeTaper;
      const muscleDepth = Math.min(bodyDepth > 0 ? bodyDepth * 0.8 : 18, muscleRaw[i]! * edgeTaper);
      const body = bodyDepth > 0 ? bodyDepth : Math.min(32, muscleDepth * 1.16);
      if (body <= 0.02) continue;

      const inferredFat = Math.max(0, body - Math.min(body, muscleDepth));
      const fatPath = Math.min(body * 0.19, Math.max(body * 0.075, inferredFat * 0.34));
      const musclePath = Math.min(Math.max(0, body - fatPath), Math.max(body * 0.075, muscleDepth * 0.245));
      const internalCapacity = Math.max(0, body - fatPath - musclePath);

      const lungMask = clamp01((respiratoryMask[i]! - 0.025) / 0.86);
      const lungCore = Math.pow(lungMask, 0.72);
      const atlasLung = lungProjectionSparse ? respiratoryUnion[i]! * 0.82 : lungParts[i]!;
      const lungCandidate = Math.min(internalCapacity * 0.965, Math.max(atlasLung * 1.24, internalCapacity * (0.9 * lungCore)));

      const heartPath = Math.min(internalCapacity * 0.78, heart[i]! * 1.42);
      const centralVesselPath = Math.min(internalCapacity * 0.12, centralVessels[i]! * 0.4);
      const peripheralVesselPath = Math.min(internalCapacity * 0.018, allVessels[i]! * 0.018 * lungCore);
      const diaphragmPath = Math.min(internalCapacity * 0.23, diaphragm[i]! * 1.12);
      const mediastinalDisplacement = Math.min(
        lungCandidate,
        heartPath * 1.18 + centralVesselPath * 0.38 + peripheralVesselPath * 0.15 + diaphragmPath * 0.98,
      );
      const lungPath = Math.max(0, lungCandidate - mediastinalDisplacement);

      const brainPath = Math.min(Math.max(0, internalCapacity - lungPath), brain[i]! * 0.84);
      const availableAfterBrain = Math.max(0, internalCapacity - lungPath - brainPath);
      const bloodPath = Math.min(
        availableAfterBrain,
        heartPath + centralVesselPath * 0.72 + peripheralVesselPath * 0.4,
      );
      const availableAfterBlood = Math.max(0, availableAfterBrain - bloodPath);

      const liverPath = Math.min(availableAfterBlood * 0.8, liver[i]! * 0.66);
      const afterLiver = Math.max(0, availableAfterBlood - liverPath);
      const spleenPath = Math.min(afterLiver * 0.45, spleen[i]! * 0.3);
      const afterSpleen = Math.max(0, afterLiver - spleenPath);
      const kidneyPath = Math.min(afterSpleen * 0.5, kidneys[i]! * 0.33);
      const afterKidney = Math.max(0, afterSpleen - kidneyPath);
      const digestivePath = Math.min(afterKidney * 0.6, digestive[i]! * 0.23 + urinary[i]! * 0.09);
      const generalSoftPath = Math.max(0, afterKidney - digestivePath);

      const lungInterstitial = lungPath * 0.03;
      const aeratedLungPath = Math.max(0, lungPath - lungInterstitial);
      let od =
        fatPath * muFat +
        musclePath * muMuscle +
        generalSoftPath * muSoft +
        aeratedLungPath * muLung +
        lungInterstitial * muSoft +
        bloodPath * muBlood +
        brainPath * muBrain +
        liverPath * muSoft * 1.075 +
        spleenPath * muSoft * 1.05 +
        kidneyPath * muSoft * 1.055 +
        digestivePath * muSoft * 0.99;

      od += diaphragmPath * Math.max(0, muMuscle - muLung) * 0.48;
      od +=
        Math.min(lungPath, centralVesselPath * 0.28 + peripheralVesselPath * 0.12) *
        Math.max(0, muBlood - muLung) *
        0.18;
      low[i] = Math.max(0.0015, od * spectrumScale);
    }

    const coverageCount = respiratoryMaskRaw.reduce((a, v) => a + (v > 0 ? 1 : 0), 0);
    const lungField = blurMap(respiratoryMask, rw, rh, 2);
    const localBaseline = blurMap(low, rw, rh, 10);
    const heartMax = maxValue(heart);
    const vesselMax = maxValue(centralVessels);
    const diaphragmMax = maxValue(diaphragm);
    const liverMax = maxValue(liver);
    const digestiveMax = maxValue(digestive);
    const urinaryMax = maxValue(urinary);

    for (let i = 0; i < low.length; i++) {
      if (low[i]! <= 0.0015) continue;
      const lung = Math.pow(clamp01((lungField[i]! - 0.018) / 0.78), 0.82);
      const heartMask = heartMax > 0 ? clamp01(heart[i]! / heartMax) : 0;
      const vesselMask = vesselMax > 0 ? clamp01(centralVessels[i]! / vesselMax) : 0;
      const cardiomediastinum = clamp01(heartMask * 0.98 + vesselMask * 0.1);
      const dia = diaphragmMax > 0 ? clamp01(diaphragm[i]! / diaphragmMax) : 0;
      const liverMask = liverMax > 0 ? clamp01(liver[i]! / liverMax) : 0;
      const digestiveMask = digestiveMax > 0 ? clamp01(digestive[i]! / digestiveMax) : 0;
      const urinaryMask = urinaryMax > 0 ? clamp01(urinary[i]! / urinaryMax) : 0;
      const abdomen = clamp01(liverMask * 0.76 + digestiveMask * 0.32 + urinaryMask * 0.18);
      const baseline = Math.max(low[i]!, localBaseline[i]!);
      const aerated = lung * (1 - cardiomediastinum * 0.86) * (1 - dia * 0.72);
      low[i] = Math.max(
        0.0015,
        low[i]! -
          baseline * 0.28 * aerated +
          baseline * 0.28 * heartMask +
          baseline * 0.018 * vesselMask +
          baseline * 0.15 * dia +
          baseline * 0.1 * abdomen,
      );
    }

    if (lungProjectionSparse && coverageCount < rw * rh * 0.01) {
      console.warn("[Bucky Lab] Lung-specific atlas projection is sparse; respiratory fallback is active.");
    }

    const softened = blurMap(low, rw, rh, 2);
    for (let i = 0; i < low.length; i++) {
      const boundary = clamp01(1 - Math.abs(skinMask[i]! - 0.5) * 2);
      const blend = 0.07 + 0.16 * boundary;
      low[i] = low[i]! * (1 - blend) + softened[i]! * blend;
    }

    for (const p of atlas.parts) p.mesh.visible = true;
    scene.overrideMaterial = null;
    renderer.dispose();
    target.dispose();
    fm.dispose();
    bm.dispose();
    maskMaterial.dispose();

    const full = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      const sy = (1 - y / Math.max(1, height - 1)) * (rh - 1);
      for (let x = 0; x < width; x++) {
        const sx = (x / Math.max(1, width - 1)) * (rw - 1);
        full[y * width + x] = sampleBilinear(low, rw, rh, sx, sy);
      }
    }
    return full;
  } catch (err) {
    console.warn("[Bucky Lab] Whole-body tissue atlas projection failed", err);
    return null;
  }
}
