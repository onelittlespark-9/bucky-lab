import { create } from "zustand";
import type {
  Breath,
  ExposureState,
  FocalSpot,
  Marker,
  Mode,
  RadiographResult,
  Recumbency,
  Screen,
  SimPose,
  TubeState,
} from "./types";
import { patientById, PATIENTS } from "./patients";
import { projectionById, PROJECTIONS, scaleLandmarkY } from "./projections";
import { predictEI, suggestedTechnique } from "./exposure";
import { renderRadiograph, preloadRadiographAssets } from "./render-radiograph";

preloadRadiographAssets(PROJECTIONS);

export interface SimStore {
  screen: Screen;
  mode: Mode;
  patientId: string;
  projectionId: string;
  pose: SimPose;
  tube: TubeState;
  exposure: ExposureState;
  showLandmarks: boolean;
  showLightField: boolean;
  preparing: boolean;
  exposing: boolean;
  result: RadiographResult | null;
  error: string | null;
  setScreen: (s: Screen) => void;
  setMode: (m: Mode) => void;
  setPatient: (id: string) => void;
  setProjection: (id: string) => void;
  startExam: (projectionId: string, patientId?: string) => void;
  patchPose: (p: Partial<SimPose>) => void;
  patchTube: (t: Partial<TubeState>) => void;
  patchExposure: (e: Partial<ExposureState>) => void;
  applyHandbook: () => void;
  applySuggestedFactors: () => void;
  setLandmarkCR: (landmarkY: number, landmarkX: number) => void;
  predictedEI: () => number;
  prepare: () => void;
  expose: () => Promise<void>;
  retake: () => void;
}

function presentedPose(projectionId: string): SimPose {
  const p = projectionById(projectionId);
  return {
    recumbency: p.setup === "wall" ? "erect" : "supine",
    rotationY: 0,
    oblique: 0,
    chinUp: 0.15,
    shoulderRoll: 0.1,
    armRaise: 0,
    elbowFlex: 8,
    kneeFlex: 0,
    hipInternal: 0,
    breath: "expiration",
  };
}

function presentedTube(projectionId: string, patientId: string, mode: Mode): TubeState {
  const p = projectionById(projectionId);
  const patient = patientById(patientId);
  const jitter = (span: number) => (Math.random() - 0.5) * span;
  const assess = mode === "assessment";
  return {
    crY: scaleLandmarkY(42, patient.heightCm) + (assess ? jitter(8) : 0),
    crX: assess ? jitter(4) : 0,
    sid: p.setup === "wall" ? 180 : 100,
    angle: 0,
    collimationW: p.irW,
    collimationH: p.irH,
  };
}

function defaultExposure(projectionId: string): ExposureState {
  const p = projectionById(projectionId);
  return {
    kvp: p.kvp,
    mas: p.mas,
    grid: p.grid,
    focalSpot: p.setup === "tabletop" ? "fine" : "broad",
    marker: null,
  };
}

function playConsoleSound(kind: "prep" | "expose") {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (kind === "prep") {
      osc.frequency.value = 90;
      osc.type = "sawtooth";
      gain.gain.setValueAtTime(0.02, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 1.2);
    } else {
      osc.frequency.value = 880;
      osc.type = "square";
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
    window.setTimeout(() => void ctx.close(), 1500);
  } catch {
    /* autoplay may be blocked */
  }
}

function handbookPose(projectionId: string): SimPose {
  const p = projectionById(projectionId);
  const lateral = p.anatomy.includes("lat") || p.name.toLowerCase().includes("lateral");
  return {
    recumbency: p.recumbency,
    rotationY: lateral ? (p.laterality === "right" ? -90 : 90) : 0,
    oblique: 0,
    chinUp: p.id === "pa-chest" || p.id.includes("cspine") ? 0.75 : 0.35,
    shoulderRoll: p.id === "pa-chest" ? 0.85 : 0.2,
    armRaise: p.id === "lat-chest" ? 1 : 0,
    elbowFlex: p.id === "ap-elbow" ? 0 : 15,
    kneeFlex: p.id === "lat-knee" ? 25 : 0,
    hipInternal: p.id === "ap-pelvis" || p.id === "ap-hip" ? 18 : 0,
    breath: p.respiration ?? "inspiration",
  };
}

function handbookTube(projectionId: string, patientId: string): TubeState {
  const p = projectionById(projectionId);
  const patient = patientById(patientId);
  const isLocal = !["torso-ap", "torso-lat", "cspine-lat", "shoulder-ap"].includes(p.anatomy);
  return {
    crY: isLocal ? p.cr.y : scaleLandmarkY(p.cr.y, patient.heightCm),
    crX: isLocal ? p.cr.x : p.cr.x * patient.morph.torsoWidth,
    sid: p.sidCm,
    angle: p.tubeAngle,
    collimationW: p.collimationW,
    collimationH: p.collimationH,
  };
}

export const useSim = create<SimStore>((set, get) => ({
  screen: "library",
  mode: "practice",
  patientId: "amara",
  projectionId: "pa-chest",
  pose: presentedPose("pa-chest"),
  tube: presentedTube("pa-chest", "amara", "practice"),
  exposure: defaultExposure("pa-chest"),
  showLandmarks: true,
  showLightField: true,
  preparing: false,
  exposing: false,
  result: null,
  error: null,

  setScreen: (screen) => set({ screen }),
  setMode: (mode) => set({ mode }),
  setPatient: (patientId) => set({ patientId }),
  setProjection: (projectionId) => {
    const { patientId, mode } = get();
    set({
      projectionId,
      pose: presentedPose(projectionId),
      tube: presentedTube(projectionId, patientId, mode),
      exposure: defaultExposure(projectionId),
      result: null,
    });
  },
  startExam: (projectionId, patientId) => {
    const pid = patientId ?? get().patientId;
    const { mode } = get();
    set({
      projectionId,
      patientId: pid,
      pose: presentedPose(projectionId),
      tube: presentedTube(projectionId, pid, mode),
      exposure: defaultExposure(projectionId),
      result: null,
      error: null,
      screen: "room",
      preparing: false,
      showLandmarks: mode === "practice",
    });
  },
  patchPose: (p) => set({ pose: { ...get().pose, ...p } }),
  patchTube: (t) => set({ tube: { ...get().tube, ...t } }),
  patchExposure: (e) => set({ exposure: { ...get().exposure, ...e } }),
  applyHandbook: () => {
    const { projectionId, patientId } = get();
    set({
      pose: handbookPose(projectionId),
      tube: handbookTube(projectionId, patientId),
    });
  },
  applySuggestedFactors: () => {
    const { projectionId, patientId, exposure } = get();
    const sug = suggestedTechnique(patientById(patientId), projectionById(projectionId));
    set({ exposure: { ...exposure, ...sug, grid: projectionById(projectionId).grid } });
  },
  setLandmarkCR: (landmarkY, landmarkX) => {
    set({ tube: { ...get().tube, crY: landmarkY, crX: landmarkX } });
  },
  predictedEI: () => {
    const s = get();
    return predictEI(patientById(s.patientId), projectionById(s.projectionId), s.exposure, s.tube);
  },
  prepare: () => {
    playConsoleSound("prep");
    set({ preparing: true });
    window.setTimeout(() => {
      if (get().preparing) set({ preparing: false });
    }, 4000);
  },
  expose: async () => {
    const s = get();
    if (s.exposing) return;
    playConsoleSound("expose");
    set({ exposing: true, error: null, preparing: false });
    try {
      const result = await renderRadiograph({
        patient: patientById(s.patientId),
        projection: projectionById(s.projectionId),
        pose: s.pose,
        tube: s.tube,
        exposure: s.exposure,
      });
      set({ result, screen: "viewer", exposing: false });
    } catch (err) {
      set({
        exposing: false,
        error: err instanceof Error ? err.message : "Exposure failed",
      });
    }
  },
  retake: () => set({ screen: "room", result: null }),
}));

export { PATIENTS, PROJECTIONS };

export type { Recumbency, Breath, FocalSpot, Marker };
