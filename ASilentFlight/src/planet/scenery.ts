import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  DoubleSide,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Quaternion,
  SphereGeometry,
  CircleGeometry,
  ExtrudeGeometry,
  Shape,
  TorusGeometry,
  Vector3,
} from "three";
import { PLANET } from "../config";
import { fbm3, hash01 } from "../math/noise";
import { angularDistance, cartToSph, sphToCart } from "../math/sphere";
import { FlightPath } from "../flight/path";
import { SITES } from "./features";
import { heightOffset, slopeMagnitude, surfaceRadius } from "./height";
import { PlanetSurface } from "./surface";
import { thinCrowdedTrees } from "./treeSpacing";
import type { TreeSite } from "./treeSpacing";

const dummy = new Object3D();
const seatPos = new Vector3();
const seatQuat = new Quaternion();
const seatScale = new Vector3();
const seatMat = new Matrix4();

const GROVES: { theta: number; phi: number; reach: number; count: number; lakeside?: boolean }[] = [
  { theta: SITES.ancientTree.theta, phi: SITES.ancientTree.phi, reach: 0.2, count: 150 },
  { theta: 1.52, phi: 2.12, reach: 0.18, count: 120 },
  { theta: 1.28, phi: 5.42, reach: 0.17, count: 110 },
  { theta: 1.7, phi: 0.58, reach: 0.16, count: 100 },
  { theta: 1.34, phi: 4.78, reach: 0.15, count: 90 },
  { theta: 1.62, phi: 6.2, reach: 0.14, count: 80 },
  { theta: 1.54, phi: 2.64, reach: 0.3, count: 200 },
  { theta: 1.71, phi: 5.14, reach: 0.28, count: 200 },
  { theta: 0.96, phi: 0.76, reach: 0.28, count: 220 },
  { theta: 1.9, phi: 3.5, reach: 0.3, count: 210 },
  { theta: 0.84, phi: SITES.lake.phi, reach: 0.18, count: 42, lakeside: true },
  { theta: 2.0, phi: SITES.lake.phi, reach: 0.18, count: 42, lakeside: true },
  { theta: 1.36, phi: SITES.lake2.phi, reach: 0.12, count: 36, lakeside: true },
  { theta: 2.0, phi: SITES.lake2.phi, reach: 0.12, count: 36, lakeside: true },
];
const GROVE_TREE_SCALE = 2;
// Increasing each existing grove's radius by sqrt(2) doubles its nominal footprint.
const GROVE_COVERAGE_SCALE = Math.SQRT2;
/** Trunk thickness as a fraction of the original: 10% off the diameter. */
const TRUNK_DIAMETER_SCALE = 0.9;
const WOODLAND_CLUSTER_SIZE = 4;
const WOODLAND_CLUSTER_SPACING = 0.95;
const VILLAGE_SLICE_COUNT = 6;
const VILLAGE_SLICE_WIDTH = (Math.PI * 2) / VILLAGE_SLICE_COUNT;

type VillageLayout = {
  farms: readonly number[];
  sheepSlice: number | null;
  windmillSlice: number | null;
};

const VILLAGE_LAYOUTS: readonly VillageLayout[] = [
  { farms: [3, 4], sheepSlice: 2, windmillSlice: null },
  { farms: [3, 4], sheepSlice: null, windmillSlice: 2 },
  { farms: [2, 3], sheepSlice: null, windmillSlice: 5 },
  { farms: [], sheepSlice: null, windmillSlice: null },
  { farms: [2, 3], sheepSlice: 5, windmillSlice: null },
];

type Settlement = {
  theta: number;
  phi: number;
  rings: { count: number; rad: number }[];
  fires: number;
};

/** Two-storey cottages and a windmill. Not the airstrip village. */
const STACKED_HOUSES: readonly (readonly number[])[] = [[], [6, 10, 12], [8, 10, 12], [], []];
const MILL_YAW: readonly (number | null)[] = [null, 2.8, 0.2, null, null];

/** Short packed-earth strip on the northeast side of this village, outside the fence. */
const LANDING_VILLAGE = 3;
const ACTIVE_VILLAGES = new Set([0, 2, LANDING_VILLAGE]);
const LANDING_ANGLE = Math.PI * 0.75;
const STRIP_CLEARANCE = 0.034;
const STRIP_SCALE = 4;
const STRIP_LENGTH = 1.85 * STRIP_SCALE;
const STRIP_WIDTH = 0.36 * STRIP_SCALE;
const TERMINAL_ALONG = -0.2;
const TERMINAL_SIDE = STRIP_WIDTH / 2 + 0.55;
const TOWER_ALONG = 0.78;
const LANDING_TREE_CLEARANCE = 0.95;

const SETTLEMENTS: Settlement[] = [
  {
    theta: SITES.village.theta,
    phi: SITES.village.phi,
    rings: [
      { count: 1, rad: 0 },
      { count: 6, rad: 0.03 },
      { count: 8, rad: 0.052 },
    ],
    fires: 3,
  },
  {
    theta: 1.36,
    phi: 1.82,
    rings: [
      { count: 1, rad: 0 },
      { count: 5, rad: 0.028 },
      { count: 7, rad: 0.048 },
    ],
    fires: 3,
  },
  {
    theta: 1.55,
    phi: 3.15,
    rings: [
      { count: 1, rad: 0 },
      { count: 6, rad: 0.03 },
      { count: 6, rad: 0.05 },
    ],
    fires: 2,
  },
  {
    theta: 1.36,
    phi: 4.62,
    rings: [
      { count: 1, rad: 0 },
      { count: 7, rad: 0.034 },
    ],
    fires: 2,
  },
  {
    theta: 1.52,
    phi: 5.58,
    rings: [
      { count: 1, rad: 0 },
      { count: 5, rad: 0.03 },
      { count: 8, rad: 0.05 },
    ],
    fires: 3,
  },
];

type Ang = { theta: number; phi: number };

/** Directions into each village. These only open the fence gates. */
const ROADS: Ang[][] = [
  [
    { theta: SETTLEMENTS[0].theta, phi: SETTLEMENTS[0].phi },
    { theta: 1.02, phi: 0.55 },
    { theta: 0.96, phi: 1.05 },
    { theta: 1.08, phi: 1.5 },
    { theta: SETTLEMENTS[1].theta, phi: SETTLEMENTS[1].phi },
  ],
  [
    { theta: SETTLEMENTS[1].theta, phi: SETTLEMENTS[1].phi },
    { theta: 1.42, phi: 2.25 },
    { theta: 1.5, phi: 2.7 },
    { theta: SETTLEMENTS[2].theta, phi: SETTLEMENTS[2].phi },
  ],
  [
    { theta: SETTLEMENTS[2].theta, phi: SETTLEMENTS[2].phi },
    { theta: 1.62, phi: 3.55 },
    { theta: 1.38, phi: 4.15 },
    { theta: 1.38, phi: 4.4 },
    { theta: SETTLEMENTS[3].theta, phi: SETTLEMENTS[3].phi },
  ],
  [
    { theta: SETTLEMENTS[3].theta, phi: SETTLEMENTS[3].phi },
    { theta: 1.44, phi: 5.1 },
    { theta: SETTLEMENTS[4].theta, phi: SETTLEMENTS[4].phi },
  ],
  [
    { theta: SETTLEMENTS[4].theta, phi: SETTLEMENTS[4].phi },
    { theta: 1.58, phi: 6.05 },
    { theta: 1.55, phi: Math.PI * 2 + 0.05 },
    { theta: 1.32, phi: Math.PI * 2 + 0.16 },
    { theta: SETTLEMENTS[0].theta, phi: Math.PI * 2 + SETTLEMENTS[0].phi },
  ],
];

function outerRadius(site: Settlement): number {
  return site.rings.reduce((max, ring) => Math.max(max, ring.rad), 0);
}

function fenceRadius(site: Settlement): number {
  return outerRadius(site) + 0.11;
}

function signedDeltaPhi(from: number, to: number): number {
  const turn = Math.PI * 2;
  let d = ((to - from) % turn + turn) % turn;
  if (d > Math.PI) d -= turn;
  return d;
}

export const sceneryTime = { value: 0 };

type FlickerNode = { obj: Object3D; phase: number };
type FireNode = { light: PointLight; phase: number; base: number };
type SheepActor = {
  obj: Group;
  villageTheta: number;
  villagePhi: number;
  sliceCenter: number;
  lane: number;
  phase: number;
  legs: Object3D[];
};

type LifeActors = {
  crown: Object3D | null;
  castleFlames: Object3D | null;
  castleFire: PointLight | null;
  flames: FlickerNode[];
  fires: FireNode[];
  smokes: Object3D[];
  sails: FlickerNode[];
  sheep: SheepActor[];
  lamps: Mesh[];
};

function emptyLife(): LifeActors {
  return {
    crown: null,
    castleFlames: null,
    castleFire: null,
    flames: [],
    fires: [],
    smokes: [],
    sails: [],
    sheep: [],
    lamps: [],
  };
}

let life = emptyLife();

function swayFoliage(mat: MeshStandardMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sceneryTime;
    shader.vertexShader =
      "uniform float uTime;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         float tip = max(position.y, 0.0);
         transformed.x += sin(uTime * 0.9 + instanceMatrix[3].x) * tip * 0.08;
         transformed.z += cos(uTime * 0.7 + instanceMatrix[3].z) * tip * 0.08;`,
      );
  };
}

export function createScenery(path: FlightPath): Group {
  life = emptyLife();
  const root = new Group();
  root.name = "scenery";
  root.userData.life = life;
  root.add(createTrees(path));
  root.add(createRocks(path));
  root.add(createGrassTufts(path));
  root.add(createVillage());
  root.add(createLandmarks());
  root.add(createCrystals());
  return root;
}

function placeOnSurface(theta: number, phi: number, extra = 0): { pos: Vector3; up: Vector3 } {
  const r = surfaceRadius(theta, phi) + extra;
  const pos = sphToCart(r, theta, phi);
  const up = pos.clone().normalize();
  return { pos, up };
}

function orient(obj: Object3D, pos: Vector3, up: Vector3, yaw = 0): void {
  obj.position.copy(pos);
  obj.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), up);
  if (yaw) obj.rotateY(yaw);
}

function tooCloseToFlightPath(pos: Vector3, path: FlightPath, minDist: number): boolean {
  let best = Infinity;
  const step = 8;
  for (let i = 0; i < path.samples.length; i += step) {
    const d = pos.distanceToSquared(path.samples[i].position);
    if (d < best) best = d;
  }
  return best < minDist * minDist;
}

function nearWater(theta: number, phi: number): boolean {
  return (
    angularDistance(theta, phi, SITES.lake.theta, SITES.lake.phi) < 0.27 ||
    angularDistance(theta, phi, SITES.lake2.theta, SITES.lake2.phi) < 0.13 ||
    angularDistance(theta, phi, SITES.pool.theta, SITES.pool.phi) < 0.08
  );
}

const LAKESIDE_GROVES = [
  ...[0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].map((angle) => ({
    ...ringPoint(SITES.lake.theta, SITES.lake.phi, 0.31, angle),
    reach: 0.11,
    count: 54,
    lakeside: true,
  })),
  ...[0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].map((angle) => ({
    ...ringPoint(SITES.lake2.theta, SITES.lake2.phi, 0.2, angle),
    reach: 0.085,
    count: 46,
    lakeside: true,
  })),
];

function insidePaddock(theta: number, phi: number): boolean {
  return SETTLEMENTS.some(
    (site, index) =>
      ACTIVE_VILLAGES.has(index) &&
      angularDistance(theta, phi, site.theta, site.phi) < fenceRadius(site) + 0.01,
  );
}

function nearLandingStrip(theta: number, phi: number): boolean {
  const site = SETTLEMENTS[LANDING_VILLAGE];
  const dt = theta - site.theta;
  const dp = phi - site.phi;
  const tangent = LANDING_ANGLE + Math.PI / 2;
  const along = dt * Math.cos(tangent) + dp * Math.sin(tangent);
  const radial = dt * Math.cos(LANDING_ANGLE) + dp * Math.sin(LANDING_ANGLE);
  const center = fenceRadius(site) + STRIP_CLEARANCE;
  const runway =
    Math.abs(along) < (STRIP_LENGTH / 2 + LANDING_TREE_CLEARANCE) / PLANET.radius &&
    Math.abs(radial - center) < (STRIP_WIDTH / 2 + LANDING_TREE_CLEARANCE) / PLANET.radius;
  const terminal =
    Math.abs(along - TERMINAL_ALONG / PLANET.radius) <
      (0.55 + LANDING_TREE_CLEARANCE) / PLANET.radius &&
    Math.abs(radial - (center + TERMINAL_SIDE / PLANET.radius)) <
      (0.45 + LANDING_TREE_CLEARANCE) / PLANET.radius;
  const tower =
    Math.abs(along - (TERMINAL_ALONG + TOWER_ALONG) / PLANET.radius) <
      (0.42 + LANDING_TREE_CLEARANCE) / PLANET.radius &&
    Math.abs(radial - (center + TERMINAL_SIDE / PLANET.radius)) <
      (0.4 + LANDING_TREE_CLEARANCE) / PLANET.radius;
  return runway || terminal || tower;
}

function canPlantTree(
  theta: number,
  phi: number,
  path: FlightPath,
  lakeside = false,
): boolean {
  const h = heightOffset(theta, phi);
  if (h < (lakeside ? -0.85 : -0.05) || h > 6.4) return false;
  if (slopeMagnitude(theta, phi) > (lakeside ? 9 : 6.5)) return false;
  if (!lakeside && nearWater(theta, phi)) return false;
  if (insidePaddock(theta, phi)) return false;
  if (nearLandingStrip(theta, phi)) return false;
  const pos = sphToCart(surfaceRadius(theta, phi), theta, phi);
  if (tooCloseToFlightPath(pos, path, 1.4)) return false;
  return true;
}

const treeUp = new Vector3(0, 1, 0);
const treeShift = new Vector3();

/** Kind 0 round broadleaf, 1 taller pine, 2 slim birch. */
function treeKind(a: number, b: number, c: number, salt: number): number {
  const roll = hash01(a, b, c, salt);
  if (roll < 0.4) return 0;
  if (roll < 0.74) return 1;
  return 2;
}

/**
 * Where every tree in the world is planted, before any of them are nudged.
 *
 * Kept apart from the meshes so the planting can be reasoned about — and
 * measured — on its own.
 */
export function planTreeSites(path: FlightPath): TreeSite[] {
  const sites: TreeSite[] = [];

  for (const grove of [...GROVES, ...LAKESIDE_GROVES]) {
    for (let i = 0; i < grove.count * GROVE_TREE_SCALE; i++) {
      const ang = Math.sqrt(hash01(i, grove.theta, 1, 3)) * grove.reach * GROVE_COVERAGE_SCALE;
      const rot = hash01(i, grove.phi, 2, 5) * Math.PI * 2;
      const theta = grove.theta + Math.cos(rot) * ang;
      const phi = grove.phi + (Math.sin(rot) * ang) / Math.max(0.35, Math.sin(grove.theta));
      if (!canPlantTree(theta, phi, path, grove.lakeside)) continue;
      const snowy = heightOffset(theta, phi) > 5.7;
      const kind = snowy ? 1 : treeKind(theta, phi, i, 8);
      const scale = (0.95 + hash01(theta, phi, i, 12) * 1.15) * 1.3;
      sites.push({ theta, phi, kind, scale, snowy });
    }
  }

  const n = 420;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * golden;
    const x = Math.cos(phi) * r;
    const z = Math.sin(phi) * r;
    const theta = Math.acos(Math.min(1, Math.max(-1, y)));
    const az = Math.atan2(z, x);
    const wood =
      fbm3(x * 2.4, y * 2.4, z * 2.4, 3, 2, 0.5, 29) > 0.22 && hash01(x, y, z, 4) > 0.55;
    if (!wood || !canPlantTree(theta, az, path)) continue;
    const cluster: TreeSite[] = [];
    for (let clusterIndex = 0; clusterIndex < WOODLAND_CLUSTER_SIZE; clusterIndex++) {
      const angle = (clusterIndex * Math.PI * 2) / (WOODLAND_CLUSTER_SIZE - 1);
      const distance =
        clusterIndex === 0
          ? 0
          : WOODLAND_CLUSTER_SPACING * (0.85 + hash01(i, clusterIndex, 31, 32) * 0.3);
      const clusterTheta = theta + (Math.cos(angle) * distance) / PLANET.radius;
      const clusterPhi =
        az + (Math.sin(angle) * distance) / (PLANET.radius * Math.max(0.35, Math.sin(theta)));
      if (!canPlantTree(clusterTheta, clusterPhi, path)) continue;
      const snowy = heightOffset(clusterTheta, clusterPhi) > 5.7;
      const kind = snowy ? 1 : treeKind(x, y, z, 8 + clusterIndex);
      const scale = (0.75 + hash01(x, y, z, 12 + clusterIndex) * 0.7) * 1.3;
      cluster.push({ theta: clusterTheta, phi: clusterPhi, kind, scale, snowy });
    }
    if (cluster.length >= 3) sites.push(...cluster);
  }

  for (const peak of [SITES.peakNorth, SITES.peakWest, SITES.peakEast]) {
    let planted = 0;
    for (const radius of [0.12, 0.18, 0.24]) {
      for (let i = 0; i < 8 && planted < 5; i++) {
        const angle = (i / 8) * Math.PI * 2 + radius * 9;
        const theta = peak.theta + Math.cos(angle) * radius;
        const phi = peak.phi + (Math.sin(angle) * radius) / Math.max(0.35, Math.sin(peak.theta));
        const height = heightOffset(theta, phi);
        if (height <= 5.7 || height > 8.8 || !canPlantTree(theta, phi, path)) continue;
        sites.push({
          theta,
          phi,
          kind: 1,
          scale: (0.85 + hash01(theta, phi, i, 71) * 0.45) * 1.3,
          snowy: true,
        });
        planted++;
      }
    }
  }

  return sites;
}

function createTrees(path: FlightPath): Group {
  const group = new Group();
  const trunkGeo = new CylinderGeometry(
    0.048 * TRUNK_DIAMETER_SCALE,
    0.102 * TRUNK_DIAMETER_SCALE,
    0.58,
    6,
  );
  trunkGeo.translate(0, 0.29, 0);
  const birchTrunkGeo = new CylinderGeometry(
    0.03 * TRUNK_DIAMETER_SCALE,
    0.048 * TRUNK_DIAMETER_SCALE,
    0.7,
    6,
  );
  birchTrunkGeo.translate(0, 0.35, 0);
  const canopyGeo = new SphereGeometry(0.42, 7, 6);
  const pineGeo = new ConeGeometry(0.29, 1.08, 7);
  const trunkMat = new MeshStandardMaterial({ color: "#4a3428", roughness: 0.92 });
  const birchTrunkMat = new MeshStandardMaterial({ color: "#cbb89a", roughness: 0.84 });
  const leafA = new MeshStandardMaterial({ color: "#2f5a38", roughness: 0.78 });
  const leafB = new MeshStandardMaterial({ color: "#3f6b3c", roughness: 0.8 });
  const leafC = new MeshStandardMaterial({ color: "#5a7040", roughness: 0.82 });
  const boughMat = new MeshStandardMaterial({ color: "#2a4e36", roughness: 0.8 });
  const pineMat = new MeshStandardMaterial({ color: "#234a36", roughness: 0.76 });
  const birchLeaf = new MeshStandardMaterial({ color: "#8aa86e", roughness: 0.78 });
  for (const mat of [leafA, leafB, leafC, boughMat, pineMat, birchLeaf]) swayFoliage(mat);

  // Sites are planned first, then the trees sitting practically on top of one
  // another are dropped. Everything else is planted exactly where it was
  // planned, so each grove keeps its shape.
  const candidates = thinCrowdedTrees(planTreeSites(path));

  const trunks = new InstancedMesh(trunkGeo, trunkMat, candidates.length);
  const birchTrunks = new InstancedMesh(birchTrunkGeo, birchTrunkMat, candidates.length);
  const canopy1 = new InstancedMesh(canopyGeo, leafA, candidates.length);
  const canopy2 = new InstancedMesh(canopyGeo, leafB, candidates.length);
  const boughs = new InstancedMesh(canopyGeo, boughMat, candidates.length);
  const pines = new InstancedMesh(pineGeo, pineMat, candidates.length);
  const snowCaps = new InstancedMesh(
    new ConeGeometry(0.2, 0.4, 7),
    new MeshStandardMaterial({ color: "#edf4f5", roughness: 0.92 }),
    candidates.length,
  );
  const gold = new InstancedMesh(canopyGeo, leafC, candidates.length);
  const birchLeaves = new InstancedMesh(canopyGeo, birchLeaf, candidates.length);
  for (const m of [
    trunks,
    birchTrunks,
    canopy1,
    canopy2,
    boughs,
    pines,
    snowCaps,
    gold,
    birchLeaves,
  ]) {
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.castShadow = true;
    m.receiveShadow = true;
  }

  const plantMatrix = (
    pos: Vector3,
    up: Vector3,
    sx: number,
    sy: number,
    lift: number,
    ox: number,
    oz: number,
  ): void => {
    dummy.quaternion.setFromUnitVectors(treeUp, up);
    dummy.position.copy(pos);
    if (lift !== 0 || ox !== 0 || oz !== 0) {
      treeShift.set(ox, lift, oz).applyQuaternion(dummy.quaternion);
      dummy.position.add(treeShift);
    }
    dummy.scale.set(sx, sy, sx);
    dummy.updateMatrix();
  };

  let t = 0,
    c1 = 0,
    c2 = 0,
    p = 0,
    snow = 0,
    g = 0,
    bough = 0,
    bt = 0,
    bl = 0;
  for (const c of candidates) {
    const { pos, up } = placeOnSurface(c.theta, c.phi, 0);
    const s = c.scale;
    const yaw = hash01(c.theta, c.phi, 4, 17) * Math.PI * 2;
    if (c.kind === 2) {
      plantMatrix(pos, up, s * 1.105, s * 1.3, 0, 0, 0);
      birchTrunks.setMatrixAt(bt++, dummy.matrix);
      plantMatrix(pos, up, s * 0.936, s * 0.936, 0.62 * s * 1.3, 0, 0);
      birchLeaves.setMatrixAt(bl++, dummy.matrix);
      continue;
    }
    if (c.kind === 1) {
      const trunkHeight = 0.95 + hash01(c.theta, c.phi, 3, 23) * 0.35;
      plantMatrix(pos, up, s * 0.91, s * trunkHeight * 1.3, 0, 0, 0);
      trunks.setMatrixAt(t++, dummy.matrix);
      plantMatrix(pos, up, s * 1.17, s * 0.9 * 1.3, 0.92 * s * 1.3, 0, 0);
      pines.setMatrixAt(p++, dummy.matrix);
      if (c.snowy) {
        plantMatrix(pos, up, s * 0.624, s * 0.42 * 1.3, 1.24 * s * 1.3, 0, 0);
        snowCaps.setMatrixAt(snow++, dummy.matrix);
      }
      continue;
    }
    plantMatrix(pos, up, s * 1.3, s * 1.3, 0, 0, 0);
    trunks.setMatrixAt(t++, dummy.matrix);
    const goldTree = hash01(c.theta, c.phi, 1, 21) > 0.82;
    const high = hash01(c.theta, c.phi, 2, 22) > 0.5;
    const crown = s * (high ? 0.92 : 1) * 1.3;
    plantMatrix(pos, up, crown, crown, (high ? 0.66 : 0.54) * s * 1.3, 0, 0);
    if (goldTree) gold.setMatrixAt(g++, dummy.matrix);
    else if (high) canopy2.setMatrixAt(c2++, dummy.matrix);
    else canopy1.setMatrixAt(c1++, dummy.matrix);
    plantMatrix(
      pos,
      up,
      s * 0.715,
      s * 0.715,
      0.34 * s * 1.3,
      Math.cos(yaw) * 0.24 * s * 1.3,
      Math.sin(yaw) * 0.16 * s * 1.3,
    );
    boughs.setMatrixAt(bough++, dummy.matrix);
  }
  trunks.count = t;
  birchTrunks.count = bt;
  canopy1.count = c1;
  canopy2.count = c2;
  boughs.count = bough;
  pines.count = p;
  snowCaps.count = snow;
  gold.count = g;
  birchLeaves.count = bl;
  group.add(trunks, birchTrunks, canopy1, canopy2, boughs, pines, snowCaps, gold, birchLeaves);

  group.add(createAncientTree());
  return group;
}

function createAncientTree(): Group {
  const g = new Group();
  const { pos, up } = placeOnSurface(SITES.ancientTree.theta, SITES.ancientTree.phi, 0);
  const trunk = new Mesh(
    new CylinderGeometry(0.22, 0.38, 1.8, 8),
    new MeshStandardMaterial({ color: "#3d2a22", roughness: 0.95 }),
  );
  trunk.castShadow = true;
  const crown = new Mesh(
    new SphereGeometry(1.15, 10, 8),
    new MeshStandardMaterial({ color: "#2a5538", roughness: 0.72 }),
  );
  crown.position.y = 1.55;
  crown.castShadow = true;
  crown.name = "ancient-crown";
  life.crown = crown;
  const lantern = new Mesh(
    new SphereGeometry(0.08, 8, 8),
    new MeshStandardMaterial({
      color: "#f0d48a",
      emissive: "#e6b85c",
      emissiveIntensity: 1.4,
    }),
  );
  lantern.position.set(0.55, 0.7, 0.1);
  g.add(trunk, crown, lantern);
  orient(g, pos, up, 0.4);
  const light = new PointLight("#f0c56c", 1.4, 8, 2);
  light.position.set(0, 1.35, 0);
  g.add(light);
  return g;
}

function createRocks(path: FlightPath): InstancedMesh {
  const geo = new SphereGeometry(0.28, 5, 4);
  const mat = new MeshStandardMaterial({ color: "#6b6358", roughness: 0.95, flatShading: true });
  const items: { theta: number; phi: number; s: number }[] = [];
  for (let i = 0; i < 220; i++) {
    const theta = 0.25 + hash01(i, 2, 3, 40) * 2.6;
    const phi = hash01(i, 5, 7, 41) * Math.PI * 2;
    const h = heightOffset(theta, phi);
    if (h < -0.4 || nearWater(theta, phi) || nearLandingStrip(theta, phi)) continue;
    const pos = sphToCart(surfaceRadius(theta, phi), theta, phi);
    if (tooCloseToFlightPath(pos, path, 0.7)) continue;
    items.push({ theta, phi, s: 0.5 + hash01(i, 9, 1, 42) * 1.6 });
  }
  const mesh = new InstancedMesh(geo, mat, Math.max(1, items.length));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  items.forEach((it, i) => {
    const { pos, up } = placeOnSurface(it.theta, it.phi, 0.02);
    dummy.position.copy(pos);
    dummy.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), up);
    dummy.scale.set(it.s, it.s * 0.7, it.s * 0.85);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.count = items.length;
  return mesh;
}

function createGrassTufts(path: FlightPath): InstancedMesh {
  const geo = new ConeGeometry(0.07, 0.22, 4);
  geo.translate(0, 0.11, 0);
  const mat = new MeshStandardMaterial({ color: "#4e6a3d", roughness: 0.9 });
  const items: { theta: number; phi: number }[] = [];
  for (let i = 0; i < 700; i++) {
    const theta = 0.4 + hash01(i, 1, 8, 50) * 2.3;
    const phi = hash01(i, 3, 9, 51) * Math.PI * 2;
    const h = heightOffset(theta, phi);
    const slope = slopeMagnitude(theta, phi);
    if (h < 0.05 || h > 6.2 || slope > 6 || nearWater(theta, phi) || nearLandingStrip(theta, phi)) continue;
    const pos = sphToCart(surfaceRadius(theta, phi), theta, phi);
    if (tooCloseToFlightPath(pos, path, 0.55)) continue;
    items.push({ theta, phi });
  }
  const mesh = new InstancedMesh(geo, mat, Math.max(1, items.length));
  items.forEach((it, i) => {
    const { pos, up } = placeOnSurface(it.theta, it.phi, 0.05);
    dummy.position.copy(pos);
    dummy.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), up);
    dummy.scale.setScalar(0.7 + hash01(it.theta, it.phi, 1, 52) * 0.8);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.count = items.length;
  return mesh;
}

function cottage(w: number, d: number, h: number, roof: string, floors = 1): Group {
  const g = new Group();
  const wallH = h * floors;
  const foundationMat = new MeshStandardMaterial({ color: "#897d6c", roughness: 0.96 });
  const foundation = new Mesh(
    new BoxGeometry(w * 1.08, 0.18, d * 1.08),
    foundationMat,
  );
  foundation.position.y = 0.015;
  foundation.userData.role = "cottage-foundation";
  g.add(foundation);
  for (const x of [-0.42, 0.42]) {
    for (const z of [-0.4, 0.4]) {
      const footing = new Mesh(new BoxGeometry(w * 0.11, 0.48, d * 0.12), foundationMat);
      footing.position.set(w * x, -0.16, d * z);
      footing.userData.role = "cottage-foundation";
      g.add(footing);
    }
  }
  const wall = new Mesh(
    new BoxGeometry(w, wallH, d),
    new MeshStandardMaterial({ color: "#d8c7a6", roughness: 0.88 }),
  );
  wall.position.y = wallH / 2;
  wall.castShadow = true;
  wall.userData.role = "cottage-wall";
  const roofMesh = new Mesh(
    new ConeGeometry(Math.max(w, d) * 0.72, h * 0.7, 4),
    new MeshStandardMaterial({ color: roof, roughness: 0.78 }),
  );
  roofMesh.position.y = wallH + h * 0.22;
  roofMesh.rotation.y = Math.PI / 4;
  roofMesh.castShadow = true;
  roofMesh.userData.role = "cottage-roof";
  g.add(wall, roofMesh);
  const pane = new MeshStandardMaterial({
    color: "#f6d789",
    emissive: "#f0c35c",
    emissiveIntensity: 1.1,
  });
  for (let floor = 0; floor < floors; floor++) {
    const window = new Mesh(new BoxGeometry(w * 0.18, h * 0.22, 0.04), pane);
    window.position.set(0, h * floor + h * 0.52, d / 2 + 0.02);
    window.userData.role = "cottage-window";
    g.add(window);
  }
  if (floors > 1) {
    const ledge = new Mesh(
      new BoxGeometry(w * 1.04, 0.028, d * 1.04),
      new MeshStandardMaterial({ color: "#c3b08a", roughness: 0.9 }),
    );
    ledge.position.y = h;
    g.add(ledge);
  }
  return g;
}

function createVillage(): Group {
  const root = new Group();
  root.name = "villages";
  const posts: Matrix4[] = [];
  const rails: Matrix4[] = [];
  SETTLEMENTS.forEach((site, index) => {
    if (ACTIVE_VILLAGES.has(index)) plantSettlement(root, site, index, posts, rails);
  });
  const postMesh = fenceInstances(fencePostGeo, posts, true, "fence-posts");
  const railMesh = fenceInstances(fenceRailGeo, rails, false, "fence-rails");
  if (postMesh) root.add(postMesh);
  if (railMesh) root.add(railMesh);
  return root;
}

function fenceInstances(
  geo: BufferGeometry,
  matrices: Matrix4[],
  castShadow: boolean,
  name: string,
): InstancedMesh | null {
  if (matrices.length === 0) return null;
  const mesh = new InstancedMesh(geo, fenceWood, matrices.length);
  mesh.name = name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = false;
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

const fenceWood = new MeshStandardMaterial({ color: "#6d4c32", roughness: 0.9 });
const fencePostGeo = new CylinderGeometry(0.05, 0.06, 1, 6);
const fenceRailGeo = new BoxGeometry(0.05, 0.04, 1);
const fireWood = new MeshStandardMaterial({ color: "#4a3424", roughness: 0.9 });
const farmSoil = new MeshStandardMaterial({
  color: "#75502d",
  roughness: 0.98,
  side: DoubleSide,
});
const paddyWaterMat = new MeshStandardMaterial({
  color: "#a99b78",
  roughness: 0.38,
  metalness: 0.08,
  side: DoubleSide,
});
const wheatStemMat = new MeshStandardMaterial({ color: "#c29a43", roughness: 0.86 });
const wheatHeadMat = new MeshStandardMaterial({
  color: "#f0c65a",
  roughness: 0.72,
  emissive: "#805512",
  emissiveIntensity: 0.14,
});
const wheatStemGeo = new CylinderGeometry(0.009, 0.014, 1, 5);
wheatStemGeo.translate(0, 0.5, 0);
const wheatHeadGeo = new ConeGeometry(0.038, 0.16, 5);
const wheatDummy = new Object3D();
const sheepWool = new MeshStandardMaterial({ color: "#e9e1cf", roughness: 0.96 });
const sheepFace = new MeshStandardMaterial({ color: "#6c5947", roughness: 0.92 });
const sheepLeg = new MeshStandardMaterial({ color: "#594938", roughness: 0.92 });
const fireFlame = new MeshStandardMaterial({
  color: "#ffb15a",
  emissive: "#ff7418",
  emissiveIntensity: 1.8,
  roughness: 0.4,
});
const fireHot = fireFlame.clone();
fireHot.emissive.set("#ffe08a");
const pathDirt = new MeshStandardMaterial({ color: "#8a7354", roughness: 0.95 });
const stripDirt = new MeshStandardMaterial({ color: "#5a6168", roughness: 0.74, metalness: 0.06 });
const stripMark = new MeshStandardMaterial({ color: "#d9d3c4", roughness: 0.88 });
const runwayPaint = new MeshStandardMaterial({ color: "#f4f6f4", roughness: 0.55 });
const runwayPost = new MeshStandardMaterial({ color: "#3a4148", roughness: 0.5, metalness: 0.28 });
/** Key light sits at (90, 55, 35); villages on that hemisphere stay unlit. */
const SUN_DIRECTION = new Vector3(90, 55, 35).normalize();
const sockMat = new MeshStandardMaterial({ color: "#c4543a", roughness: 0.74 });
const millCap = new MeshStandardMaterial({ color: "#3f6570", roughness: 0.76 });
const sailCloth = new MeshStandardMaterial({ color: "#eadcbf", roughness: 0.82 });
const lampMat = new MeshStandardMaterial({
  color: "#f3d27a",
  emissive: "#e8b85a",
  emissiveIntensity: 1.4,
});
const wellMat = new MeshStandardMaterial({ color: "#6a6560", roughness: 0.9 });
const ahead = new Vector3();
const yawQuat = new Quaternion();

function yawToward(up: Vector3, forward: Vector3): number {
  ahead.copy(forward);
  ahead.addScaledVector(up, -ahead.dot(up));
  if (ahead.lengthSq() < 1e-8) return 0;
  yawQuat.setFromUnitVectors(new Vector3(0, 1, 0), up);
  ahead.normalize().applyQuaternion(yawQuat.invert());
  return Math.atan2(ahead.x, ahead.z);
}

function ringPoint(theta: number, phi: number, radius: number, angle: number): Ang {
  return {
    theta: theta + Math.cos(angle) * radius,
    phi: phi + Math.sin(angle) * radius,
  };
}

function angleDelta(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

function gateAngles(index: number): number[] {
  const here = SETTLEMENTS[index];
  const angles: number[] = [];
  for (const leg of ROADS) {
    const first = leg[0];
    const last = leg[leg.length - 1];
    if (angularDistance(first.theta, first.phi, here.theta, here.phi) < 0.02) {
      angles.push(Math.atan2(signedDeltaPhi(here.phi, leg[1].phi), leg[1].theta - here.theta));
    }
    if (angularDistance(last.theta, last.phi, here.theta, here.phi) < 0.02) {
      const prev = leg[leg.length - 2];
      angles.push(Math.atan2(signedDeltaPhi(here.phi, prev.phi), prev.theta - here.theta));
    }
  }
  return angles;
}

function plantSettlement(
  root: Group,
  site: Settlement,
  index: number,
  posts: Matrix4[],
  rails: Matrix4[],
): void {
  const roofs = ["#7a3f32", "#6b4430", "#8a4e38", "#5c3a2e"];
  const homes: { dt: number; dp: number; yaw: number; w: number; d: number; h: number }[] = [];
  let n = 0;
  for (const ring of site.rings) {
    for (let i = 0; i < ring.count; i++) {
      const a = ring.rad === 0 ? 0.4 : (i / ring.count) * Math.PI * 2 + n * 0.17;
      homes.push({
        dt: Math.cos(a) * ring.rad,
        dp: Math.sin(a) * ring.rad,
        yaw: a + 0.4,
        w: 0.42 + (n % 4) * 0.05,
        d: 0.34 + (n % 3) * 0.04,
        h: 0.32 + (n % 3) * 0.04,
      });
      n++;
    }
  }
  const retainedHomes = homes
    .slice(0, 4)
    .map((house, originalIndex) => ({ house, originalIndex }));
  retainedHomes.forEach(({ house: h, originalIndex: i }) => {
    const floors = STACKED_HOUSES[index].includes(i) ? 2 : 1;
    const house = cottage(h.w * 2.25, h.d * 2.25, h.h * 2.25, roofs[i % roofs.length], floors);
    if (floors > 1) house.name = "double-cottage";
    const { pos, up } = placeOnSurface(site.theta + h.dt, site.phi + h.dp, 0);
    orient(house, pos, up, h.yaw);
    root.add(house);
  });

  const well = new Mesh(new CylinderGeometry(0.12, 0.14, 0.18, 8), wellMat);
  const { pos, up } = placeOnSurface(site.theta + 0.008, site.phi + 0.008, 0.02);
  orient(well, pos, up);
  root.add(well);

  retainedHomes.forEach(({ house: h, originalIndex: i }) => {
    if (i % 2 === 0) {
      const ribbon = new Mesh(new BoxGeometry(0.12, 0.02, 0.55), pathDirt);
      const placed = placeOnSurface(site.theta + h.dt * 0.45, site.phi + h.dp * 0.45, 0.015);
      orient(ribbon, placed.pos, placed.up, h.yaw);
      root.add(ribbon);
    }
    if (i % 3 === 0) {
      const glow = new Mesh(new SphereGeometry(0.04, 8, 8), lampMat);
      const placed = placeOnSurface(site.theta + h.dt * 0.72, site.phi + h.dp * 0.72, 0.38);
      orient(glow, placed.pos, placed.up);
      root.add(glow);
    }
  });

  addPaddock(site, index, posts, rails);
  addVillageGroundLayout(root, site, index);
  const layout = VILLAGE_LAYOUTS[index];
  if (layout.sheepSlice !== null) addGrazingSheep(root, site, index, layout.sheepSlice);

  const sunlit = facesSun(site.theta, site.phi);
  for (let i = 0; i < site.fires; i++) {
    const angle = ((i + 0.5) / site.fires) * (Math.PI / 3) + 0.12;
    const radius = 0.072 + (i % 2) * 0.026 + Math.floor(i / 2) * 0.008;
    const at = ringPoint(site.theta, site.phi, radius, angle);
    addBonfire(root, at.theta, at.phi, index * 1.7 + i * 2.1, sunlit);
  }

  const millYaw = MILL_YAW[index];
  if (millYaw !== null && layout.windmillSlice !== null) {
    addWindmill(root, site, millYaw, layout.windmillSlice, index);
  }
  if (index === LANDING_VILLAGE) addLandingStrip(root, site);
}

function addVillageGroundLayout(root: Group, site: Settlement, index: number): void {
  const inner = outerRadius(site);
  const fence = fenceRadius(site);

  const layout = VILLAGE_LAYOUTS[index];
  const fieldInner = inner + 0.019;
  const fieldOuter = fence - 0.019;
  const angularMargin = 0.03;
  for (const slice of layout.farms) {
    const sliceCenter = (slice + 0.5) * VILLAGE_SLICE_WIDTH;
    const halfWidth = VILLAGE_SLICE_WIDTH / 2 - angularMargin;
    addSphericalPatch(
      root,
      site,
      fieldInner,
      fieldOuter,
      sliceCenter - halfWidth,
      sliceCenter + halfWidth,
      farmSoil,
      "wheat-field",
      0.09,
    );
    for (let channel = 1; channel <= 4; channel++) {
      const radius = fieldInner + ((fieldOuter - fieldInner) * channel) / 5;
      const channelHalfWidth = 0.0026;
      addSphericalPatch(
        root,
        site,
        radius - channelHalfWidth,
        radius + channelHalfWidth,
        sliceCenter - halfWidth,
        sliceCenter + halfWidth,
        paddyWaterMat,
        "paddy-water-furrow",
        0.105,
      );
    }
    addWheatRows(root, site, index, slice, sliceCenter, halfWidth, fieldInner, fieldOuter);
  }
}

function addSphericalPatch(
  root: Group,
  site: Settlement,
  innerRadius: number,
  outer: number,
  startAngle: number,
  endAngle: number,
  material: MeshStandardMaterial,
  name: string,
  lift: number,
): void {
  const radialSegments = Math.max(2, Math.ceil(((outer - innerRadius) * PLANET.radius) / 0.35));
  const angularSegments = Math.max(
    3,
    Math.ceil(((outer * (endAngle - startAngle)) * PLANET.radius) / 0.35),
  );
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= radialSegments; row++) {
    const radius = innerRadius + ((outer - innerRadius) * row) / radialSegments;
    for (let column = 0; column <= angularSegments; column++) {
      const angle = startAngle + ((endAngle - startAngle) * column) / angularSegments;
      const surface = placeOnSurface(
        site.theta + Math.cos(angle) * radius,
        site.phi + Math.sin(angle) * radius,
        lift,
      );
      vertices.push(surface.pos.x, surface.pos.y, surface.pos.z);
    }
  }
  for (let row = 0; row < radialSegments; row++) {
    for (let column = 0; column < angularSegments; column++) {
      const a = row * (angularSegments + 1) + column;
      const b = a + angularSegments + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  mesh.userData.seatToPlanetSurface = true;
  mesh.userData.surfaceOffset = lift;
  root.add(mesh);
}

function addWheatRows(
  root: Group,
  site: Settlement,
  villageIndex: number,
  slice: number,
  sliceCenter: number,
  halfWidth: number,
  innerRadius: number,
  outer: number,
): void {
  const radialRows = 17;
  const plantsPerRow = 22;
  const plantCount = radialRows * plantsPerRow;
  const stems = new InstancedMesh(wheatStemGeo, wheatStemMat, plantCount);
  const heads = new InstancedMesh(wheatHeadGeo, wheatHeadMat, plantCount);
  stems.name = "wheat-stalks";
  heads.name = "wheat-heads";
  stems.castShadow = true;
  heads.castShadow = true;
  let plant = 0;
  for (let row = 0; row < radialRows; row++) {
    const radius = innerRadius + ((outer - innerRadius) * (row + 0.5)) / radialRows;
    for (let column = 0; column < plantsPerRow; column++) {
      const across = (column + 0.5) / plantsPerRow - 0.5;
      const jitter = (hash01(villageIndex, slice, row, column) - 0.5) * 0.035;
      const angle = sliceCenter + across * 2 * halfWidth + jitter;
      const ground = placeOnSurface(
        site.theta + Math.cos(angle) * radius,
        site.phi + Math.sin(angle) * radius,
        0.09,
      );
      const height = 0.38 + hash01(villageIndex, slice, row, column + 29) * 0.24;
      wheatDummy.position.copy(ground.pos);
      wheatDummy.quaternion.setFromUnitVectors(treeUp, ground.up);
      wheatDummy.scale.set(1, height, 1);
      wheatDummy.updateMatrix();
      stems.setMatrixAt(plant, wheatDummy.matrix);

      wheatDummy.position.copy(ground.pos).addScaledVector(ground.up, height * 0.88);
      wheatDummy.scale.setScalar(1.05 + hash01(villageIndex, slice, row, column + 47) * 0.5);
      wheatDummy.updateMatrix();
      heads.setMatrixAt(plant, wheatDummy.matrix);
      plant++;
    }
  }
  stems.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  root.add(stems, heads);
}

function addGrazingSheep(root: Group, site: Settlement, index: number, slice: number): void {
  const sliceCenter = (slice + 0.5) * VILLAGE_SLICE_WIDTH;
  const herdSize = index === 1 ? 5 : 4;
  for (let i = 0; i < herdSize; i++) {
    const sheep = new Group();
    sheep.name = "grazing-sheep";
    const body = new Mesh(new SphereGeometry(0.19, 8, 6), sheepWool);
    body.scale.set(1.25, 0.86, 0.88);
    body.position.y = 0.28;
    const head = new Mesh(new SphereGeometry(0.095, 7, 6), sheepFace);
    head.position.set(0, 0.34, 0.22);
    const muzzle = new Mesh(new SphereGeometry(0.055, 6, 5), sheepWool);
    muzzle.position.set(0, 0.31, 0.29);
    sheep.add(body, head, muzzle);
    for (const side of [-1, 1]) {
      const ear = new Mesh(new BoxGeometry(0.035, 0.035, 0.09), sheepFace);
      ear.position.set(side * 0.085, 0.39, 0.2);
      sheep.add(ear);
    }

    const legs: Object3D[] = [];
    for (const x of [-0.13, 0.13]) {
      for (const z of [-0.11, 0.13]) {
        const leg = new Mesh(new CylinderGeometry(0.025, 0.022, 0.2, 5), sheepLeg);
        leg.position.set(x, 0.11, z);
        leg.castShadow = true;
        legs.push(leg);
        sheep.add(leg);
      }
    }
    body.castShadow = true;
    head.castShadow = true;
    const lane = (i - (herdSize - 1) / 2) * 0.095;
    const angle = sliceCenter + lane;
    const radius = 0.095 + (i % 2) * 0.012;
    const theta = site.theta + Math.cos(angle) * radius;
    const phi = site.phi + Math.sin(angle) * radius;
    const placed = placeOnSurface(theta, phi, 0);
    sheep.scale.setScalar(0.65);
    orient(sheep, placed.pos, placed.up);
    root.add(sheep);
    life.sheep.push({
      obj: sheep,
      villageTheta: site.theta,
      villagePhi: site.phi,
      sliceCenter,
      lane,
      phase: index * 4.7 + i * 1.9,
      legs,
    });
  }
}

function addPaddock(site: Settlement, index: number, posts: Matrix4[], rails: Matrix4[]): void {
  const radius = fenceRadius(site);
  const count = Math.max(20, Math.round((2 * Math.PI * radius * PLANET.radius) / 0.95));
  const gates = gateAngles(index);
  const opening = (angle: number) => gates.some((gate) => angleDelta(angle, gate) < 0.16);
  const gatePost = (angle: number) =>
    !opening(angle) && gates.some((gate) => angleDelta(angle, gate) < 0.27);
  const step = (Math.PI * 2) / count;
  for (let i = 0; i < count; i++) {
    const angle = i * step;
    if (opening(angle)) continue;
    const at = ringPoint(site.theta, site.phi, radius, angle);
    const tall = gatePost(angle);
    const height = tall ? 0.52 : 0.36;
    dummy.scale.set(1, height, 1);
    const placed = placeOnSurface(at.theta, at.phi, height / 2);
    orient(dummy, placed.pos, placed.up);
    dummy.updateMatrix();
    posts.push(dummy.matrix.clone());
    const next = i + 1 === count ? 0 : i + 1;
    const nextAngle = next * step;
    if (opening(nextAngle)) continue;
    const far = ringPoint(site.theta, site.phi, radius, nextAngle);
    const mid = ringPoint(site.theta, site.phi, radius, angle + step / 2);
    const span = angularDistance(at.theta, at.phi, far.theta, far.phi) * PLANET.radius * 0.62;
    for (const lift of [0.13, 0.26]) {
      dummy.scale.set(1, 1, span);
      const seat = placeOnSurface(mid.theta, mid.phi, lift);
      const end = placeOnSurface(far.theta, far.phi, lift);
      orient(dummy, seat.pos, seat.up, yawToward(seat.up, end.pos.clone().sub(seat.pos)));
      dummy.updateMatrix();
      rails.push(dummy.matrix.clone());
    }
  }
  dummy.scale.set(1, 1, 1);
  dummy.position.set(0, 0, 0);
  dummy.rotation.set(0, 0, 0);
}

function facesSun(theta: number, phi: number): boolean {
  return sphToCart(1, theta, phi).dot(SUN_DIRECTION) > 0;
}

function addGentleSmoke(parent: Group, phase: number): void {
  const wisps = new Group();
  wisps.name = "village-smoke";
  wisps.userData.phase = phase;
  life.smokes.push(wisps);
  for (let i = 0; i < 3; i++) {
    const puff = new Mesh(
      new SphereGeometry(0.05, 10, 8),
      new MeshStandardMaterial({
        color: "#e4e2dc",
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        roughness: 1,
      }),
    );
    puff.position.set((i - 1) * 0.028, 0.14 + i * 0.035, (i - 1) * 0.012);
    puff.scale.set(0.8, 0.55, 0.8);
    wisps.add(puff);
  }
  parent.add(wisps);
}

function addBonfire(root: Group, theta: number, phi: number, phase: number, sunlit: boolean): void {
  const g = new Group();
  const logA = new Mesh(new CylinderGeometry(0.035, 0.045, 0.32, 5), fireWood);
  logA.rotation.z = Math.PI / 2;
  logA.rotation.y = 0.45;
  const logB = logA.clone();
  logB.rotation.y = -0.65;
  logB.position.y = 0.04;
  g.add(logA, logB);
  if (sunlit) {
    addGentleSmoke(g, phase);
  } else {
    const flames = new Group();
    flames.name = "village-flames";
    flames.userData.phase = phase;
    life.flames.push({ obj: flames, phase });
    const f1 = new Mesh(new ConeGeometry(0.09, 0.3, 6), fireFlame);
    f1.position.y = 0.2;
    const f2 = new Mesh(new ConeGeometry(0.055, 0.2, 5), fireHot);
    f2.position.set(0.06, 0.15, 0.02);
    const f3 = new Mesh(new ConeGeometry(0.045, 0.16, 5), fireFlame);
    f3.position.set(-0.05, 0.14, -0.02);
    flames.add(f1, f2, f3);
    const light = new PointLight("#ff9a3c", 16, 13, 2);
    light.name = "village-fire-light";
    light.position.y = 0.5;
    light.userData.phase = phase;
    light.userData.base = 16;
    life.fires.push({ light, phase, base: 16 });
    g.add(flames, light);
  }
  const { pos, up } = placeOnSurface(theta, phi, 0);
  orient(g, pos, up);
  root.add(g);
}

function addWindmill(
  root: Group,
  site: Settlement,
  yaw: number,
  slice: number,
  phase: number,
): void {
  const sliceCenter = (slice + 0.5) * VILLAGE_SLICE_WIDTH;
  const radius = (outerRadius(site) + fenceRadius(site)) / 2;
  const at = ringPoint(site.theta, site.phi, radius, sliceCenter);
  const g = new Group();
  g.name = "windmill";
  g.scale.setScalar(3.375);
  const towerH = 1.22;
  const towerMat = new MeshStandardMaterial({ color: "#c7a77c", roughness: 0.92 });
  const tower = new Mesh(new CylinderGeometry(0.08, 0.14, towerH, 6), towerMat);
  tower.position.y = towerH / 2;
  tower.castShadow = true;
  tower.receiveShadow = true;
  const windowGlass = new MeshStandardMaterial({
    color: "#527d87",
    emissive: "#315966",
    emissiveIntensity: 0.35,
    roughness: 0.3,
    metalness: 0.12,
  });
  const windowY = towerH * 0.73;
  const windowRadius = 0.035;
  const window = new Mesh(new CircleGeometry(windowRadius, 12), windowGlass);
  window.material.side = DoubleSide;
  window.position.set(0, windowY, 0.091);
  const windowTrim = new Mesh(
    new TorusGeometry(windowRadius * 1.16, 0.008, 5, 12),
    millCap,
  );
  windowTrim.position.set(0, windowY, 0.097);
  const cap = new Mesh(new ConeGeometry(0.16, 0.22, 6), millCap);
  cap.position.y = towerH + 0.06;
  cap.castShadow = true;
  const axle = new Mesh(new CylinderGeometry(0.02, 0.02, 0.16, 5), millCap);
  axle.rotation.x = Math.PI / 2;
  axle.position.set(0, towerH - 0.08, 0.1);
  const sails = new Group();
  sails.name = "windmill-sails";
  sails.position.set(0, towerH - 0.08, 0.2);
  sails.userData.phase = phase;
  life.sails.push({ obj: sails, phase });
  const hub = new Mesh(new SphereGeometry(0.05, 6, 5), millCap);
  sails.add(hub);
  for (let i = 0; i < 4; i++) {
    const arm = new Group();
    arm.rotation.z = (i * Math.PI) / 2;
    const bladeShape = new Shape();
    bladeShape.moveTo(-0.045, 0.075);
    bladeShape.lineTo(0.045, 0.075);
    bladeShape.quadraticCurveTo(0.09, 0.31, 0.145, 0.48);
    bladeShape.quadraticCurveTo(0.015, 0.54, -0.13, 0.49);
    bladeShape.quadraticCurveTo(-0.075, 0.29, -0.045, 0.075);
    const blade = new Mesh(
      new ExtrudeGeometry(bladeShape, { depth: 0.014, bevelEnabled: false, curveSegments: 4 }),
      sailCloth,
    );
    blade.castShadow = true;
    arm.add(blade);
    const spar = new Mesh(new BoxGeometry(0.018, 0.44, 0.022), millCap);
    spar.position.set(0, 0.29, 0.02);
    arm.add(spar);
    sails.add(arm);
  }
  g.add(tower, window, windowTrim, cap, axle, sails);
  const placed = placeOnSurface(at.theta, at.phi, 0);
  const center = placeOnSurface(site.theta, site.phi, 0);
  orient(
    g,
    placed.pos,
    placed.up,
    yawToward(placed.up, placed.pos.clone().sub(center.pos)) + yaw,
  );
  root.add(g);
}

function offsetAlong(origin: Ang, heading: number, alongWorld: number, sideWorld = 0): Ang {
  const along = alongWorld / PLANET.radius;
  const side = sideWorld / PLANET.radius;
  const radial = heading - Math.PI / 2;
  return {
    theta: origin.theta + Math.cos(heading) * along + Math.cos(radial) * side,
    phi: origin.phi + Math.sin(heading) * along + Math.sin(radial) * side,
  };
}

function faceHeading(obj: Object3D, at: Ang, heading: number, extra: number): void {
  const placed = placeOnSurface(at.theta, at.phi, extra);
  const nudge = placeOnSurface(
    at.theta + Math.cos(heading) * 0.004,
    at.phi + Math.sin(heading) * 0.004,
    extra,
  );
  orient(obj, placed.pos, placed.up, yawToward(placed.up, nudge.pos.clone().sub(placed.pos)));
}

function addLandingStrip(root: Group, site: Settlement): void {
  const tangent = LANDING_ANGLE + Math.PI / 2;
  const mid = ringPoint(site.theta, site.phi, fenceRadius(site) + STRIP_CLEARANCE, LANDING_ANGLE);
  const group = new Group();
  group.name = "landing-strip";

  const slab = new Mesh(new BoxGeometry(STRIP_WIDTH, 0.05, STRIP_LENGTH), stripDirt);
  slab.receiveShadow = true;
  paintRunway(slab);
  addRunwayLights(slab);
  faceHeading(slab, mid, tangent, 0.03);
  group.add(slab);

  const markGeo = new CylinderGeometry(0.018, 0.022, 0.07, 5);
  for (const along of [-STRIP_LENGTH / 2, STRIP_LENGTH / 2]) {
    for (const side of [-(STRIP_WIDTH / 2 + 0.05), STRIP_WIDTH / 2 + 0.05]) {
      const mark = new Mesh(markGeo, stripMark);
      mark.position.y = 0.035;
      const holder = new Group();
      holder.add(mark);
      faceHeading(holder, offsetAlong(mid, tangent, along, side), tangent, 0);
      group.add(holder);
    }
  }

  group.add(buildWindsock(offsetAlong(mid, tangent, STRIP_LENGTH / 2, -(STRIP_WIDTH / 2 + 0.12)), tangent));

  const terminalAt = offsetAlong(mid, tangent, TERMINAL_ALONG, TERMINAL_SIDE);
  group.add(buildTerminal(terminalAt, site));
  const towerAt = offsetAlong(terminalAt, tangent, TOWER_ALONG);
  group.add(buildControlTower(towerAt, site));
  root.add(group);
}

function paintRunway(slab: Mesh): void {
  const dashCount = Math.round(STRIP_LENGTH * (5 / 1.85));
  const span = STRIP_LENGTH * 0.62;
  for (let i = 0; i < dashCount; i++) {
    const dash = new Mesh(new BoxGeometry(0.028, 0.012, 0.1), runwayPaint);
    dash.position.set(0, 0.031, -span / 2 + (i * span) / (dashCount - 1));
    slab.add(dash);
  }
  for (const z of [-(STRIP_LENGTH / 2 - 0.1), STRIP_LENGTH / 2 - 0.1]) {
    const barCount = Math.max(6, Math.round((STRIP_WIDTH * 0.7) / 0.088));
    for (let i = 0; i < barCount; i++) {
      const bar = new Mesh(new BoxGeometry(0.052, 0.012, 0.028), runwayPaint);
      bar.position.set((i - (barCount - 1) / 2) * 0.088, 0.031, z);
      slab.add(bar);
    }
  }
  const edgeCount = Math.round(STRIP_LENGTH * (4 / 1.85));
  const edgeSpan = STRIP_LENGTH * 0.58;
  for (let i = 0; i < edgeCount; i++) {
    const z = -edgeSpan / 2 + (i * edgeSpan) / (edgeCount - 1);
    for (const x of [-STRIP_WIDTH * 0.4, STRIP_WIDTH * 0.4]) {
      const edge = new Mesh(new BoxGeometry(0.03, 0.01, 0.055), runwayPaint);
      edge.position.set(x, 0.03, z);
      slab.add(edge);
    }
  }
}

function addRunwayLights(slab: Mesh): void {
  const edgeX = STRIP_WIDTH / 2 - 0.04;
  const count = Math.round(STRIP_LENGTH * (4 / 1.85));
  const span = STRIP_LENGTH * 0.72;
  for (let i = 0; i < count; i++) {
    const z = -span / 2 + (i * span) / (count - 1);
    for (const x of [-edgeX, edgeX]) {
      const post = new Mesh(new CylinderGeometry(0.007, 0.009, 0.05, 5), runwayPost);
      post.position.set(x, 0.05, z);
      const bulb = new Mesh(
        new SphereGeometry(0.026, 6, 5),
        new MeshStandardMaterial({
          color: "#ffe6c4",
          emissive: "#ffb15a",
          emissiveIntensity: 1.6,
        }),
      );
      bulb.position.set(x, 0.084, z);
      bulb.name = "runway-lamp";
      bulb.userData.phase = i * 1.17 + (x > 0 ? 0.65 : 0);
      life.lamps.push(bulb);
      slab.add(post, bulb);
    }
  }
}

function buildWindsock(at: Ang, tangent: number): Group {
  const g = new Group();
  g.name = "windsock";
  const pole = new Mesh(new CylinderGeometry(0.012, 0.015, 0.34, 5), fenceWood);
  pole.position.y = 0.17;
  pole.castShadow = true;
  const sock = new Mesh(new ConeGeometry(0.035, 0.14, 6), sockMat);
  sock.rotation.x = Math.PI / 2;
  sock.position.set(0, 0.32, 0.06);
  const knot = new Mesh(new SphereGeometry(0.018, 6, 5), sockMat);
  knot.position.y = 0.34;
  g.add(pole, sock, knot);
  faceHeading(g, at, tangent, 0);
  return g;
}

function buildTerminal(at: Ang, site: Settlement): Group {
  const g = new Group();
  g.name = "airstrip-terminal";
  const w = 1.08;
  const d = 0.4;
  const h = 0.3;
  const plaster = new MeshStandardMaterial({ color: "#e7e4dc", roughness: 0.55, metalness: 0.03 });
  const roofMat = new MeshStandardMaterial({ color: "#8b939a", roughness: 0.4, metalness: 0.22 });
  const trim = new MeshStandardMaterial({ color: "#3d4650", roughness: 0.48, metalness: 0.16 });
  const glass = new MeshStandardMaterial({
    color: "#b5d0d8",
    emissive: "#7eacb8",
    emissiveIntensity: 0.28,
    roughness: 0.07,
    metalness: 0.4,
  });
  const doorMat = new MeshStandardMaterial({ color: "#2c333a", roughness: 0.38, metalness: 0.24 });
  const wall = new Mesh(new BoxGeometry(w, h, d), plaster);
  wall.position.y = h / 2;
  wall.castShadow = true;
  wall.receiveShadow = true;
  const plinth = new Mesh(new BoxGeometry(w + 0.02, 0.028, d + 0.02), trim);
  plinth.position.y = 0.014;
  const roof = new Mesh(new BoxGeometry(w + 0.06, 0.024, d + 0.06), roofMat);
  roof.position.y = h + 0.012;
  roof.castShadow = true;
  const band = new Mesh(new BoxGeometry(w * 0.62, 0.09, 0.016), glass);
  band.position.set(0.14, h * 0.62, d / 2 + 0.01);
  const door = new Mesh(new BoxGeometry(0.13, 0.2, 0.016), doorMat);
  door.position.set(-0.34, 0.1, d / 2 + 0.01);
  const lite = new Mesh(new BoxGeometry(0.038, 0.11, 0.01), glass);
  lite.position.set(-0.34, 0.13, d / 2 + 0.018);
  g.add(wall, plinth, roof, band, door, lite);
  const placed = placeOnSurface(at.theta, at.phi, 0);
  const village = placeOnSurface(site.theta, site.phi, 0);
  orient(g, placed.pos, placed.up, yawToward(placed.up, village.pos.clone().sub(placed.pos)));
  return g;
}

function buildControlTower(at: Ang, site: Settlement): Group {
  const g = new Group();
  g.name = "airstrip-control-tower";
  g.scale.y = 2;
  const plaster = new MeshStandardMaterial({ color: "#e7e4dc", roughness: 0.55, metalness: 0.03 });
  const trim = new MeshStandardMaterial({ color: "#3d4650", roughness: 0.48, metalness: 0.16 });
  const roofMat = new MeshStandardMaterial({ color: "#8b939a", roughness: 0.4, metalness: 0.22 });
  const glass = new MeshStandardMaterial({
    color: "#b5d0d8",
    emissive: "#7eacb8",
    emissiveIntensity: 0.28,
    roughness: 0.07,
    metalness: 0.4,
  });
  const base = new Mesh(new BoxGeometry(0.34, 0.48, 0.32), trim);
  base.position.y = 0.24;
  const cab = new Mesh(new BoxGeometry(0.3, 0.18, 0.3), plaster);
  cab.position.y = 0.57;
  const windows = new Mesh(new BoxGeometry(0.26, 0.08, 0.012), glass);
  windows.position.set(0, 0.59, 0.156);
  const roof = new Mesh(new BoxGeometry(0.38, 0.04, 0.36), roofMat);
  roof.position.y = 0.68;
  const pole = new Mesh(new CylinderGeometry(0.01, 0.014, 0.24, 5), trim);
  pole.position.set(0, 0.82, 0);
  const flag = new Mesh(new PlaneGeometry(0.18, 0.1, 8, 4), createBlueFlagMaterial(0.18, 0.055));
  flag.position.set(0.09, 0.88, 0);
  flag.name = "airstrip-flag";
  flag.castShadow = false;
  for (const part of [base, cab, windows, roof, pole, flag]) {
    part.castShadow = part !== flag;
    part.receiveShadow = true;
    g.add(part);
  }
  const placed = placeOnSurface(at.theta, at.phi, 0);
  const village = placeOnSurface(site.theta, site.phi, 0);
  orient(g, placed.pos, placed.up, yawToward(placed.up, village.pos.clone().sub(placed.pos)));
  return g;
}

function createLandmarks(): Group {
  const g = new Group();
  g.add(createCastle());
  g.add(createShrine());
  return g;
}

function createCastle(): Group {
  const g = new Group();
  g.name = "castle";
  g.scale.setScalar(1.25);
  const stone = new MeshStandardMaterial({ color: "#b3a89a", roughness: 0.88 });
  const masonry = new MeshStandardMaterial({ color: "#928579", roughness: 0.94 });
  const dark = new MeshStandardMaterial({ color: "#6f675e", roughness: 0.93 });
  const roof = new MeshStandardMaterial({ color: "#6e342c", roughness: 0.74 });
  const wood = new MeshStandardMaterial({ color: "#4a3424", roughness: 0.9 });
  const glow = new MeshStandardMaterial({
    color: "#ffd7a1",
    emissive: "#ffb15a",
    emissiveIntensity: 1.5,
    roughness: 0.4,
  });
  const flagMat = createBlueFlagMaterial(0.26, 0.09);

  const stoneBoxes: Matrix4[] = [];
  const masonryBoxes: Matrix4[] = [];
  const placeStoneBox = (geo: BoxGeometry, x: number, y: number, z: number, yaw = 0): void => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(geo.parameters.width, geo.parameters.height, geo.parameters.depth);
    dummy.updateMatrix();
    stoneBoxes.push(dummy.matrix.clone());
    geo.dispose();
  };

  const add = (
    geo: BoxGeometry | CylinderGeometry | ConeGeometry | SphereGeometry | PlaneGeometry,
    mat: MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
    yaw = 0,
  ): Mesh => {
    const mesh = new Mesh(geo, mat);
    mesh.position.set(x, y, z);
    if (yaw) mesh.rotation.y = yaw;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };

  const span = 2.55;
  const wallH = 0.82;
  const wallT = 0.16;
  const gate = 0.52;
  add(new CylinderGeometry(1.78, 1.98, 0.52, 12), dark, 0, -0.12, 0);

  placeStoneBox(new BoxGeometry(span, wallH, wallT), 0, wallH / 2, -span / 2);
  placeStoneBox(new BoxGeometry(wallT, wallH, span), -span / 2, wallH / 2, 0);
  placeStoneBox(new BoxGeometry(wallT, wallH, span), span / 2, wallH / 2, 0);
  const side = (span - gate) / 2;
  placeStoneBox(new BoxGeometry(side, wallH, wallT), -(gate + side) / 2, wallH / 2, span / 2);
  placeStoneBox(new BoxGeometry(side, wallH, wallT), (gate + side) / 2, wallH / 2, span / 2);

  const placeMasonry = (x: number, y: number, z: number, yaw = 0): void => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(0.27, 0.12, 0.018);
    dummy.updateMatrix();
    masonryBoxes.push(dummy.matrix.clone());
  };
  for (let course = 0; course < 5; course++) {
    const y = 0.1 + course * 0.16;
    const offset = course % 2 ? 0.14 : 0;
    for (let brick = 0; brick < 10; brick++) {
      const x = -1.25 + brick * 0.27 + offset;
      if (x > 1.28) continue;
      placeMasonry(x, y, -span / 2 - 0.09);
      if (Math.abs(x) > gate / 2 + 0.14) placeMasonry(x, y, span / 2 + 0.09);
    }
    for (let brick = 0; brick < 10; brick++) {
      const z = -1.25 + brick * 0.27 + offset;
      if (z > 1.28) continue;
      placeMasonry(-span / 2 - 0.09, y, z, Math.PI / 2);
      placeMasonry(span / 2 + 0.09, y, z, Math.PI / 2);
    }
  }

  for (let i = 0; i < 8; i++) {
    const x = -span / 2 + 0.24 + i * 0.3;
    const z = x;
    placeStoneBox(new BoxGeometry(0.14, 0.16, wallT), x, wallH + 0.08, -span / 2);
    if (Math.abs(x) > 0.42) placeStoneBox(new BoxGeometry(0.14, 0.16, wallT), x, wallH + 0.08, span / 2);
    placeStoneBox(new BoxGeometry(wallT, 0.16, 0.14), -span / 2, wallH + 0.08, z);
    placeStoneBox(new BoxGeometry(wallT, 0.16, 0.14), span / 2, wallH + 0.08, z);
  }

  const towers: Array<[number, number, number]> = [
    [-1.28, -1.28, 1.5],
    [-1.28, 1.28, 1.38],
    [1.28, 1.28, 1.46],
    [1.28, -1.28, 2.2],
  ];
  for (const [x, z, h] of towers) {
    add(new CylinderGeometry(0.28, 0.34, h, 8), stone, x, h / 2, z);
    const cap = add(new ConeGeometry(0.42, 0.46, 8), roof, x, h + 0.18, z);
    cap.castShadow = true;
    const out = Math.sign(z) || 1;
    add(new BoxGeometry(0.05, 0.16, 0.04), glow, x, h * 0.62, z + out * 0.3);
  }

  const flagY = 2.2 + 0.5;
  add(new CylinderGeometry(0.012, 0.016, 0.34, 5), wood, 1.28, flagY, -1.28);
  const flag = add(new PlaneGeometry(0.26, 0.14, 8, 4), flagMat, 1.42, flagY + 0.1, -1.28);
  flag.castShadow = false;
  flag.name = "castle-flag";

  placeStoneBox(new BoxGeometry(0.9, 1.2, 0.78), 0, 0.66, -0.48);
  add(new BoxGeometry(0.98, 0.1, 0.86), dark, 0, 1.28, -0.48);
  const keepRoof = add(new ConeGeometry(0.68, 0.5, 4), roof, 0, 1.56, -0.48);
  keepRoof.rotation.y = Math.PI / 4;
  add(new BoxGeometry(0.1, 0.16, 0.03), glow, 0.22, 0.78, -0.08);
  add(new BoxGeometry(0.1, 0.16, 0.03), glow, -0.22, 0.78, -0.08);
  add(new BoxGeometry(0.1, 0.16, 0.03), glow, 0, 1.02, -0.08);
  add(new BoxGeometry(0.08, 0.22, 0.03), wood, 0, 0.28, -0.08);

  add(new BoxGeometry(0.12, 0.72, 0.2), dark, -0.28, 0.36, span / 2);
  add(new BoxGeometry(0.12, 0.72, 0.2), dark, 0.28, 0.36, span / 2);
  add(new BoxGeometry(0.7, 0.12, 0.22), dark, 0, 0.74, span / 2);

  const fire = new Group();
  fire.position.set(0, 0.1, 0.28);
  const logA = new Mesh(new CylinderGeometry(0.04, 0.05, 0.4, 5), wood);
  logA.rotation.z = Math.PI / 2;
  logA.rotation.y = 0.5;
  const logB = logA.clone();
  logB.rotation.y = -0.6;
  logB.position.y = 0.05;
  fire.add(logA, logB);
  const flames = new Group();
  flames.name = "castle-flames";
  const flame = new MeshStandardMaterial({
    color: "#ffb15a",
    emissive: "#ff7418",
    emissiveIntensity: 1.8,
    roughness: 0.4,
  });
  const hot = flame.clone();
  hot.emissive.set("#ffe08a");
  const f1 = new Mesh(new ConeGeometry(0.1, 0.34, 6), flame);
  f1.position.y = 0.22;
  const f2 = new Mesh(new ConeGeometry(0.06, 0.22, 5), hot);
  f2.position.set(0.07, 0.16, 0.03);
  const f3 = new Mesh(new ConeGeometry(0.05, 0.18, 5), flame);
  f3.position.set(-0.06, 0.15, -0.02);
  flames.add(f1, f2, f3);
  fire.add(flames);
  life.castleFlames = flames;
  const fireLight = new PointLight("#ff9a3c", 2.4, 4.2, 2);
  fireLight.position.set(0, 0.4, 0);
  fireLight.name = "castle-fire-light";
  life.castleFire = fireLight;
  fire.add(fireLight);
  g.add(fire);

  const keepLight = new PointLight("#ffc98a", 0.7, 2.2, 2);
  keepLight.position.set(0, 0.8, -0.4);
  g.add(keepLight);

  for (const [x, y, z] of [
    [-0.85, 0.58, -1.05],
    [0.85, 0.58, -1.05],
    [-1.05, 0.58, 0.35],
    [1.05, 0.58, 0.15],
  ] as Array<[number, number, number]>) {
    add(new SphereGeometry(0.04, 6, 5), glow, x, y, z);
    const torch = new PointLight("#ffc27a", 0.55, 2.2, 2);
    torch.position.set(x, y, z);
    g.add(torch);
  }

  if (stoneBoxes.length > 0) {
    const blocks = new InstancedMesh(new BoxGeometry(1, 1, 1), stone, stoneBoxes.length);
    blocks.name = "castle-stone";
    blocks.castShadow = true;
    blocks.receiveShadow = true;
    stoneBoxes.forEach((matrix, i) => blocks.setMatrixAt(i, matrix));
    blocks.instanceMatrix.needsUpdate = true;
    g.add(blocks);
  }
  if (masonryBoxes.length > 0) {
    const blocks = new InstancedMesh(new BoxGeometry(1, 1, 1), masonry, masonryBoxes.length);
    blocks.name = "castle-brickwork";
    blocks.castShadow = true;
    blocks.receiveShadow = true;
    masonryBoxes.forEach((matrix, i) => blocks.setMatrixAt(i, matrix));
    blocks.instanceMatrix.needsUpdate = true;
    g.add(blocks);
  }
  dummy.position.set(0, 0, 0);
  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(1, 1, 1);

  const { pos, up } = placeOnSurface(SITES.castle.theta, SITES.castle.phi, 0);
  orient(g, pos, up, 0.8);
  return g;
}

function createBlueFlagMaterial(width: number, wave: number): MeshStandardMaterial {
  const canvas = (() => {
    if (typeof document !== 'undefined') {
      const el = document.createElement('canvas');
      el.width = 512;
      el.height = 256;
      const ctx = el.getContext('2d')!;
      ctx.font = 'bold 96px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 6;
      ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
      ctx.shadowBlur = 12;
      ctx.fillText('SSS', 256, 128);
      ctx.strokeText('SSS', 256, 128);
      ctx.shadowBlur = 0;
      return el;
    }
    return null;
  })();
  const map = canvas ? new CanvasTexture(canvas) : null;
  if (map) map.anisotropy = 4;

  const flagMat = new MeshStandardMaterial({
    color: '#2f74e0',
    emissive: '#1d4e9e',
    emissiveIntensity: 0.2,
    roughness: 0.5,
    side: DoubleSide,
    map,
  });
  flagMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sceneryTime;
    shader.vertexShader =
      "uniform float uTime;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         float along = smoothstep(-${width / 2}, ${width / 2}, position.x);
         transformed.z += sin(uTime * 3.4 + along * 9.0) * along * ${wave};
         transformed.y += sin(uTime * 2.5 + along * 6.5) * along * ${wave * 0.44};`,
      );
  };
  return flagMat;
}

function createShrine(): Group {
  const g = new Group();
  const stone = new MeshStandardMaterial({ color: "#9a9186", roughness: 0.86 });
  const base = new Mesh(new CylinderGeometry(0.28, 0.32, 0.12, 8), stone);
  const menhir = new Mesh(new BoxGeometry(0.12, 0.7, 0.08), stone);
  menhir.position.y = 0.4;
  const crystal = new Mesh(
    new ConeGeometry(0.09, 0.28, 5),
    new MeshStandardMaterial({
      color: "#d7b6ff",
      emissive: "#b388ff",
      emissiveIntensity: 1.2,
      roughness: 0.25,
    }),
  );
  crystal.position.y = 0.55;
  const gemMat = crystal.material as MeshStandardMaterial;
  const sideA = new Mesh(new ConeGeometry(0.05, 0.16, 5), gemMat);
  sideA.position.set(0.22, 0.16, 0.08);
  const sideB = new Mesh(new ConeGeometry(0.04, 0.12, 5), gemMat);
  sideB.position.set(-0.18, 0.12, -0.1);
  g.add(base, menhir, crystal, sideA, sideB);
  const { pos, up } = placeOnSurface(SITES.shrine.theta, SITES.shrine.phi, 0);
  orient(g, pos, up, 0.6);
  return g;
}

function createCrystals(): Group {
  const g = new Group();
  const mat = new MeshStandardMaterial({
    color: "#9fd8ff",
    emissive: "#7ec8ea",
    emissiveIntensity: 0.9,
    roughness: 0.25,
  });
  const spots = [
    { theta: SITES.ancientTree.theta + 0.08, phi: SITES.ancientTree.phi - 0.06 },
    { theta: SITES.ancientTree.theta - 0.05, phi: SITES.ancientTree.phi + 0.1 },
    { theta: SITES.shrine.theta + 0.06, phi: SITES.shrine.phi + 0.04 },
    { theta: SITES.tower.theta - 0.04, phi: SITES.tower.phi + 0.05 },
  ];
  spots.forEach((spot, i) => {
    const gem = new Mesh(new ConeGeometry(0.05 + i * 0.008, 0.18 + i * 0.02, 5), mat);
    const { pos, up } = placeOnSurface(spot.theta, spot.phi, 0.08);
    orient(gem, pos, up, i);
    g.add(gem);
  });
  return g;
}

export function updateLife(root: Group, t: number): void {
  const actors = root.userData.life as LifeActors | undefined;
  if (!actors) return;
  if (actors.crown) actors.crown.rotation.z = Math.sin(t * 0.7) * 0.04;
  if (actors.castleFlames) flickerFlames(actors.castleFlames, t, 0);
  if (actors.castleFire) flickerFire(actors.castleFire, t, 0, 2.1);
  for (const node of actors.flames) flickerFlames(node.obj, t, node.phase);
  for (const node of actors.fires) flickerFire(node.light, t, node.phase, node.base);
  for (const smoke of actors.smokes) driftSmoke(smoke, t);
  for (const node of actors.sails) {
    node.obj.rotation.x = 0;
    node.obj.rotation.y = 0;
    node.obj.rotation.z = t * 0.33 + node.phase;
  }
  for (const lamp of actors.lamps) flickerRunwayLamp(lamp, t);
  for (const sheep of actors.sheep) {
    const phase = sheep.phase;
    const angle = sheep.sliceCenter + sheep.lane + Math.sin(t * 0.18 + phase) * 0.14;
    const radius = 0.1 + Math.sin(t * 0.13 + phase) * 0.009;
    const theta = sheep.villageTheta + Math.cos(angle) * radius;
    const phi =
      sheep.villagePhi + (Math.sin(angle) * radius) / Math.max(0.35, Math.sin(sheep.villageTheta));
    const placed = placeOnSurface(theta, phi, 0);
    const next = placeOnSurface(
      theta + Math.cos(angle + 0.04) * 0.001,
      phi + Math.sin(angle + 0.04) * 0.001,
      0,
    );
    orient(sheep.obj, placed.pos, placed.up, yawToward(placed.up, next.pos.clone().sub(placed.pos)));
    const gait = Math.sin(t * 2.4 + phase) * 0.18;
    sheep.legs.forEach((leg, i) => {
      leg.rotation.x = gait * (i % 2 === 0 ? 1 : -1);
    });
  }
}

function driftSmoke(wisps: Object3D, t: number): void {
  const phase = (wisps.userData.phase as number) || 0;
  const cycle = 3.4;
  wisps.children.forEach((puff, i) => {
    const u = ((t * 0.26 + phase + i * (cycle / 3)) % cycle) / cycle;
    puff.position.set(
      Math.sin(t * 0.55 + phase + i) * 0.02,
      0.1 + u * 0.16,
      Math.cos(phase + i * 1.4) * 0.018,
    );
    const s = 0.7 + u * 0.45;
    puff.scale.set(s, s * 0.58, s);
    const mat = (puff as Mesh).material as MeshStandardMaterial;
    mat.opacity = 0.26 * (1 - u * 0.82);
  });
}

function flickerFlames(flames: Object3D, t: number, phase: number): void {
  const flicker = 0.8 + Math.sin(t * 8.6 + phase) * 0.14 + Math.sin(t * 14.1 + phase) * 0.07;
  flames.scale.set(1, Math.max(0.5, flicker), 1);
}

function runwayBlink(t: number, phase: number): number {
  const pulse = 0.4 + 0.6 * Math.sin(t * 6.2 + phase);
  const dip = Math.sin(t * 17.4 + phase * 2.2) > 0.84 ? 0.2 : 1;
  return Math.max(0.12, pulse * dip);
}

function flickerRunwayLamp(lamp: Mesh, t: number): void {
  const mat = lamp.material as MeshStandardMaterial;
  mat.emissiveIntensity = 1.7 * runwayBlink(t, lamp.userData.phase as number);
}

function flickerFire(light: PointLight, t: number, phase: number, base: number): void {
  light.intensity = base + Math.sin(t * 11 + phase) * base * 0.16 + Math.sin(t * 7.2 + phase) * base * 0.08;
}

const SINK = 0.03;

export function seatOnGround(root: Group, surface: PlanetSurface): void {
  const visit = (obj: Object3D) => {
    if ((obj as InstancedMesh).isInstancedMesh) {
      seatInstances(obj as InstancedMesh, surface);
      return;
    }
    if ((obj as Mesh).isMesh && obj.userData.seatToPlanetSurface) {
      seatSurfaceGeometry(obj as Mesh, surface);
      return;
    }
    const parentFar = !!obj.parent && obj.parent.position.lengthSq() > 4;
    if (!parentFar && obj.position.lengthSq() > 4) reseat(obj, surface);
    for (const child of obj.children) visit(child);
  };
  visit(root);
  bakeCottages(root);
}

function seatSurfaceGeometry(mesh: Mesh, surface: PlanetSurface): void {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  const point = new Vector3();
  const lift = mesh.userData.surfaceOffset as number;
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    const at = cartToSph(point);
    const radius = surface.radius(at.theta, at.phi);
    if (radius > 0) {
      point.setLength(radius + lift);
      position.setXYZ(i, point.x, point.y, point.z);
    }
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

const cottageScale = new Matrix4();
const cottageWorld = new Matrix4();

function bakeCottages(root: Group): void {
  root.updateMatrixWorld(true);
  const foundations: Mesh[] = [];
  const walls: Mesh[] = [];
  const roofs: Mesh[] = [];
  const windows: Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    if (mesh.userData.role === "cottage-foundation") foundations.push(mesh);
    else if (mesh.userData.role === "cottage-wall") walls.push(mesh);
    else if (mesh.userData.role === "cottage-roof") roofs.push(mesh);
    else if (mesh.userData.role === "cottage-window") windows.push(mesh);
  });
  const wallMat = new MeshStandardMaterial({ color: "#d8c7a6", roughness: 0.88 });
  const roofMat = new MeshStandardMaterial({ color: "#ffffff", roughness: 0.78 });
  const pane = new MeshStandardMaterial({
    color: "#f6d789",
    emissive: "#f0c35c",
    emissiveIntensity: 1.1,
  });
  const foundationMesh = bakeScaled(
    foundations,
    new BoxGeometry(1, 1, 1),
    new MeshStandardMaterial({ color: "#897d6c", roughness: 0.96 }),
    true,
    false,
  );
  const wallMesh = bakeScaled(walls, new BoxGeometry(1, 1, 1), wallMat, true, false);
  const roofMesh = bakeScaled(roofs, new ConeGeometry(1, 1, 4), roofMat, true, true);
  const windowMesh = bakeScaled(windows, new BoxGeometry(1, 1, 1), pane, false, false);
  if (foundationMesh) {
    foundationMesh.name = "cottage-foundations";
    root.add(foundationMesh);
  }
  if (wallMesh) {
    wallMesh.name = "cottage-walls";
    root.add(wallMesh);
  }
  if (roofMesh) {
    roofMesh.name = "cottage-roofs";
    root.add(roofMesh);
  }
  if (windowMesh) {
    windowMesh.name = "cottage-windows";
    root.add(windowMesh);
  }
}

function bakeScaled(
  meshes: Mesh[],
  geo: BufferGeometry,
  mat: MeshStandardMaterial,
  castShadow: boolean,
  tint: boolean,
): InstancedMesh | null {
  if (meshes.length === 0) {
    geo.dispose();
    mat.dispose();
    return null;
  }
  const inst = new InstancedMesh(geo, mat, meshes.length);
  inst.castShadow = castShadow;
  inst.receiveShadow = false;
  const geos = new Set<BufferGeometry>();
  const mats = new Set<MeshStandardMaterial>();
  meshes.forEach((mesh, i) => {
    const params = (mesh.geometry as BoxGeometry | ConeGeometry).parameters;
    const sx = "width" in params ? params.width : params.radius;
    const sy = params.height;
    const sz = "depth" in params ? params.depth : params.radius;
    cottageWorld.copy(mesh.matrixWorld).multiply(cottageScale.makeScale(sx, sy, sz));
    inst.setMatrixAt(i, cottageWorld);
    if (tint) inst.setColorAt(i, (mesh.material as MeshStandardMaterial).color);
    geos.add(mesh.geometry as BufferGeometry);
    mats.add(mesh.material as MeshStandardMaterial);
    mesh.parent?.remove(mesh);
  });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  for (const oldGeo of geos) oldGeo.dispose();
  for (const oldMat of mats) oldMat.dispose();
  return inst;
}

function reseat(obj: Object3D, surface: PlanetSurface): void {
  const sph = cartToSph(obj.position);
  const analytic = surfaceRadius(sph.theta, sph.phi);
  const extra = obj.position.length() - analytic;
  const meshR = surface.radius(sph.theta, sph.phi);
  if (meshR <= 0) return;
  obj.position.copy(obj.position).normalize().multiplyScalar(meshR + extra - SINK);
}

function seatInstances(mesh: InstancedMesh, surface: PlanetSurface): void {
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, seatMat);
    seatMat.decompose(seatPos, seatQuat, seatScale);
    if (seatPos.lengthSq() < 4) continue;
    const sph = cartToSph(seatPos);
    const analytic = surfaceRadius(sph.theta, sph.phi);
    const extra = seatPos.length() - analytic;
    const meshR = surface.radius(sph.theta, sph.phi);
    if (meshR <= 0) continue;
    seatPos.normalize().multiplyScalar(meshR + extra - SINK);
    seatMat.compose(seatPos, seatQuat, seatScale);
    mesh.setMatrixAt(i, seatMat);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

export function createFireflies(): Group {
  const g = new Group();
  g.name = "fireflies";
  const geo = new SphereGeometry(0.025, 6, 6);
  const mat = new MeshStandardMaterial({
    color: "#f5df8a",
    emissive: "#ffe071",
    emissiveIntensity: 0.85,
  });
  const haloGeo = new SphereGeometry(0.025, 8, 8);
  const haloMat = new MeshBasicMaterial({
    color: "#f4dc83",
    transparent: true,
    opacity: 0.075,
    depthWrite: false,
  });
  const swarms = [...GROVES]
    .sort((a, b) => b.count / (b.reach * b.reach) - a.count / (a.reach * a.reach))
    .slice(0, 6);
  for (let swarm = 0; swarm < swarms.length; swarm++) {
    const center = swarms[swarm];
    for (let i = 0; i < 24; i++) {
      const p = new Mesh(geo, mat);
      p.userData.theta =
        center.theta + (hash01(i, swarm, 1, 60) - 0.5) * center.reach * 0.8;
      p.userData.phi =
        center.phi +
        ((hash01(i, swarm, 3, 61) - 0.5) * center.reach * 0.8) /
          Math.max(0.35, Math.sin(center.theta));
      p.userData.phase = hash01(i, swarm, 5, 62) * 10;
      const halo = new Mesh(haloGeo, haloMat);
      halo.scale.setScalar(7);
      p.add(halo);
      g.add(p);
    }
    const glow = new PointLight("#f4d97a", 0.28, 11, 2);
    glow.userData.glowLight = true;
    glow.userData.theta = center.theta;
    glow.userData.phi = center.phi;
    glow.userData.phase = hash01(swarm, 29, 7, 63) * Math.PI * 2;
    g.add(glow);
  }
  return g;
}

export function updateFireflies(group: Group, t: number): void {
  for (const child of group.children) {
    const u = child.userData;
    const theta = u.glowLight
      ? u.theta + Math.sin(t * 0.19 + u.phase) * 0.045
      : u.theta + Math.sin(t * 0.6 + u.phase) * 0.012;
    const phi = u.glowLight
      ? u.phi + Math.cos(t * 0.16 + u.phase) * 0.045
      : u.phi + Math.cos(t * 0.5 + u.phase) * 0.012;
    const r = surfaceRadius(theta, phi) + 0.4 + Math.sin(t * 1.4 + u.phase) * 0.25;
    child.position.copy(sphToCart(r, theta, phi));
    if (u.glowLight) {
      (child as PointLight).intensity = 0.22 + Math.sin(t * 0.4 + u.phase) * 0.04;
      continue;
    }
    const vis = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 3 + u.phase));
    (child as Mesh).scale.setScalar(vis);
  }
}
