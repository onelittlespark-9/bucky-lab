import { create } from "zustand";
import type {
  Breath,
  ExposureState,
  FocalSpot,
  Marker,
  Mode,
  PlacementMode,
  RadiographResult,
  Recumbency,
  RoomEquipment,
  Screen,
  SimPose,
  TubeState,
} from "./types";
import { patientById, PATIENTS } from "./patients";
import { projectionById, PROJECTIONS, scaleLandmarkY } from "./projections";
import { predictEI, suggestedTechnique } from "./exposure";
import { renderRadiograph, preloadRadiographAssets } from "./render-radiograph";
import type { PathologyId } from "./requests";
import { requestById } from "./requests";

preloadRadiographAssets(PROJECTIONS);

function defaultEquipment(placement: PlacementMode = "table"): RoomEquipment {
  if (placement === "upright-bucky" || placement === "standing") {
    return {
      patientX: 0,
      patientY: 0,
      patientZ: 0,
      tableHeight: 0.9,
      tableX: 0,
      tableZ: 0,
      buckyHeight: 1.1,
      buckyTilt: 0,
      placement,
    };
  }
  if (placement === "seated") {
    return {
      patientX: 0,
      patientY: -0.35,
      patientZ: 0,
      tableHeight: 0.9,
      tableX: 0,
      tableZ: 0,
      buckyHeight: 0.95,
      buckyTilt: 0,
      placement,
    };
  }
  return {
    patientX: 0,
    patientY: 0,
    patientZ: 0,
    tableHeight: 0.9,
    tableX: 0,
    tableZ: 0,
    buckyHeight: 1.1,
    buckyTilt: 0,
    placement: "table",
  };
}

function placementFromProjection(projectionId: string): PlacementMode {
  const p = projectionById(projectionId);
  if (p.setup === "wall") return "upright-bucky";
  if (p.setup === "tabletop") return "table";
  return "table";
}

export interface SimStore {
  screen: Screen;
  mode: Mode;
  patientId: string;
  projectionId: string;
  requestId: string | null;
  pathologyId: PathologyId;
  pose: SimPose;
  tube: TubeState;
  exposure: ExposureState;
  equipment: RoomEquipment;
  showLandmarks: boolean;
  showLightField: boolean;
  setShowLandmarks: (v: boolean) => void;
  setShowLightField: (v: boolean) => void;
  preparing: boolean;
  exposing: boolean;
  result: RadiographResult | null;
  error: string | null;
  setScreen: (s: Screen) => void;
  setMode: (m: Mode) => void;
  setPatient: (id: string) => void;
  setProjection: (id: string) => void;
  startExam: (projectionId: string, patientId?: string, requestId?: string) => void;
  confirmSetup: (placement: PlacementMode) => void;
  patchPose: (p: Partial<SimPose>) => void;
  patchTube: (t: Partial<TubeState>) => void;
  patchExposure: (e: Partial<ExposureState>) => void;
  patchEquipment: (e: Partial<RoomEquipment>) => void;
  applyHandbook: () => void;
  applySuggestedFactors: () => void;
  setLandmarkCR: (landmarkY: number, landmarkX: number) => void;
  predictedEI: () => number;
  prepare: () => void;
  expose: () => Promise<void>;
  retake: () => void;
}

function safeProjectionId(id: string): string {
  const exists = PROJECTIONS.some((p) => p.id === id);
  return exists ? id : "pa-chest";
}

function presentedPose(projectionId: string, placement?: PlacementMode): SimPose {
  const p = projectionById(projectionId);
  const place = placement ?? placementFromProjection(projectionId);
  const erect = place === "standing" || place === "upright-bucky" || place === "seated";
  return {
    recumbency: erect ? "erect" : "supine",
    rotationY: 0,
    oblique: 0,
    chinUp: 0.15,
    shoulderRoll: 0.1,
    armRaise: 0,
    elbowFlex: 8,
    kneeFlex: place === "seated" ? 90 : 0,
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
    lockedToDetector: true,
  };
}

function defaultExposure(projectionId: string, patientId: string): ExposureState {
  const p = projectionById(projectionId);
  const patient = patientById(patientId);
  let kvp = p.kvp;
  let mas = p.mas;
  try {
    const sug = suggestedTechnique(patient, p);
    kvp = sug.kvp;
    mas = sug.mas;
  } catch {
    /* keep handbook defaults */
  }
  return {
    kvp,
    mas,
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
    lockedToDetector: true,
  };
}

export const useSim = create<SimStore>((set, get) => ({
  screen: "library",
  mode: "practice",
  patientId: "amara",
  projectionId: "pa-chest",
  requestId: null,
  pathologyId: "none",
  pose: presentedPose("pa-chest"),
  tube: presentedTube("pa-chest", "amara", "practice"),
  exposure: defaultExposure("pa-chest", "amara"),
  equipment: defaultEquipment("upright-bucky"),
  showLandmarks: true,
  showLightField: true,
  preparing: false,
  exposing: false,
  result: null,
  error: null,

  setScreen: (screen) => set({ screen }),
  setMode: (mode) => set({ mode }),
  setShowLandmarks: (showLandmarks) => set({ showLandmarks }),
  setShowLightField: (showLightField) => set({ showLightField }),
  setPatient: (patientId) => set({ patientId }),
  setProjection: (projectionId) => {
    const { patientId, mode } = get();
    const pid = safeProjectionId(projectionId);
    set({
      projectionId: pid,
      pose: presentedPose(pid),
      tube: presentedTube(pid, patientId, mode),
      exposure: defaultExposure(pid, patientId),
      equipment: defaultEquipment(placementFromProjection(pid)),
      result: null,
    });
  },
  startExam: (projectionId, patientId, requestId) => {
    const pid = patientId ?? get().patientId;
    const { mode } = get();
    const safeId = safeProjectionId(projectionId);
    const req = requestId ? requestById(requestId) : null;
    const place = placementFromProjection(safeId);
    set({
      projectionId: safeId,
      patientId: pid,
      requestId: requestId ?? null,
      pathologyId: req?.pathologyId ?? "none",
      pose: presentedPose(safeId, place),
      tube: presentedTube(safeId, pid, mode),
      exposure: defaultExposure(safeId, pid),
      equipment: defaultEquipment(place),
      result: null,
      error: null,
      screen: "setup",
      preparing: false,
      showLandmarks: mode === "practice",
    });
  },
  confirmSetup: (placement) => {
    const { projectionId } = get();
    set({
      equipment: defaultEquipment(placement),
      pose: presentedPose(projectionId, placement),
      screen: "room",
    });
  },
  patchPose: (p) => set({ pose: { ...get().pose, ...p } }),
  patchTube: (t) => set({ tube: { ...get().tube, ...t } }),
  patchExposure: (e) => set({ exposure: { ...get().exposure, ...e } }),
  patchEquipment: (e) => set({ equipment: { ...get().equipment, ...e } }),
  applyHandbook: () => {
    const { projectionId, patientId } = get();
    set({
      pose: handbookPose(projectionId),
      tube: handbookTube(projectionId, patientId),
    });
  },
  applySuggestedFactors: () => {
    const { projectionId, patientId, exposure } = get();
    try {
      const sug = suggestedTechnique(patientById(patientId), projectionById(projectionId));
      set({ exposure: { ...exposure, ...sug, grid: projectionById(projectionId).grid } });
    } catch {
      /* keep current exposure if suggestion fails */
    }
  },
  setLandmarkCR: (landmarkY, landmarkX) => {
    set({ tube: { ...get().tube, crY: landmarkY, crX: landmarkX } });
  },
  predictedEI: () => {
    const s = get();
    try {
      return predictEI(patientById(s.patientId), projectionById(s.projectionId), s.exposure, s.tube);
    } catch {
      return 250;
    }
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
        pathologyId: s.pathologyId,
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
