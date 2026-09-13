import * as THREE from "three";
import type { Patient, TubeState } from "./types";
import type { ProjectionGeometry } from "./projection-physics";

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
        if (!c) throw new Error(`Whole-body tissue atlas chunk ${i} missing.`);
        const r = await fetch(c.url, { cache: "force-cache" });
        if (!r.ok) throw new Error(`Whole-body tissue atlas chunk ${i} failed.`);
        const b = await r.arrayBuffer();
        if (b.byteLength !== c.bytes) throw new Error(`Whole-body tissue atlas chunk ${i} incomplete.`);
        chunks.set(i, b);
      }),
    );

    const root = new THREE.Group();
    const parts: LoadedPart[] = [];
    for (const part of selected) {
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
      parts.push({ mesh, system: part.system, name: part.name });
    }
    return { root, parts };
  })();
  return cache;
}

function unpack(b: Uint8Array, j: number) {
  return b[j]! / 255 + b[j + 1]! / 65025 + b[j + 2]! / 16581375;
}

function mu(hu: number, kvp: number) {
  const e = Math.pow(70 / Math.max(45, kvp), 0.28);
  const a = 0.0003 * e;
  const w = 0.205 * e;
  const b = 0.72 * e;
  if (hu <= -1000) return a;
  if (hu <= 0) return w + (hu / 1000) * (w - a);
  if (hu <= 1000) return w + (hu / 1000) * (b - w);
  return b;
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
  const front = new Uint8Array(w * h * 4);
  const back = new Uint8Array(w * h * 4);
  scene.overrideMaterial = fm;
  renderer.setRenderTarget(target);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(target, 0, 0, w, h, front);
  scene.overrideMaterial = bm;
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(target, 0, 0, w, h, back);
  const out = new Float32Array(w * h);
  const range = camera.far - camera.near;
  for (let i = 0; i < out.length; i++) {
    const j = i * 4;
    const a = unpack(front, j);
    const z = unpack(back, j);
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
    for (let i = 0; i < sum.length; i++) sum[i] = Math.min(totalCap, sum[i]! + Math.min(perPartCap, t[i]!));
  }
  return sum;
}

function maxValue(src: Float32Array) {
  let m = 0;
  for (let i = 0; i < src.length; i++) if (src[i]! > m) m = src[i]!;
  return m;
}

function blurMap(src: Float32Array, w: number, h: number) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let d = -1; d <= 1; d++) {
        const xx = Math.max(0, Math.min(w - 1, x + d));
        const wt = d === 0 ? 2 : 1;
        s += src[y * w + xx]! * wt;
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
  return out;
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
    const muscleRaw = projectVisible(scene, atlas.root, atlas.parts, (p) => p.system === "muscular", camera, renderer, target, fm, bm, rw, rh);
    const respiratoryUnion = projectVisible(scene, atlas.root, atlas.parts, (p) => p.system === "respiratory", camera, renderer, target, fm, bm, rw, rh);
    const respiratoryParts = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "respiratory", camera, renderer, target, fm, bm, rw, rh, 15, 31);
    const respiratoryMaskRaw = projectCoverage(scene, atlas.root, atlas.parts, (p) => p.system === "respiratory", camera, renderer, target, maskMaterial, rw, rh);
    const respiratoryMask = blurMap(blurMap(respiratoryMaskRaw, rw, rh), rw, rh);
    const lung = new Float32Array(rw * rh);
    for (let i = 0; i < lung.length; i++) lung[i] = Math.max(respiratoryUnion[i]!, respiratoryParts[i]!);

    const heart = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "cardiac", camera, renderer, target, fm, bm, rw, rh, 10, 12);
    const digestive = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "digestive", camera, renderer, target, fm, bm, rw, rh, 9, 22);
    const urinary = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "urinary", camera, renderer, target, fm, bm, rw, rh, 7, 12);
    const centralVessels = projectParts(
      scene,
      atlas.root,
      atlas.parts,
      (p) => (p.system === "arterial" || p.system === "venous") && /(pulmonary|aorta|aortic|vena cava|caval|brachiocephalic|subclavian)/i.test(p.name),
      camera,
      renderer,
      target,
      fm,
      bm,
      rw,
      rh,
      2.8,
      7.5,
    );
    const diaphragm = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "muscular" && /diaphragm/i.test(p.name), camera, renderer, target, fm, bm, rw, rh, 2.5, 4);
    const liver = projectParts(scene, atlas.root, atlas.parts, (p) => /liver|hepatic/i.test(p.name), camera, renderer, target, fm, bm, rw, rh, 12, 14);
    const spleen = projectParts(scene, atlas.root, atlas.parts, (p) => /spleen|splenic/i.test(p.name), camera, renderer, target, fm, bm, rw, rh, 7, 8);
    const kidneys = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "urinary" && /kidney|renal/i.test(p.name), camera, renderer, target, fm, bm, rw, rh, 7, 12);
    const brain = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "nervous" && /brain|cerebr|encephal/i.test(p.name), camera, renderer, target, fm, bm, rw, rh, 14, 18);

    const low = new Float32Array(rw * rh);
    const muSoft = mu(30, exposureKvp);
    const muLung = mu(-870, exposureKvp);
    const muOrgan = mu(62, exposureKvp);
    const muMuscle = mu(48, exposureKvp);
    const muBlood = mu(65, exposureKvp);
    const muBrain = mu(38, exposureKvp);
    const scale = 0.052;

    for (let i = 0; i < low.length; i++) {
      const skinDepth = skin[i]!;
      const muscle = Math.min(skinDepth > 0 ? skinDepth * 0.78 : 18, muscleRaw[i]!);
      const body = skinDepth > 0 ? skinDepth : Math.min(32, muscle * 1.15);
      if (body <= 0) continue;

      const baseline = Math.min(42, body) * muSoft * scale;
      const atlasLungDepth = Math.min(body * 0.9, lung[i]! * 1.35);
      const silhouetteLungDepth = Math.min(body * 0.82, body * 0.72 * respiratoryMask[i]!);
      const lungReplace = Math.max(atlasLungDepth, silhouetteLungDepth);
      const aeration = lungReplace * (muLung - muSoft) * scale * 1.18;
      const muscleMod = Math.min(body, muscle) * Math.max(0, muMuscle - muSoft) * 0.012;
      const heartDepth = Math.min(body * 0.58, heart[i]!);
      const vesselDepth = Math.min(body * 0.22, centralVessels[i]!);
      const diaphragmDepth = Math.min(body * 0.16, diaphragm[i]!);
      const heartOverlap = Math.min(lungReplace, heartDepth * 0.98);
      const vesselOverlap = Math.min(Math.max(0, lungReplace - heartOverlap), vesselDepth * 0.82);
      const diaphragmOverlap = Math.min(Math.max(0, lungReplace - heartOverlap - vesselOverlap), diaphragmDepth * 0.78);
      const heartRestore = heartOverlap * (muSoft - muLung) * scale * 1.04;
      const vesselRestore = vesselOverlap * (muSoft - muLung) * scale;
      const diaphragmRestore = diaphragmOverlap * (muSoft - muLung) * scale * 0.98;
      const heartDensity = heartDepth * Math.max(0, muOrgan - muSoft) * 0.074;
      const vesselDensity = vesselDepth * Math.max(0, muBlood - muSoft) * 0.085;
      const diaphragmDensity = diaphragmDepth * Math.max(0, muMuscle - muSoft) * 0.052;
      const digestAdd = Math.min(body, digestive[i]!) * Math.max(0, muOrgan - muSoft) * 0.022;
      const urinaryAdd = Math.min(body, urinary[i]!) * Math.max(0, muOrgan - muSoft) * 0.02;
      const liverAdd = Math.min(body * 0.68, liver[i]!) * Math.max(0, muOrgan - muSoft) * 0.067;
      const spleenAdd = Math.min(body * 0.38, spleen[i]!) * Math.max(0, muOrgan - muSoft) * 0.055;
      const kidneyAdd = Math.min(body * 0.32, kidneys[i]!) * Math.max(0, muOrgan - muSoft) * 0.05;
      const brainAdd = Math.min(body * 0.7, brain[i]!) * Math.max(0, muBrain - muSoft) * 0.035;

      low[i] = Math.max(
        0.0015,
        baseline +
          aeration +
          muscleMod +
          heartRestore +
          vesselRestore +
          diaphragmRestore +
          heartDensity +
          vesselDensity +
          diaphragmDensity +
          digestAdd +
          urinaryAdd +
          liverAdd +
          spleenAdd +
          kidneyAdd +
          brainAdd,
      );
    }

    const coverageCount = respiratoryMaskRaw.reduce((a, v) => a + (v > 0 ? 1 : 0), 0);
    if (maxValue(lung) < 0.8 && coverageCount < rw * rh * 0.01) {
      console.warn("[Bucky Lab] Respiratory atlas projection and silhouette are unexpectedly sparse; whole-body lung contrast may be degraded.");
    }

    const softened = blurMap(low, rw, rh);
    for (let i = 0; i < low.length; i++) low[i] = low[i] * 0.84 + softened[i]! * 0.16;

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
