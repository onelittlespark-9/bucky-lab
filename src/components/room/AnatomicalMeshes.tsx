import * as THREE from "three";
import { useMemo } from "react";

type V3 = [number, number, number];

function surfaceGeometry(
  rings: number,
  segments: number,
  radius: (u: number, theta: number) => [number, number, number],
) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const u = i / rings;
    for (let j = 0; j < segments; j++) {
      const theta = (j / segments) * Math.PI * 2;
      const [x, y, z] = radius(u, theta);
      positions.push(x, y, z);
      const du = Math.min(1, u + 0.002), dd = Math.max(0, u - 0.002);
      const [x1, y1, z1] = radius(du, theta);
      const [x2, y2, z2] = radius(dd, theta);
      const dt = 0.002;
      const [xt1, yt1, zt1] = radius(u, theta + dt);
      const [xt2, yt2, zt2] = radius(u, theta - dt);
      const a = new THREE.Vector3(x1 - x2, y1 - y2, z1 - z2);
      const b = new THREE.Vector3(xt1 - xt2, yt1 - yt2, zt1 - zt2);
      const n = b.cross(a).normalize();
      normals.push(n.x, n.y, n.z);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * segments + j;
      const b = i * segments + ((j + 1) % segments);
      const c = (i + 1) * segments + ((j + 1) % segments);
      const d = (i + 1) * segments + j;
      indices.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

function LobedOrgan({ position, scale, kind, color, opacity }: { position: V3; scale: V3; kind: "lung" | "heart" | "liver" | "stomach" | "kidney"; color: string; opacity: number }) {
  const geometry = useMemo(() => surfaceGeometry(28, 40, (u, theta) => {
    const phi = u * Math.PI;
    const sin = Math.sin(phi);
    const cos = Math.cos(phi);
    let x = sin * Math.cos(theta);
    let y = cos;
    let z = sin * Math.sin(theta);
    if (kind === "lung") {
      const medial = Math.max(0, -Math.cos(theta));
      const taper = .92 - .20 * u + .07 * Math.sin(phi);
      const cardiacNotch = .20 * medial * Math.exp(-Math.pow((u - .58) / .27, 2));
      x *= taper * (1 - cardiacNotch);
      y = y * (1.02 - .16 * u) + .04 * Math.sin(theta) * sin;
      z *= .92;
      if (u > .82) x *= .72;
    } else if (kind === "heart") {
      const notch = .16 * Math.max(0, Math.cos(theta));
      x *= 1.0 - notch;
      y = y * (1.0 + .12 * cos) - .08 * sin * sin;
      z *= .88;
    } else if (kind === "liver") {
      const leftLobe = Math.max(0, Math.cos(theta));
      x *= 1.02 + .18 * leftLobe;
      y = y * (.76 + .18 * (1 - u)) - .18 * (1 - cos) * (1 - u);
      z *= .88;
    } else if (kind === "stomach") {
      const curve = .18 * Math.sin((u - .18) * Math.PI);
      x = x * .92 + curve;
      y *= .82;
      z *= .86;
    } else {
      const bean = .22 * Math.exp(-Math.pow(x / .35, 2));
      x *= 1 - bean;
      y *= .96;
      z *= .82;
    }
    return [x * scale[0], y * scale[1], z * scale[2]];
  }), [kind, scale]);

  return <mesh position={position} geometry={geometry} renderOrder={8}><meshPhysicalMaterial color={color} transparent opacity={opacity} roughness={.62} depthWrite={false} depthTest={false} side={THREE.DoubleSide} /></mesh>;
}

export function LungMesh(props: { position: V3; scale: V3; color: string; opacity: number }) { return <LobedOrgan {...props} kind="lung" />; }
export function HeartMesh(props: { position: V3; scale: V3; color: string; opacity: number }) { return <LobedOrgan {...props} kind="heart" />; }
export function LiverMesh(props: { position: V3; scale: V3; color: string; opacity: number }) { return <LobedOrgan {...props} kind="liver" />; }
export function StomachMesh(props: { position: V3; scale: V3; color: string; opacity: number }) { return <LobedOrgan {...props} kind="stomach" />; }
export function KidneyMesh(props: { position: V3; scale: V3; color: string; opacity: number }) { return <LobedOrgan {...props} kind="kidney" />; }

export function RibMesh({ points, radius, color, opacity }: { points: V3[]; radius: number; color: string; opacity: number }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), [points]);
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 18, radius, 8, false), [curve, radius]);
  return <mesh geometry={geometry} renderOrder={7}><meshPhysicalMaterial color={color} transparent opacity={opacity} roughness={.78} depthWrite={false} depthTest={false} /></mesh>;
}

export function VertebraMesh({ position, scale, color, opacity }: { position: V3; scale: V3; color: string; opacity: number }) {
  return <group position={position} scale={scale} renderOrder={7}>
    <mesh><sphereGeometry args={[1, 16, 10]} /><meshPhysicalMaterial color={color} transparent opacity={opacity} roughness={.8} depthWrite={false} depthTest={false} /></mesh>
    <mesh position={[0, 0, -.95]} scale={[.48, .38, .8]}><coneGeometry args={[1, 1, 6]} /><meshPhysicalMaterial color={color} transparent opacity={opacity} roughness={.8} depthWrite={false} depthTest={false} /></mesh>
  </group>;
}

export function PelvisMesh({ position, scale, color, opacity }: { position: V3; scale: V3; color: string; opacity: number }) {
  const geometry = useMemo(() => surfaceGeometry(18, 48, (u, theta) => {
    const phi = u * Math.PI;
    const s = Math.sin(phi), c = Math.cos(phi);
    const wing = 1 + .28 * Math.max(0, Math.abs(Math.cos(theta)) - .35);
    const x = s * Math.cos(theta) * wing;
    const y = c * .72;
    const z = s * Math.sin(theta) * .62;
    return [x * scale[0], y * scale[1], z * scale[2]];
  }), [scale]);
  return <mesh position={position} geometry={geometry} renderOrder={7}><meshPhysicalMaterial color={color} transparent opacity={opacity} roughness={.8} depthWrite={false} depthTest={false} side={THREE.DoubleSide} /></mesh>;
}
