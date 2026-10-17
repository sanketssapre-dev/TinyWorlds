import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  ShaderMaterial,
  Vector3,
} from "three";
import { PLANET } from "../config";
import { sphToCart } from "../math/sphere";
import { SITES } from "./features";
import { heightOffset } from "./height";

const waterVert = `
uniform float uTime;
varying vec3 vWorld;
void main() {
  vec3 p = position;
  float wave = sin(position.x * 0.35 + uTime * 1.3) * 0.04;
  p += normalize(position) * wave;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const waterFrag = `
uniform vec3 uColor;
uniform vec3 uDeep;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vWorld);
  float fres = pow(1.0 - abs(dot(n, normalize(cameraPosition - vWorld))), 2.0);
  vec3 col = mix(uDeep, uColor, 0.62 + fres * 0.38);
  gl_FragColor = vec4(col, 0.8);
}
`;

/** Angular radius of the primary lake's water cap. */
export const MAIN_LAKE_ANGULAR = 0.24;

export const waterTime = { value: 0 };

export function createWater(): Group {
  const group = new Group();
  group.name = "water";
  group.add(lake(SITES.lake.theta, SITES.lake.phi, MAIN_LAKE_ANGULAR, "#2f6d73", 10, 42, 0.16));
  group.add(lake(SITES.lake2.theta, SITES.lake2.phi, 0.125, "#2a6270"));
  group.add(lake(SITES.pool.theta, SITES.pool.phi, 0.055, "#3a7a78"));
  return group;
}

export function mainLakeWaterRadius(): number {
  return waterRadius(SITES.lake.theta, SITES.lake.phi, MAIN_LAKE_ANGULAR, 0.16);
}

export function updateWater(dt: number): void {
  waterTime.value += dt;
}

function lake(
  theta: number,
  phi: number,
  angular: number,
  hex: string,
  rings = 7,
  segs = 28,
  minAboveCenter = 0,
): Mesh {
  const radius = waterRadius(theta, phi, angular, minAboveCenter);
  const geo = sphericalCap(theta, phi, angular, radius, rings, segs);
  const mat = new ShaderMaterial({
    uniforms: {
      uTime: waterTime,
      uColor: { value: new Color(hex) },
      uDeep: { value: new Color("#1f6d78") },
    },
    vertexShader: waterVert,
    fragmentShader: waterFrag,
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
  });
  const mesh = new Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}

function waterRadius(theta: number, phi: number, angular: number, minAboveCenter = 0): number {
  const center = heightOffset(theta, phi);
  let shore = Infinity;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const t2 = theta + Math.cos(a) * angular;
    const p2 = phi + (Math.sin(a) * angular) / Math.max(0.3, Math.sin(theta));
    shore = Math.min(shore, heightOffset(t2, p2));
  }
  const filled = center + Math.max(0.12, (shore - center) * 0.58);
  let level = Math.min(shore - 0.06, filled, 0.4);
  if (minAboveCenter > 0) level = Math.max(level, Math.min(center + minAboveCenter, 0.35));
  return PLANET.radius + level;
}

function sphericalCap(
  theta: number,
  phi: number,
  angular: number,
  radius: number,
  rings: number,
  segs: number,
): BufferGeometry {
  const geo = new BufferGeometry();
  const positions: number[] = [];
  const indices: number[] = [];
  const center = sphToCart(1, theta, phi);
  const east = new Vector3()
    .crossVectors(Math.abs(center.y) < 0.85 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0), center)
    .normalize();
  const north = new Vector3().crossVectors(center, east).normalize();
  const tmp = new Vector3();

  const push = (sinA: number, angle: number) => {
    tmp
      .copy(center)
      .addScaledVector(east, Math.cos(angle) * sinA)
      .addScaledVector(north, Math.sin(angle) * sinA)
      .normalize()
      .multiplyScalar(radius);
    positions.push(tmp.x, tmp.y, tmp.z);
  };

  push(0, 0);
  for (let r = 1; r <= rings; r++) {
    const sinA = Math.sin(angular * (r / rings));
    for (let s = 0; s < segs; s++) push(sinA, (s / segs) * Math.PI * 2);
  }
  for (let s = 0; s < segs; s++) {
    const a = 1 + s;
    const b = 1 + ((s + 1) % segs);
    indices.push(0, b, a);
  }
  for (let r = 1; r < rings; r++) {
    const row = 1 + (r - 1) * segs;
    const next = 1 + r * segs;
    for (let s = 0; s < segs; s++) {
      const s2 = (s + 1) % segs;
      indices.push(row + s, next + s2, next + s);
      indices.push(row + s, row + s2, next + s2);
    }
  }
  geo.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
