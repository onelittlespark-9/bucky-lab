import * as THREE from "three";
import type { ArmSide, PlacementMode } from "./types";
import { extremityPlacement } from "./extremity-kinematics";

export type V3 = [number, number, number];
export type Side = -1 | 1;

export interface PatientKinematicsInput {
  H: number; s: number; shoulder: number; hip: number; limb: number;
  elbowFlex: number; hipInternal: number; armRaise: number; armSide?: ArmSide;
  armRotation?: number; forearmRotation?: number; shoulderRoll: number;
  kneeFlex: number; projectionId: string; placement: PlacementMode; buckyTilt: number;
}
export interface ArmChain {
  shoulder: V3; upper: V3; elbow: V3; wrist: V3; hand: V3;
  upperDirection: V3; forearmDirection: V3; handQuaternion: [number, number, number, number];
}
export interface LegChain { hip: V3; thigh: V3; knee: V3; calf: V3; ankle: V3; foot: V3; }

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/**
 * Single source of truth for the articulated patient. Coordinates are metres,
 * with Y superior, X lateral and Z anterior/posterior before PatientRig's
 * table/wall transform. Joint chains are continuous so skin, soft tissue and
 * atlas bones can all follow the same landmarks.
 */
export function patientKinematics(input: PatientKinematicsInput) {
  const { H, s, shoulder, hip, limb, projectionId, placement, buckyTilt } = input;
  const Y = { shoulder: .75 * H, waist: .59 * H, pelvis: .47 * H, knee: .245 * H, ankle: .055 * H };
  const shoulderWidth = .195 * shoulder * s;
  const hipGap = .085 * hip * s;
  const intent = extremityPlacement(projectionId, placement, buckyTilt);
  const target = intent.target;
  const detectorExtremity = intent.onDetector;
  const upperLimbExam = /hand|wrist|elbow|shoulder/.test(`${projectionId} ${target ?? ""}`.toLowerCase());

  const arms = ([-1, 1] as const).map((side): ArmChain => {
    const shoulderPoint: V3 = [side * shoulderWidth, Y.shoulder, 0];
    const sideName: ArmSide = side < 0 ? "left" : "right";
    const selected = !upperLimbExam || input.armSide == null || input.armSide === sideName;
    const raise = selected ? clamp(input.armRaise, 0, 1) : 0;
    const elbowFlex = selected ? clamp(input.elbowFlex, 0, 140) : 0;
    const armRotation = selected ? clamp(input.armRotation ?? 0, -90, 90) : 0;
    const forearmRotation = selected ? clamp(input.forearmRotation ?? 0, -90, 90) : 0;
    const shoulderRoll = selected ? clamp(input.shoulderRoll, -1, 1) : 0;

    const raiseAngle = raise * Math.PI * (115 / 180);
    const flex = elbowFlex * Math.PI / 180;
    // Shoulder roll is a modest scapulohumeral/internal-rotation contribution;
    // it should not behave like an unconstrained Euler rotation.
    const axial = (armRotation + shoulderRoll * 24) * Math.PI / 180;
    const upperLength = .18 * limb * s;
    const forearmLength = .17 * limb * s;
    const handLength = .06 * s;

    const radialX = Math.sin(raiseAngle) * Math.cos(axial);
    const radialZ = Math.sin(raiseAngle) * Math.sin(axial) + shoulderRoll * .035;
    const upper: V3 = [
      shoulderPoint[0] + side * upperLength * radialX,
      shoulderPoint[1] - upperLength * Math.cos(raiseAngle),
      shoulderPoint[2] + upperLength * radialZ,
    ];
    const forearmAngle = raiseAngle - flex;
    const forearmRadialX = Math.sin(forearmAngle) * Math.cos(axial);
    const forearmRadialZ = Math.sin(forearmAngle) * Math.sin(axial) + shoulderRoll * .025;
    const elbowPoint: V3 = upper;
    const wrist: V3 = [
      elbowPoint[0] + side * forearmLength * forearmRadialX,
      elbowPoint[1] - forearmLength * Math.cos(forearmAngle),
      elbowPoint[2] + forearmLength * forearmRadialZ,
    ];
    const handDir: V3 = [
      side * Math.sin(forearmAngle) * Math.cos(axial),
      -Math.cos(forearmAngle),
      Math.sin(forearmAngle) * Math.sin(axial) + shoulderRoll * .025,
    ];
    const hand: V3 = [
      wrist[0] + side * handLength * handDir[0],
      wrist[1] + handLength * handDir[1],
      wrist[2] + handLength * handDir[2],
    ];

    if (detectorExtremity && intent.side === side) {
      const flatten = Math.min(1, Math.abs(buckyTilt) / 90);
      wrist[1] += .025 * s * flatten;
      wrist[2] += .055 * s * flatten;
      hand[1] += .025 * s * flatten;
      hand[2] += .055 * s * flatten;
    }

    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(...handDir).normalize(),
      forearmRotation * Math.PI / 180,
    );
    return {
      shoulder: shoulderPoint,
      upper,
      elbow: elbowPoint,
      wrist,
      hand,
      upperDirection: sub(upper, shoulderPoint),
      forearmDirection: sub(wrist, elbowPoint),
      handQuaternion: [q.x, q.y, q.z, q.w],
    };
  });

  const hipInternal = input.hipInternal * Math.PI / 180;
  const kneeFlex = clamp(input.kneeFlex, 0, 135) * Math.PI / 180;
  const legs = ([-1, 1] as const).map((side): LegChain => {
    const hipPoint: V3 = [side * hipGap, Y.pelvis - .01 * s, 0];
    const thigh: V3 = [
      side * (hipGap + .008 * s),
      Y.knee + .12 * H,
      side * .008 * s * Math.sin(hipInternal),
    ];
    const knee: V3 = [side * (hipGap + .006 * s), Y.knee, side * .012 * s * Math.sin(hipInternal)];
    const calfLength = .12 * H;
    const calf: V3 = [
      knee[0],
      knee[1] - calfLength * Math.cos(kneeFlex),
      knee[2] + side * calfLength * Math.sin(kneeFlex) + .008 * s,
    ];
    const ankle: V3 = [
      calf[0],
      calf[1] - .02 * H * Math.cos(kneeFlex),
      calf[2] + side * .02 * H * Math.sin(kneeFlex),
    ];
    const foot: V3 = [ankle[0], ankle[1] - .012 * s, ankle[2] + .045 * s];
    return { hip: hipPoint, thigh, knee, calf, ankle, foot };
  });

  return { Y, shoulderWidth, hipGap, arms, legs, detectorExtremity, target };
}
