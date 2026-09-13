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
    if (cm > 0.001 && cm < 55) out[i] = cm;
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
  renderer.clear(true, true,true);
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

function smoothstep(a: number, b: number, v: number) {
  const t = clamp01((v - a) / Math.max(1e-6, b - a));
  return t * t * (3 - 2 * t);
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
    const skinSoft = blurMap(skin, rw, rh, 6);
    const skinCoverageRaw = projectCoverage(scene, atlas.root, atlas.parts, (p) => p.system === "integumentary", camera, renderer, target, maskMaterial, rw, rh);
    const skinCoverage = blurMap(skinCoverageRaw, rw, rh, 6);
    const muscleRaw = projectVisible(scene, atlas.root, atlas.parts, (p) => p.system === "muscular", camera, renderer, target, fm, bm, rw, rh);

    const respiratoryMaskRaw = projectCoverage(
      scene,
      atlas.root,
      atlas.parts,
      (p) => p.system === "respiratory" && /lung/i.test(p.name),
      camera,
      renderer,
      target,
      maskMaterial,
      rw,
      rh,
    );
    const respiratoryFallbackMask = projectCoverage(scene, atlas.root, atlas.parts, (p) => p.system === "respiratory", camera, renderer, target, maskMaterial, rw, rh);
    const respiratoryMask = blurMap(maxValue(respiratoryMaskRaw) > 0 ? respiratoryMaskRaw : respiratoryFallbackMask, rw, rh, 4);

    const heartRaw = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "cardiac", camera, renderer, target, fm, bm, rw, rh, 10, 14);
    const heartCoverageRaw = projectCoverage(scene, atlas.root, atlas.parts, (p) => p.system === "cardiac", camera, renderer, target, maskMaterial, rw, rh);
    const centralVesselsRaw = projectParts(
      scene,
      atlas.root,
      atlas.parts,
      (p) => (p.system === "arterial" || p.system === "venous") && /(pulmonary|aorta|aortic|vena cava|caval)/i.test(p.name),
      camera,
      renderer,
      target,
      fm,
      bm,
      rw,
      rh,
      1.8,
      5.5,
    );
    const allVesselsRaw = projectParts(
      scene,
      atlas.root,
      atlas.parts,
      (p) => p.system === "arterial" || p.system === "venous",
      camera,
      renderer,
      target,
      fm,
      bm,
      rw,
      rh,
      0.45,
      2.5,
    );
    const diaphragmRaw = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "muscular" && /diaphragm/i.test(p.name), camera, renderer, target, fm, bm, rw, rh, 2.4, 4.2);
    const digestiveRaw = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "digestive", camera, renderer, target, fm, bm, rw, rh, 8, 21);
    const urinaryRaw = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "urinary", camera, renderer, target, fm, bm, rw, rh, 7, 12);
    const liverRaw = projectParts(scene, atlas.root, atlas.parts, (p) => /liver|hepatic/i.test(p.name), camera, renderer, target, fm, bm, rw, rh, 12, 15);
    const spleenRaw = projectParts(scene, atlas.root, atlas.parts, (p) => /spleen|splenic/i.test(p.name), camera, renderer, target, fm, bm, rw, rh, 7, 8);
    const kidneysRaw = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "urinary" && /kidney|renal/i.test(p.name), camera, renderer, target, fm, bm, rw, rh, 7, 12);
    const brainRaw = projectParts(scene, atlas.root, atlas.parts, (p) => p.system === "nervous" && /brain|cerebr|encephal/i.test(p.name), camera, renderer, target, fm, bm, rw, rh, 14, 18);

    const heart = blurMap(heartRaw, rw, rh, 7);
    const heartCoverage = blurMap(heartCoverageRaw, rw, rh, 5);
    const centralVessels = blurMap(centralVesselsRaw, rw, rh, 9);
    const allVessels = blurMap(allVesselsRaw, rw, rh, 12);
    const diaphragm = blurMap(diaphragmRaw, rw, rh, 6);
    const digestive = blurMap(digestiveRaw, rw, rh, 8);
    const urinary = blurMap(urinaryRaw, rw, rh, 7);
    const liver = blurMap(liverRaw, rw, rh, 8);
    const spleen = blurMap(spleenRaw, rw, rh, 7);
    const kidneys = blurMap(kidneysRaw, rw, rh, 7);
    const brain = blurMap(brainRaw, rw, rh, 4);

    const muSoft = linearAttenuation("soft", exposureKvp);
    const muFat = linearAttenuation("adipose", exposureKvp);
    const muLung = linearAttenuation("inflatedLung", exposureKvp);
    const muMuscle = linearAttenuation("muscle", exposureKvp);
    const muBlood = linearAttenuation("blood", exposureKvp);
    const muBrain = linearAttenuation("brain", exposureKvp);
    const spectrumScale = 0.70;
    const low = new Float32Array(rw * rh);
    const lungPixels = respiratoryMaskRaw.reduce((sum, value) => sum + (value > 0 ? 1 : 0), 0);
    const lungCoverageFraction = lungPixels / Math.max(1, rw * rh);
    const useEnvelopeFallback = lungCoverageFraction < 0.045;

    for (let i = 0; i < low.length; i++) {
      const x = i % rw;
      const y = Math.floor(i / rw);
      const xNorm = ((x + 0.5) / rw) * 2 - 1;
      const yNorm = ((y + 0.5) / rh) * 2 - 1;
      const boundaryTaper = Math.pow(smoothstep(0.045, 0.90, skinCoverage[i]!), 1.13);
      const mixedDepth = skin[i]! * 0.22 + skinSoft[i]! * 0.78;
      const tangentLimited = Math.min(mixedDepth, skinSoft[i]! * 1.08 + 0.028);
      const bodyDepth = Math.max(0, tangentLimited * boundaryTaper);
      const muscleDepth = Math.min(bodyDepth, muscleRaw[i]! * boundaryTaper);
      if (bodyDepth <= 0.002) continue;

      const inferredFat = Math.max(0, bodyDepth - muscleDepth);
      const fatPath = Math.min(bodyDepth * 0.20, Math.max(bodyDepth * 0.05, inferredFat * 0.34));
      const musclePath = Math.min(Math.max(0, bodyDepth - fatPath), Math.max(bodyDepth * 0.05, muscleDepth * 0.21));
      const internalCapacity = Math.max(0, bodyDepth - fatPath - musclePath);

      const atlasThoraxMask = clamp01((respiratoryMask[i]! - 0.015) / 0.60);
      const leftEnvelope = Math.exp(-Math.pow((xNorm + 0.17) / 0.155, 2) - Math.pow((yNorm - 0.34) / 0.285, 2));
      const rightEnvelope = Math.exp(-Math.pow((xNorm - 0.17) / 0.155, 2) - Math.pow((yNorm - 0.34) / 0.285, 2));
      const apicalTaper = smoothstep(0.04, 0.34, yNorm + 0.02);
      const basalTaper = 1 - smoothstep(0.58, 0.76, yNorm);
      const bodySupportedEnvelope = Math.max(leftEnvelope, rightEnvelope) * apicalTaper * basalTaper * smoothstep(0.12, 0.72, skinCoverage[i]!);
      const envelopeAssist = bodySupportedEnvelope * (useEnvelopeFallback ? 1.0 : 0.82);
      const thoraxMask = clamp01(Math.max(atlasThoraxMask, envelopeAssist));
      const bilateralGap = smoothstep(0.045, 0.145, Math.abs(xNorm));
      const lungSilhouette = thoraxMask * (0.035 + 0.965 * bilateralGap);
      const lungCore = Math.pow(clamp01(lungSilhouette), 0.58);
      const lungCandidate = Math.min(internalCapacity * 0.985, internalCapacity * 0.975 * lungCore);

      const heartShape = clamp01((heartCoverage[i]! - 0.03) / 0.66);
      const mediastinalCore = Math.exp(-Math.pow((xNorm + 0.012) / 0.115, 2)) * thoraxMask;
      const heartPath = Math.min(internalCapacity * 0.70, Math.max(heart[i]! * 1.18, internalCapacity * 0.50 * heartShape));
      const centralSoftPath = internalCapacity * 0.24 * mediastinalCore;
      const centralVesselPath = Math.min(internalCapacity * 0.032, centralVessels[i]! * 0.105);
      const peripheralVesselPath = Math.min(internalCapacity * 0.006, allVessels[i]! * 0.0042 * lungCore);
      const diaphragmPath = Math.min(internalCapacity * 0.25, diaphragm[i]! * 1.05);
      const mediastinalDisplacement = Math.min(
        lungCandidate,
        heartPath * 0.68 + centralSoftPath * 0.82 + centralVesselPath * 0.35 + diaphragmPath * 0.48,
      );
      const lungPath = Math.max(0, lungCandidate - mediastinalDisplacement);

      const brainPath = Math.min(Math.max(0, internalCapacity - lungPath), brain[i]! * 0.86);
      const afterBrain = Math.max(0, internalCapacity - lungPath - brainPath);
      const bloodPath = Math.min(afterBrain, heartPath * 0.82 + centralVesselPath * 0.42 + peripheralVesselPath * 0.20);
      const afterBlood = Math.max(0, afterBrain - bloodPath);

      const liverDemand = Math.min(afterBlood * 0.78, liver[i]! * 0.74);
      const spleenDemand = Math.min(afterBlood * 0.34, spleen[i]! * 0.38);
      const kidneyDemand = Math.min(afterBlood * 0.38, kidneys[i]! * 0.42);
      const digestiveDemand = Math.min(afterBlood * 0.48, digestive[i]! * 0.28 + urinary[i]! * 0.11);
      const organDemand = liverDemand + spleenDemand + kidneyDemand + digestiveDemand;
      const organScale = organDemand > 0 ? Math.min(1, afterBlood * 0.82 / organDemand) : 0;
      const liverPath = liverDemand * organScale;
      const spleenPath = spleenDemand * organScale;
      const kidneyPath = kidneyDemand * organScale;
      const digestivePath = digestiveDemand * organScale;
      const generalSoftPath = Math.max(0, afterBlood - liverPath - spleenPath - kidneyPath - digestivePath);

      const lungInterstitial = lungPath * 0.032;
      const aeratedLungPath = Math.max(0, lungPath - lungInterstitial);
      const od =
        fatPath * muFat +
        musclePath * muMuscle +
        generalSoftPath * muSoft +
        aeratedLungPath * muLung +
        lungInterstitial * muSoft +
        bloodPath * muBlood +
        brainPath * muBrain +
        liverPath * muSoft * 1.085 +
        spleenPath * muSoft * 1.055 +
        kidneyPath * muSoft * 1.06 +
        digestivePath * muSoft * 1.01 +
        diaphragmPath * Math.max(0, muMuscle - muLung) * 0.42 +
        Math.min(lungPath, centralVesselPath * 0.20 + peripheralVesselPath * 0.18) * Math.max(0, muBlood - muLung) * 0.12;

      low[i] = Math.max(0, od * spectrumScale);
    }

    if (useEnvelopeFallback) {
      console.warn(`[Bucky Lab] Lung-specific atlas coverage is sparse (${(lungCoverageFraction * 100).toFixed(1)}%); bounded bilateral lung envelope assist is active.`);
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
