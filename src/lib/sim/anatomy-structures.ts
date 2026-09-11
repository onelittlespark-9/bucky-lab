export type OrganId = "lung-right" | "lung-left" | "heart" | "liver" | "stomach" | "kidney-right" | "kidney-left";

export interface OrganShape {
  id: OrganId;
  xCm: number;
  yCm: number;
  widthCm: number;
  heightCm: number;
  depthCm: number;
  density: "lung" | "soft";
}

/** Shared teaching anatomy coordinates. y is cm inferior to the vertex. */
export const SHARED_ORGANS: OrganShape[] = [
  { id: "lung-right", xCm: -7.2, yCm: 32.5, widthCm: 10.0, heightCm: 24.0, depthCm: 8.5, density: "lung" },
  { id: "lung-left", xCm: 7.0, yCm: 33.0, widthCm: 9.1, heightCm: 23.0, depthCm: 8.0, density: "lung" },
  { id: "heart", xCm: 2.0, yCm: 42.0, widthCm: 6.6, heightCm: 8.0, depthCm: 6.0, density: "soft" },
  { id: "liver", xCm: 5.0, yCm: 56.0, widthCm: 12.0, heightCm: 8.0, depthCm: 10.0, density: "soft" },
  { id: "stomach", xCm: -5.0, yCm: 56.0, widthCm: 7.0, heightCm: 7.0, depthCm: 7.0, density: "soft" },
  { id: "kidney-right", xCm: -6.0, yCm: 63.0, widthCm: 4.0, heightCm: 6.0, depthCm: 3.2, density: "soft" },
  { id: "kidney-left", xCm: 6.0, yCm: 63.0, widthCm: 4.0, heightCm: 6.0, depthCm: 3.2, density: "soft" },
];

export const SPINE_LEVELS_CM = Array.from({ length: 17 }, (_, i) => 22 + i * 3.7);
export const RIB_LEVELS_CM = Array.from({ length: 10 }, (_, i) => 28 + i * 2.8);

export function scaleAnatomyCm(cm: number, heightCm: number) {
  return cm * (heightCm / 170);
}
