import type { PlacementMode } from "./types";
import { extremityPlacement } from "./extremity-kinematics";

export type V3 = [number, number, number];
export type Side = -1 | 1;

export interface PatientKinematicsInput {
  H: number;
  s: number;
  shoulder: number;
  hip: number;
  limb: number;
  elbowFlex: number;
  hipInternal: number;
  armRaise: number;
  shoulderRoll: number;
  kneeFlex: number;
  projectionId: string;
  placement: PlacementMode;
  buckyTilt: number;
}

export interface ArmChain {
  shoulder: V3;
  upper: V3;
  elbow: V3;
  wrist: V3;
  hand: V3;
}

export interface LegChain {
  hip: V3;
  thigh: V3;
  knee: V3;
  calf: V3;
  ankle: V3;
  foot: V3;
}

/** One source of truth for visible skin, soft tissue and skeleton joint centres. */
export function patientKinematics(input: PatientKinematicsInput) {
  const { H, s, shoulder, hip, limb, projectionId, placement, buckyTilt } = input;
  const Y = {
    shoulder: 0.79 * H,
    waist: 0.59 * H,
    pelvis: 0.47 * H,
    knee: 0.245 * H,
    ankle: 0.055 * H,
  };

  const shoulderWidth = 0.205 * shoulder * s;
  const hipGap = 0.085 * hip * s;
  const elbow = input.elbowFlex * Math.PI / 180;
  const hipInternal = input.hipInternal * Math.PI / 180;
  const kneeFlex = Math.max(0, Math.min(135, input.kneeFlex)) * Math.PI / 180;
  const raise = Math.max(0, Math.min(1, input.armRaise));
  const intent = extremityPlacement(projectionId, placement, buckyTilt);
  const target = intent.target;
  const detectorExtremity = intent.onDetector;

  const arms = ([-1, 1] as const).map((side): ArmChain => {
    const shoulderPoint: V3 = [side * shoulderWidth, Y.shoulder, 0];
    let upper: V3;
    let elbowPoint: V3;
    let wrist: V3;

    if (projectionId === "lat-chest" && raise > 0.35) {
      upper = [side * (shoulderWidth + 0.03 * s), Y.shoulder + 0.12 * H * raise, 0.02 * s];
      elbowPoint = [side * (shoulderWidth + 0.015 * s), Y.shoulder + 0.22 * H * raise, 0.035 * s];
      wrist = [side * 0.075 * s, Y.shoulder + 0.31 * H * raise, 0.04 * s];
    } else if (projectionId === "pa-chest" && input.shoulderRoll > 0.55) {
      upper = [side * (shoulderWidth + 0.02 * s), Y.shoulder - 0.045 * s, 0];
      elbowPoint = [side * (shoulderWidth + 0.015 * s), Y.shoulder - 0.12 * s, 0.055 * s];
      wrist = [side * 0.1664 * s, Y.pelvis + 0.02 * s, 0.07 * s];
    } else {
      upper = [side * (shoulderWidth + 0.055 * limb * s), Y.shoulder + 0.08 * H * raise, 0];
      elbowPoint = [upper[0] + side * 0.005 * s, upper[1] - 0.16 * s * Math.cos(elbow), 0.02 * s * Math.sin(elbow)];
      wrist = [elbowPoint[0] + side * 0.012 * s, elbowPoint[1] - 0.16 * s * Math.cos(elbow), 0.04 * s * Math.sin(elbow)];
    }

    if (detectorExtremity && (target === "hand" || target === "wrist" || target === "elbow")) {
      const flatten = Math.min(1, Math.abs(buckyTilt) / 90);
      wrist = [wrist[0], wrist[1] + 0.035 * s * flatten, wrist[2] + 0.055 * s * flatten];
    }

    return {
      shoulder: shoulderPoint,
      upper,
      elbow: elbowPoint,
      wrist,
      hand: [wrist[0] + side * 0.004 * s, wrist[1] - 0.055 * s, wrist[2]],
    };
  });

  const legs = ([-1, 1] as const).map((side): LegChain => {
    const hipPoint: V3 = [side * hipGap, Y.pelvis - 0.01 * s, 0];
    const thigh: V3 = [side * (hipGap + 0.008 * s), Y.knee + 0.12 * H, side * 0.008 * s * Math.sin(hipInternal)];
    const knee: V3 = [side * (hipGap + 0.006 * s), Y.knee, side * 0.012 * s];
    const calfLength = 0.12 * H;
    const calf: V3 = [
      knee[0],
      knee[1] - calfLength * Math.cos(kneeFlex),
      knee[2] + side * calfLength * Math.sin(kneeFlex) + 0.008 * s,
    ];
    const ankle: V3 = [
      calf[0],
      calf[1] - 0.02 * H * Math.cos(kneeFlex),
      calf[2] + side * 0.02 * H * Math.sin(kneeFlex),
    ];
    const foot: V3 = [ankle[0], ankle[1] - 0.012 * s, ankle[2] + 0.11 * s];

    return { hip: hipPoint, thigh, knee, calf, ankle, foot };
  });

  return { Y, shoulderWidth, hipGap, arms, legs, detectorExtremity, target };
}
