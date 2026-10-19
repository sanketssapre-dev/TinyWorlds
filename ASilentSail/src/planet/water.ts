import { Color, FrontSide, Group, IcosahedronGeometry, Mesh, ShaderMaterial, Vector3 } from "three";
import { PLANET, WATER_LEVEL } from "../config";

const waterVert = `
uniform float uTime;
varying vec3 vWorld;

float swell(vec3 n, vec3 t, vec3 b, float time) {
  float w = 0.0;
  w += sin(dot(n, t) * 6.2 + time * 0.55) * 0.012;
  w += sin(dot(n, b) * 4.6 + time * 0.42) * 0.008;
  return w;
}

void main() {
  vec3 n = normalize(position);
  vec3 t = normalize(cross(n, vec3(0.0, 1.0, 0.001)));
  if (length(t) < 0.01) t = normalize(cross(n, vec3(1.0, 0.0, 0.0)));
  vec3 b = cross(n, t);
  vec3 p = position + n * swell(n, t, b, uTime);
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const waterFrag = `
uniform vec3 uColor;
uniform vec3 uDeep;
uniform vec3 uLampPos[10];
uniform float uLampInt[10];
uniform float uColumn;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vWorld);
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float facing = max(dot(n, viewDir), 0.0);
  float fres = pow(1.0 - facing, 3.4);
  float H = uColumn;
  float L = H / max(facing, 0.12);
  float nPow = 8.0;
  float rhoMax = 1.05;
  float t = min(L, H) / H;
  float od = rhoMax * H * pow(t, nPow + 1.0) / (nPow + 1.0);
  if (L > H) od += rhoMax * (L - H);
  float absorb = 1.0 - exp(-od);
  vec3 col = mix(uColor, uDeep, absorb);
  col += vec3(0.035, 0.055, 0.06) * fres;
  vec3 lamps = vec3(0.0);
  for (int i = 0; i < 10; i++) {
    vec3 toLamp = uLampPos[i] - vWorld;
    float dist = length(toLamp) / 3.0;
    float range = pow(max(0.0, 1.0 - dist / 33.0), 1.4);
    float atten = 1.0 / max(dist * dist, 48.0);
    float surfaceBleed = 1.0 - absorb;
    lamps += vec3(1.0, 0.93, 0.74) * uLampInt[i] * range * atten * 1.15 * surfaceBleed;
  }
  col += lamps;
  float alpha = mix(0.04, 0.96, absorb) + fres * 0.04;
  gl_FragColor = vec4(col, min(0.98, alpha));
}
`;

export const waterTime = { value: 0 };

const lampPositions = Array.from({ length: 10 }, () => new Vector3());
const lampIntensities = new Array<number>(10).fill(0);

const nScratch = new Vector3();
const tScratch = new Vector3();
const bScratch = new Vector3();

export function waveHeightAt(surfaceNormal: Vector3, time: number): number {
  const n = nScratch.copy(surfaceNormal).normalize();
  tScratch.crossVectors(n, new Vector3(0, 1, 0.001));
  if (tScratch.lengthSq() < 1e-6) tScratch.crossVectors(n, new Vector3(1, 0, 0));
  tScratch.normalize();
  bScratch.crossVectors(n, tScratch).normalize();
  return (
    Math.sin(n.dot(tScratch) * 6.2 + time * 0.55) * 0.012 +
    Math.sin(n.dot(bScratch) * 4.6 + time * 0.42) * 0.008
  );
}

export function createWater(): Group {
  const group = new Group();
  group.name = "water";
  const geo = new IcosahedronGeometry(PLANET.radius + WATER_LEVEL, 72);
  geo.deleteAttribute("uv");
  const mat = new ShaderMaterial({
    uniforms: {
      uTime: waterTime,
      uColor: { value: new Color("#3f8f98") },
      uDeep: { value: new Color("#163844") },
      uLampPos: { value: lampPositions },
      uLampInt: { value: lampIntensities },
      uColumn: { value: 2.45 },
    },
    vertexShader: waterVert,
    fragmentShader: waterFrag,
    transparent: true,
    side: FrontSide,
    depthWrite: true,
    depthTest: true,
  });
  const mesh = new Mesh(geo, mat);
  mesh.name = "ocean";
  mesh.renderOrder = 6;
  group.add(mesh);
  return group;
}

export function updateWater(dt: number): void {
  waterTime.value += dt;
}

export function setYachtLamps(worldPositions: Vector3[], intensities: number[]): void {
  for (let i = 0; i < 10; i++) {
    if (worldPositions[i]) lampPositions[i].copy(worldPositions[i]);
    else lampPositions[i].set(0, 0, 0);
    lampIntensities[i] = intensities[i] ?? 0;
  }
}

export function waterSurfaceRadius(): number {
  return PLANET.radius + WATER_LEVEL;
}
