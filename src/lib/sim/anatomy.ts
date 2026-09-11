import type { Patient, Projection, SimPose } from "./types";
import { fbm, rimEllipse, softCapsule, softEllipse } from "./geometry";

export interface Paths {
  air: number;
  lung: number;
  fat: number;
  soft: number;
  bone: number;
  cortical: number;
  gas: number;
  metal: number;
}

export interface SampleCtx {
  patient: Patient;
  projection: Projection;
  pose: SimPose;
}

const EMPTY: Paths = { air: 0, lung: 0, fat: 0, soft: 0, bone: 0, cortical: 0, gas: 0, metal: 0 };

export function sampleAnatomy(x: number, y: number, ctx: SampleCtx): Paths {
  switch (ctx.projection.anatomy) {
    case "torso-ap":
      return sampleTorsoAP(x, y, ctx);
    case "torso-lat":
      return sampleTorsoLat(x, y, ctx);
    case "cspine-lat":
      return sampleCspineLat(x, y, ctx);
    case "skull-lat":
      return sampleSkullLat(x, y, ctx);
    case "hand-pa":
      return sampleHandPA(x, y, ctx);
    case "wrist-pa":
      return sampleWristPA(x, y, ctx);
    case "elbow-ap":
      return sampleElbowAP(x, y, ctx);
    case "shoulder-ap":
      return sampleShoulderAP(x, y, ctx);
    case "knee-ap":
      return sampleKneeAP(x, y, ctx);
    case "knee-lat":
      return sampleKneeLat(x, y, ctx);
    case "foot-dp":
      return sampleFootDP(x, y, ctx);
    case "ankle-ap":
      return sampleAnkleAP(x, y, ctx);
    default:
      return sampleTorsoAP(x, y, ctx);
  }
}
