import type { ArmSide, PlacementMode } from "./types";
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
  armSide?: ArmSide;
  shoulderRoll: number;
  kneeFlex: number;
  projectionId: string;
  placement: PlacementMode;
  buckyTilt: number;
}

export interface ArmChain { shoulder: V3; upper: V3; elbow: V3; wrist: V3; hand: V3; }
export interface LegChain { hip: V3; thigh: V3; knee: V3; calf: V3; ankle: V3; foot: V3; }

/** One source of truth for visible skin, soft tissue and skeleton joint centres. */
export function patientKinematics(input: PatientKinematicsInput) {
  const { H, s, shoulder, hip, limb, projectionId, placement, buckyTilt } = input;
  const Y = { shoulder: 0.75 * H, waist: 0.59 * H, pelvis: 0.47 * H, knee: 0.245 * H, ankle: 0.055 * H };
  const shoulderWidth = 0.195 * shoulder * s;
  const hipGap = 0.085 * hip * s;
  const intent = extremityPlacement(projectionId, placement, buckyTilt);
  const target = intent.target;
  const detectorExtremity = intent.onDetector;
  const upperLimbExam = /hand|wrist|elbow|shoulder/.test(`${projectionId} ${target ?? ""}`.toLowerCase());
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  const arms = ([-1, 1] as const).map((side): ArmChain => {
    const shoulderPoint: V3 = [side * shoulderWidth, Y.shoulder, 0];
    const sideName: ArmSide = side < 0 ? "left" : "right";
    const selected = !upperLimbExam || input.armSide == null || input.armSide === sideName;
    const raise = selected ? clamp(input.armRaise, 0, 1) : 0;
    const elbowFlex = selected ? clamp(input.elbowFlex, 0, 140) : 0;
    const shoulderRoll = selected ? input.shoulderRoll : 0;

    // armRaise is an actual shoulder elevation, not a vertical translation.
    // 0 = arm alongside the trunk; 1 = arm elevated above horizontal.
    const raiseAngle = raise * Math.PI * (115 / 180);
    const flex = elbowFlex * Math.PI / 180;
    const upperLength = 0.18 * limb * s;
    const forearmLength = 0.17 * limb * s;
    const handLength = 0.06 * s;
    const rollZ = 0.018 * s * Math.sin(clamp(shoulderRoll, 0, 1) * Math.PI / 2);

    const upper: V3 = [
      shoulderPoint[0] + side * upperLength * Math.sin(raiseAngle),
      shoulderPoint[1] - upperLength * Math.cos(raiseAngle),
      shoulderPoint[2] + rollZ,
    ];
    // Elbow flexion bends the forearm from the upper-arm direction while
    // preserving continuity at the elbow. 0° therefore gives a straight arm.
    const forearmAngle = raiseAngle - flex;
    const elbowPoint: V3 = upper;
    const forearm: V3 = [
      side * forearmLength * Math.sin(forearmAngle),
      -forearmLength * Math.cos(forearmAngle),
      0.012 * s * Math.sin(flex),
    ];
    const wrist: V3 = [elbowPoint[0] + forearm[0], elbowPoint[1] + forearm[1], elbowPoint[2] + forearm[2]];
    const hand: V3 = [wrist[0] + side * handLength * Math.sin(forearmAngle), wrist[1] - handLength * Math.cos(forearmAngle), wrist[2]];

    if (detectorExtremity && intent.side === side) {
      const flatten = Math.min(1, Math.abs(buckyTilt) / 90);
      wrist[1] += 0.025 * s * flatten;
      wrist[2] += 0.055 * s * flatten;
      hand[1] += 0.025 * s * flatten;
      hand[2] += 0.055 * s * flatten;
    }

    return { shoulder: shoulderPoint, upper, elbow: elbowPoint, wrist, hand };
  });

  const hipInternal = input.hipInternal * Math.PI / 180;
  const kneeFlex = clamp(input.kneeFlex, 0, 135) * Math.PI / 180;
  const legs = ([-1, 1] as const).map((side): LegChain => {
    const hipPoint: V3 = [side * hipGap, Y.pelvis - 0.01 * s, 0];
    const thigh: V3 = [side * (hipGap + 0.008 * s), Y.knee + 0.12 * H, side * 0.008 * s * Math.sin(hipInternal)];
    const knee: V3 = [side * (hipGap + 0.006 * s), Y.knee, side * 0.012 * s];
    const calfLength = 0.12 * H;
    const calf: V3 = [knee[0], knee[1] - calfLength * Math.cos(kneeFlex), knee[2] + side * calfLength * Math.sin(kneeFlex) + 0.008 * s];
    const ankle: V3 = [calf[0], calf[1] - 0.02 * H * Math.cos(kneeFlex), calf[2] + side * 0.02 * H * Math.sin(kneeFlex)];
    const foot: V3 = [ankle[0], ankle[1] - 0.012 * s, ankle[2] + 0.045 * s];
    return { hip: hipPoint, thigh, knee, calf, ankle, foot };
  });

  return { Y, shoulderWidth, hipGap, arms, legs, detectorExtremity, target };
}
