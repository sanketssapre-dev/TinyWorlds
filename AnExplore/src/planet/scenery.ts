import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
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
import { mergeGeometryParts } from "../render/mergeRigid";
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
/** Extra radius added to each cottage ring so neighbouring roofs clear. */
const RING_SPACING = [0, 0.03, 0.045];
/** Clear ground between the cottage roofs and the rest of the village. */
const COTTAGE_CLEAR = 0.02;
/** Radial depth of a farm patch. */
const FIELD_DEPTH = 0.09;
/** Clear ground between a farm patch and the fence. */
const FENCE_CLEAR = 0.02;

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
/** How far the forest and the rocks are held back from the whole airfield. */
const LANDING_TREE_CLEARANCE = 3.0;

// The airfield's own frame: "along" runs the length of the runway, "radial"
// across it, measured from the runway centre. Everything on the ground is laid
// out in these coordinates.
const RUNWAY_HALF_WIDTH = STRIP_WIDTH / 2;
const SHOULDER_HALF_WIDTH = RUNWAY_HALF_WIDTH + 0.17;
const TAXIWAY_HALF_WIDTH = 0.2;
const APRON_NEAR = SHOULDER_HALF_WIDTH + TAXIWAY_HALF_WIDTH;
const APRON_DEPTH = 1.25;
const APRON_FAR = APRON_NEAR + APRON_DEPTH;
const APRON_ALONG_START = -2.85;
const APRON_ALONG_END = 0.85;
const APRON_ALONG_CENTRE = (APRON_ALONG_START + APRON_ALONG_END) / 2;
const TERMINAL_ALONG = -0.45;
const TOWER_ALONG = 1.35;
/** Both buildings stand on the far side of the apron, facing the runway. */
const BUILDING_RADIAL = APRON_FAR + 0.42;
/** Margin left between the airfield and the fence that wraps around it. */
const AIRFIELD_FENCE_MARGIN = 1.1;
/** Half-extent of the fenced box around the airfield, in the airfield frame. */
const FENCE_ALONG = STRIP_LENGTH / 2 + AIRFIELD_FENCE_MARGIN;
const FENCE_RADIAL = BUILDING_RADIAL + AIRFIELD_FENCE_MARGIN;

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

/** The ring the outer cottages actually stand on (ring 0 is the centre house). */
function cottageRingRadius(site: Settlement): number {
  if (site.rings.length < 2) return 0;
  return site.rings[1].rad + RING_SPACING[1];
}

/**
 * How far the widest cottage roof can reach past its own centre. Derived from the
 * largest cottage (w 1.28, d 0.95 before scaling) and ROOF_OVERHANG;
 * `villageClearance.test.ts` asserts the real cottages stay inside this.
 */
const MAX_ROOF_REACH = 0.99;

/** Outer edge of the cottage roofs, as a radius about the village centre. */
function cottageEnvelope(site: Settlement): number {
  return cottageRingRadius(site) + MAX_ROOF_REACH / PLANET.radius;
}

/**
 * The fence is the outer boundary of the whole village: cottage ring, clear
 * ground, the farm ring and a further margin. Deriving it from the cottage
 * envelope is what keeps the farm patches outside the roofs.
 */
function fenceRadius(site: Settlement): number {
  return cottageEnvelope(site) + COTTAGE_CLEAR + FIELD_DEPTH + FENCE_CLEAR;
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

/**
 * Roughness is a uniform, not an attribute, so it cannot vary per instance
 * without touching the shader. The instance colour is already there and its
 * green channel carries the same per-tree hash, so it is reused to bend the
 * roughness a little — trees in a grove stop sharing one plastic finish.
 *
 * `USE_COLOR` is defined alongside `USE_INSTANCING_COLOR`, which is what makes
 * `vColor` readable here.
 */
function bendRoughness(source: string): string {
  return source.replace(
    "#include <roughnessmap_fragment>",
    `#include <roughnessmap_fragment>
     #ifdef USE_COLOR
       roughnessFactor *= 1.0 + (vColor.g - 1.0) * 0.6;
     #endif`,
  );
}

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
    shader.fragmentShader = bendRoughness(shader.fragmentShader);
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

/**
 * Distance from the village centre to the fence, at a bearing measured from the
 * airport direction. The fence is the village circle, except at the airstrip,
 * where it takes a rectangular detour around the runway, apron and buildings.
 */
function fenceRadiusAt(site: Settlement, index: number, bearing: number): number {
  const radius = fenceRadius(site);
  if (index !== LANDING_VILLAGE) return radius;
  const cos = Math.cos(bearing);
  const sin = Math.sin(bearing);
  if (cos <= 1e-6) return radius;
  // The fenced box around the airfield, converted to an angular distance.
  const farSide = (radius + STRIP_CLEARANCE + FENCE_RADIAL / PLANET.radius) / cos;
  const farEnd = Math.abs(sin) > 1e-6 ? FENCE_ALONG / (Math.abs(sin) * PLANET.radius) : Infinity;
  return Math.max(radius, Math.min(farSide, farEnd));
}

/** The fence outline as (bearing from the airport direction, radius) pairs. */
function fenceOutline(site: Settlement, index: number, samples = 200): { bearing: number; radius: number }[] {
  const out: { bearing: number; radius: number }[] = [];
  for (let i = 0; i < samples; i++) {
    const bearing = (i / samples) * Math.PI * 2;
    out.push({ bearing, radius: fenceRadiusAt(site, index, bearing) });
  }
  return out;
}

function insidePaddock(theta: number, phi: number): boolean {
  return SETTLEMENTS.some((site, index) => {
    if (!ACTIVE_VILLAGES.has(index)) return false;
    const bearing = Math.atan2(phi - site.phi, theta - site.theta) - LANDING_ANGLE;
    return angularDistance(theta, phi, site.theta, site.phi) < fenceRadiusAt(site, index, bearing) + 0.01;
  });
}

function nearLandingStrip(theta: number, phi: number): boolean {
  const site = SETTLEMENTS[LANDING_VILLAGE];
  const dt = theta - site.theta;
  const dp = phi - site.phi;
  const tangent = LANDING_ANGLE + Math.PI / 2;
  const along = dt * Math.cos(tangent) + dp * Math.sin(tangent);
  const radial = dt * Math.cos(LANDING_ANGLE) + dp * Math.sin(LANDING_ANGLE);
  const runwayCentre = fenceRadius(site) + STRIP_CLEARANCE;
  const clear = LANDING_TREE_CLEARANCE / PLANET.radius;

  // The whole airfield is one clearing: runway and shoulders, the taxiway, the
  // apron and both buildings. Anything standing inside it would leave the strip
  // wedged into the trees.
  const inside = (alongCentre: number, radialCentre: number, halfAlong: number, halfRadial: number) =>
    Math.abs(along - alongCentre / PLANET.radius) < (halfAlong + clear) / PLANET.radius &&
    Math.abs(radial - (runwayCentre + radialCentre / PLANET.radius)) < (halfRadial + clear) / PLANET.radius;

  return (
    inside(0, 0, STRIP_LENGTH / 2 + 0.15, SHOULDER_HALF_WIDTH + 0.1) ||
    inside(APRON_ALONG_CENTRE, (APRON_NEAR + APRON_FAR) / 2, (APRON_ALONG_END - APRON_ALONG_START) / 2, APRON_DEPTH / 2) ||
    inside(TERMINAL_ALONG, BUILDING_RADIAL, 0.9, 0.5) ||
    inside(TOWER_ALONG, BUILDING_RADIAL, 0.55, 0.55)
  );
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

/**
 * Slight per-tree colour variation.
 *
 * Every tree in a grove shares one material, so a wood of two thousand of them
 * reads as one tree stamped repeatedly. A few percent of per-instance
 * variation — some crowns a touch yellower, some a touch bluer, some a shade
 * darker — is what makes it read as a wood rather than a pattern, without
 * moving the palette at all.
 *
 * An instance colour multiplies the material colour, so these hover around 1.
 * The variation is keyed to where each instance sits, so it is stable: the same
 * tree gets the same tint, and a grove keeps its character across loads.
 */
function tintInstances(mesh: InstancedMesh, salt: number, amount = 1): void {
  const matrix = new Matrix4();
  const position = new Vector3();
  const tint = new Color();

  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    position.setFromMatrixPosition(matrix);

    const spread = (value: number) => (value - 0.5) * 2 * amount;
    const red = 1 + spread(hash01(position.x, position.y, position.z, salt)) * 0.12;
    const green = 1 + spread(hash01(position.x, position.y, position.z, salt + 1)) * 0.14;
    const blue = 1 + spread(hash01(position.x, position.y, position.z, salt + 2)) * 0.1;
    const light = 1 + spread(hash01(position.x, position.y, position.z, salt + 3)) * 0.06;

    tint.setRGB(red * light, green * light, blue * light);
    mesh.setColorAt(i, tint);
  }

  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/**
 * A conifer built from stacked tiers rather than one cone.
 *
 * A single cone reads as a traffic cone at this scale. Eight overlapping tiers
 * give the stepped silhouette, and each tier is carried past its own cone by a
 * ring of branches drooping outward — a solid tier reads as a solid cone, and
 * only the branches make it read as a tree.
 *
 * The envelope matches the cone it replaces, so every tree keeps the position,
 * height and ride it was designed with.
 */
function buildPineGeometry(): BufferGeometry {
  const tiers = 8;
  const tierHeight = 0.26;
  const spacing = 0.115;
  const base = -0.54;
  const branchesPerTier = 5;
  const branchDrop = 0.38; // radians below horizontal
  const reach = 0.3; // how far the lowest tier's branches reach

  const parts: BufferGeometry[] = [];
  for (let i = 0; i < tiers; i++) {
    const taper = Math.pow(1 - i / tiers, 0.8);
    const centre = base + i * spacing + tierHeight / 2;

    // A smaller cone fills the middle of the tier...
    const cone = new ConeGeometry(reach * taper * 0.7, tierHeight, 6);
    cone.translate(0, centre, 0);
    parts.push(cone);

    // ...and the branches carry the silhouette out past it.
    const branchLength = (reach * taper - 0.03) / Math.cos(branchDrop);
    for (let b = 0; b < branchesPerTier; b++) {
      const branch = new ConeGeometry(0.06 * taper + 0.012, branchLength, 5);
      branch.translate(0, branchLength / 2, 0);
      branch.rotateX(Math.PI / 2 + branchDrop);
      branch.rotateY((b / branchesPerTier) * Math.PI * 2);
      branch.translate(0, centre - tierHeight * 0.1, 0);
      parts.push(branch);
    }
  }
  return mergeGeometryParts(parts);
}

/**
 * A broadleaf crown built from overlapping lobes rather than one ball.
 *
 * A single sphere reads as a lollipop. Six lobes of differing size and offset
 * give the irregular, clumpy outline a real canopy has, while staying inside
 * the envelope the sphere occupied so nothing moves.
 */
function buildCanopyGeometry(): BufferGeometry {
  const lobes = [
    { radius: 0.3, x: 0, y: 0.02, z: 0 },
    { radius: 0.2, x: 0.02, y: 0.26, z: -0.02 },
    { radius: 0.22, x: -0.2, y: -0.02, z: 0.1 },
    { radius: 0.21, x: 0.21, y: -0.06, z: -0.08 },
    { radius: 0.19, x: 0.04, y: 0.06, z: -0.22 },
    { radius: 0.17, x: -0.06, y: -0.1, z: 0.24 },
  ];
  return mergeGeometryParts(
    lobes.map((lobe) => {
      const sphere = new SphereGeometry(lobe.radius, 6, 5);
      sphere.translate(lobe.x, lobe.y, lobe.z);
      return sphere;
    }),
  );
}

/**
 * A trunk with a flared base and branches, rather than a bare cylinder.
 *
 * The flare is what stops a tree looking planted on a stick, and the branches
 * carry the eye from trunk to crown.
 */
function buildTrunkGeometry(radiusTop: number, radiusBottom: number, height: number): BufferGeometry {
  const parts: BufferGeometry[] = [];

  const trunk = new CylinderGeometry(radiusTop, radiusBottom, height, 6);
  trunk.translate(0, height / 2, 0);
  parts.push(trunk);

  const flare = new CylinderGeometry(radiusBottom, radiusBottom * 1.45, height * 0.18, 6);
  flare.translate(0, height * 0.09, 0);
  parts.push(flare);

  for (const [yaw, tilt, lift] of [
    [0.5, 0.85, 0.38],
    [2.6, 0.75, 0.48],
    [4.6, 0.95, 0.3],
  ] as const) {
    const branch = new CylinderGeometry(radiusTop * 0.5, radiusTop * 0.9, height * 0.62, 5);
    branch.translate(0, height * 0.31, 0);
    branch.rotateX(tilt);
    branch.rotateY(yaw);
    branch.translate(0, lift * height, 0);
    parts.push(branch);
  }

  return mergeGeometryParts(parts);
}

/**
 * A conifer trunk: one clean taper, with nothing sprouting from it.
 *
 * A pine carries its branches in its tiers, so branches on the trunk below the
 * foliage read as a broadleaf that has been mislabelled.
 */
function buildPineTrunkGeometry(): BufferGeometry {
  const trunk = new CylinderGeometry(
    0.042 * TRUNK_DIAMETER_SCALE,
    0.088 * TRUNK_DIAMETER_SCALE,
    0.58,
    6,
  );
  trunk.translate(0, 0.29, 0);
  return trunk;
}

export function createTrees(path: FlightPath): Group {
  const group = new Group();
  const trunkGeo = buildTrunkGeometry(
    0.048 * TRUNK_DIAMETER_SCALE,
    0.102 * TRUNK_DIAMETER_SCALE,
    0.58,
  );
  const birchTrunkGeo = buildTrunkGeometry(
    0.03 * TRUNK_DIAMETER_SCALE,
    0.048 * TRUNK_DIAMETER_SCALE,
    0.7,
  );
  const pineTrunkGeo = buildPineTrunkGeometry();
  const canopyGeo = buildCanopyGeometry();
  const pineGeo = buildPineGeometry();
  const trunkMat = new MeshStandardMaterial({ color: "#4a3428", roughness: 0.92 });
  const birchTrunkMat = new MeshStandardMaterial({ color: "#cbb89a", roughness: 0.84 });
  // Trunks do not sway, but they are tinted, so they take the same bend.
  for (const mat of [trunkMat, birchTrunkMat]) {
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = bendRoughness(shader.fragmentShader);
    };
  }
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
  const pineTrunks = new InstancedMesh(pineTrunkGeo, trunkMat, candidates.length);
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
    pineTrunks,
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
    pt = 0,
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
      pineTrunks.setMatrixAt(pt++, dummy.matrix);
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
  pineTrunks.count = pt;
  birchTrunks.count = bt;
  canopy1.count = c1;
  canopy2.count = c2;
  boughs.count = bough;
  pines.count = p;
  snowCaps.count = snow;
  gold.count = g;
  birchLeaves.count = bl;

  // Slight per-tree variation, so a grove reads as a wood rather than one
  // stamped tree repeated. Snow caps are left alone: tint would read as dirt.
  tintInstances(canopy1, 11);
  tintInstances(canopy2, 23);
  tintInstances(gold, 37);
  tintInstances(boughs, 41);
  tintInstances(pines, 53);
  tintInstances(birchLeaves, 67);
  tintInstances(trunks, 71, 0.5);
  tintInstances(pineTrunks, 73, 0.5);
  tintInstances(birchTrunks, 83, 0.5);

  group.add(trunks, pineTrunks, birchTrunks, canopy1, canopy2, boughs, pines, snowCaps, gold, birchLeaves);

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

/** How far the roof eaves extend past the wall footprint, as a fraction. */
const ROOF_OVERHANG = 0.22;
/** Shared wall colour for every cottage. */
const WALL_COLOR = "#c9a45c";

/**
 * Unit hip roof: a 1x1 footprint sitting on y=0, rising to a ridge plateau at
 * y=1. Four slopes run from the eaves to the ridge crest. Instances are scaled
 * to the cottage's real width, roof height and depth, so the geometry stays
 * shared and the bake step can instance it.
 */
function createHipRoofGeometry(): BufferGeometry {
  const floor = [
    [-0.5, 0, 0.5],
    [0.5, 0, 0.5],
    [0.5, 0, -0.5],
    [-0.5, 0, -0.5],
  ];
  const ridgeLen = 0.6;
  const ridgeWidth = 0.4;
  const ridge = [
    [-ridgeLen / 2, 1, ridgeWidth / 2],
    [ridgeLen / 2, 1, ridgeWidth / 2],
    [ridgeLen / 2, 1, -ridgeWidth / 2],
    [-ridgeLen / 2, 1, -ridgeWidth / 2],
  ];

  const positions: number[] = [];
  for (const v of floor) positions.push(v[0], v[1], v[2]);
  for (const v of ridge) positions.push(v[0], v[1], v[2]);

  // Eaves are 0-3, ridge corners are 4-7. Two triangles per slope, wound so the
  // normals face outward from the roof.
  const indices = [
    0, 1, 5, 0, 5, 4, // front slope
    2, 3, 7, 2, 7, 6, // back slope
    1, 2, 6, 1, 6, 5, // right slope
    3, 0, 4, 3, 4, 7, // left slope
  ];

  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
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
    new MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.88 }),
  );
  wall.position.y = wallH / 2;
  wall.castShadow = true;
  wall.userData.role = "cottage-wall";
  g.add(wall);

  // --- Hip roof (proper, all sides slope from eaves to ridge) ---
  const roofH = h * 0.5;

  const faceMat = new MeshStandardMaterial({ color: roof, roughness: 0.78 });
  faceMat.side = DoubleSide;
  const plateauMat = new MeshStandardMaterial({ color: roof, roughness: 0.8 });

  const roofMesh = new Mesh(createHipRoofGeometry(), faceMat);
  roofMesh.scale.set(w * (1 + ROOF_OVERHANG), roofH, d * (1 + ROOF_OVERHANG));
  roofMesh.position.y = wallH;
  roofMesh.castShadow = true;
  roofMesh.userData.role = "cottage-roof";
  g.add(roofMesh);

  // Ridge plateau standing on the ridge crest
  const ridgePlateau = new Mesh(
    new BoxGeometry(w * 0.6 * (1 + ROOF_OVERHANG), 0.12, d * 0.4 * (1 + ROOF_OVERHANG)),
    plateauMat,
  );
  ridgePlateau.position.y = wallH + roofH + 0.06;
  ridgePlateau.castShadow = true;
  g.add(ridgePlateau);

    // Chimney (on two-storey cottages)
    if (floors > 1) {
      const chimney = new Mesh(
        new BoxGeometry(w * 0.16, h * 0.5, d * 0.14),
        new MeshStandardMaterial({ color: "#5a4a3a", roughness: 0.95 }),
      );
      chimney.position.set(-w * 0.22, wallH + roofH * 0.65, d * 0.15);
      chimney.castShadow = true;
      g.add(chimney);
      // Chimney pot
      const pot = new Mesh(
        new CylinderGeometry(w * 0.09, w * 0.07, 0.12, 8),
        new MeshStandardMaterial({ color: "#6b5540", roughness: 0.9 }),
      );
      pot.position.set(-w * 0.22, wallH + roofH * 0.92, d * 0.15);
      g.add(pot);
    }

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
const fencePostGeo = new BoxGeometry(0.085, 1, 0.085);
const fenceRailGeo = new BoxGeometry(0.06, 0.045, 1);
const fireWood = new MeshStandardMaterial({ color: "#4a3424", roughness: 0.9 });
const farmSoil = new MeshStandardMaterial({
  color: "#75502d",
  roughness: 0.98,
  side: DoubleSide,
});
const paddyWaterMat = new MeshStandardMaterial({
  color: "#7b8a72",
  roughness: 0.16,
  metalness: 0.14,
  side: DoubleSide,
});
const riceClumpMat = new MeshStandardMaterial({
  color: "#6f9c42",
  roughness: 0.82,
  emissive: "#2c3f14",
  emissiveIntensity: 0.12,
});
const wheatDummy = new Object3D();

/**
 * One rice hill: several slender blades fanning out from a single base point.
 * Built once and instanced, so a whole paddy costs a single draw. The clump is
 * unit height, so the instance's y scale *is* the plant height.
 */
function createRiceClumpGeometry(): BufferGeometry {
  const tilts = [0.16, 0.22, 0.29, 0.2, 0.26, 0.17];
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < tilts.length; i++) {
    const blade = new ConeGeometry(0.05, 1, 4);
    blade.translate(0, 0.5, 0);
    const azimuth = (i / tilts.length) * Math.PI * 2 + 0.7;
    const axis = new Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
    blade.applyQuaternion(new Quaternion().setFromAxisAngle(axis, tilts[i]));
    parts.push(blade);
  }
  return mergeGeometryParts(parts);
}
const riceClumpGeo = createRiceClumpGeometry();
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
const stripAsphalt = new MeshStandardMaterial({ color: "#474d52", roughness: 0.88 });
const stripShoulder = new MeshStandardMaterial({ color: "#6b7074", roughness: 0.92 });
const apronConcrete = new MeshStandardMaterial({ color: "#969c9f", roughness: 0.78 });
const apronPaint = new MeshStandardMaterial({ color: "#e8c15a", roughness: 0.6 });
/** Levelled, mown ground under the whole airfield, so it reads as a clearing. */
const mownGrass = new MeshStandardMaterial({
  color: "#577c42",
  roughness: 0.95,
  side: DoubleSide,
});
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
  // Widen the rings so neighbouring hip roofs clear each other. The eaves
  // overhang the walls by ROOF_OVERHANG, so houses in adjacent rings need
  // extra clearance — ~0.03 radians per ring (≈1.35 units at planet radius 45).
  const retainedHomes = homes
    .slice(0, 4)
    .map((house, originalIndex) => ({ house, originalIndex }));
  retainedHomes.forEach(({ house: h, originalIndex: i }) => {
    const floors = STACKED_HOUSES[index].includes(i) ? 2 : 1;
    const house = cottage(h.w * 2.25, h.d * 2.25, h.h * 2.25, roofs[i % roofs.length], floors);
    if (floors > 1) house.name = "double-cottage";
    // Push the cottage outward along its own bearing so the ring stays a true
    // circle. Adding the fix to each component instead made the ring radius
    // angle-dependent (up to sqrt(2)x), which pushed the diagonal cottages out
    // to the farm patches' inner edge.
    const ringIdx = site.rings.findIndex((r) => Math.abs(r.rad - Math.hypot(h.dt, h.dp)) < 1e-6);
    const fix = ringIdx >= 0 ? RING_SPACING[Math.min(ringIdx, 2)] : 0;
    const ringRad = Math.hypot(h.dt, h.dp);
    const scale = ringRad > 0 ? (ringRad + fix) / ringRad : 1;
    const { pos, up } = placeOnSurface(site.theta + h.dt * scale, site.phi + h.dp * scale, 0);
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

  // Bonfires go in the clear ground just outside the cottage roofs, in the gaps
  // between cottages. A fixed radius put them inside the ring, where they
  // overlapped the houses.
  const ringHomes = retainedHomes.filter(({ house: h }) => Math.hypot(h.dt, h.dp) > 1e-6);
  const homeAngles = ringHomes
    .map(({ house: h }) => Math.atan2(h.dp, h.dt))
    .sort((a, b) => a - b);
  const fireAngle = (i: number): number => {
    if (homeAngles.length < 2) return ((i + 0.5) / site.fires) * (Math.PI / 3) + 0.12;
    const a0 = homeAngles[i % homeAngles.length];
    const a1 = homeAngles[(i + 1) % homeAngles.length];
    const gap = a1 > a0 ? a1 - a0 : a1 - a0 + Math.PI * 2;
    return a0 + gap / 2;
  };
  const sunlit = facesSun(site.theta, site.phi);
  for (let i = 0; i < site.fires; i++) {
    const at = ringPoint(site.theta, site.phi, cottageEnvelope(site) + COTTAGE_CLEAR * 0.5, fireAngle(i));
    addBonfire(root, at.theta, at.phi, index * 1.7 + i * 2.1, sunlit);
  }

  const millYaw = MILL_YAW[index];
  if (millYaw !== null && layout.windmillSlice !== null) {
    addWindmill(root, site, millYaw, layout.windmillSlice, index);
  }
  if (index === LANDING_VILLAGE) addLandingStrip(root, site);
}

function addVillageGroundLayout(root: Group, site: Settlement, index: number): void {
  const layout = VILLAGE_LAYOUTS[index];
  // The farm ring sits outside the cottage roofs, with clear ground on both
  // sides. Anchoring it to outerRadius() instead let the patches reach back in
  // over the houses.
  const fieldInner = cottageEnvelope(site) + COTTAGE_CLEAR;
  const fieldOuter = fenceRadius(site) - FENCE_CLEAR;
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
      "rice-field",
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
    addRiceClumps(root, site, index, slice, sliceCenter, halfWidth, fieldInner, fieldOuter);
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

function addRiceClumps(
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
  const clumps = new InstancedMesh(riceClumpGeo, riceClumpMat, plantCount);
  clumps.name = "rice-clumps";
  clumps.castShadow = true;
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
      const height = 0.3 + hash01(villageIndex, slice, row, column + 29) * 0.16;
      // Wider clumps read as a tussock; taller ones as a young hill.
      const spread = 0.85 + hash01(villageIndex, slice, row, column + 47) * 0.45;
      wheatDummy.position.copy(ground.pos);
      wheatDummy.quaternion.setFromUnitVectors(treeUp, ground.up);
      wheatDummy.scale.set(spread, height, spread);
      wheatDummy.updateMatrix();
      clumps.setMatrixAt(plant, wheatDummy.matrix);
      plant++;
    }
  }
  clumps.instanceMatrix.needsUpdate = true;
  root.add(clumps);
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
    const radius = cottageEnvelope(site) + 0.045 + (i % 2) * 0.012;
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
  const outline = fenceOutline(site, index);
  const pts = outline.map((p) => ringPoint(site.theta, site.phi, p.radius, LANDING_ANGLE + p.bearing));

  // Cumulative arc length, so posts can be spaced evenly along the whole fence —
  // which is no longer a circle, but a circle with a rectangular bulge for the
  // airfield.
  const cumulative: number[] = [0];
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i % pts.length];
    cumulative.push(cumulative[i - 1] + angularDistance(a.theta, a.phi, b.theta, b.phi));
  }
  const total = cumulative[cumulative.length - 1];
  const count = Math.max(20, Math.round((total * PLANET.radius) / 0.95));

  /** Interpolate the outline at an arc position, returning position and bearing. */
  const atArc = (s: number): { theta: number; phi: number; bearing: number } => {
    const target = ((s % total) + total) % total;
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] <= target) lo = mid;
      else hi = mid;
    }
    const span = cumulative[lo + 1] - cumulative[lo] || 1;
    const t = (target - cumulative[lo]) / span;
    const a = pts[lo];
    const b = pts[(lo + 1) % pts.length];
    const theta = a.theta + (b.theta - a.theta) * t;
    const phi = a.phi + (b.phi - a.phi) * t;
    return { theta, phi, bearing: Math.atan2(phi - site.phi, theta - site.theta) };
  };

  const gates = gateAngles(index);
  const opening = (bearing: number) => gates.some((gate) => angleDelta(bearing, gate) < 0.16);
  const gatePost = (bearing: number) =>
    !opening(bearing) && gates.some((gate) => angleDelta(bearing, gate) < 0.27);
  const step = total / count;

  for (let i = 0; i < count; i++) {
    const here = atArc(i * step);
    if (opening(here.bearing)) continue;
    const tall = gatePost(here.bearing);
    const height = tall ? 0.6 : 0.46;
    dummy.scale.set(1, height, 1);
    const placed = placeOnSurface(here.theta, here.phi, height / 2);
    orient(dummy, placed.pos, placed.up);
    dummy.updateMatrix();
    posts.push(dummy.matrix.clone());

    const next = atArc((i + 1) * step);
    if (opening(next.bearing)) continue;
    // Three rails, each running the full post-to-post distance so they meet the
    // posts instead of floating in the middle of the span.
    for (const lift of [0.13, 0.27, 0.4]) {
      const a = placeOnSurface(here.theta, here.phi, lift);
      const b = placeOnSurface(next.theta, next.phi, lift);
      const mid = a.pos.clone().add(b.pos).multiplyScalar(0.5);
      dummy.scale.set(1, 1, a.pos.distanceTo(b.pos));
      orient(dummy, mid, mid.clone().normalize(), yawToward(a.up, b.pos.clone().sub(a.pos)));
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
  g.name = "village-bonfire";
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

/**
 * A rectangular patch of ground laid out in the airfield's own frame. Built
 * vertex by vertex so it follows the planet's curvature like every other
 * ground feature.
 */
function buildGroundRect(
  origin: Ang,
  heading: number,
  halfAlong: number,
  halfRadial: number,
  alongSegments: number,
  radialSegments: number,
  material: MeshStandardMaterial,
  name: string,
  lift: number,
): Mesh {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let r = 0; r <= radialSegments; r++) {
    const radial = -halfRadial + (2 * halfRadial * r) / radialSegments;
    for (let a = 0; a <= alongSegments; a++) {
      const along = -halfAlong + (2 * halfAlong * a) / alongSegments;
      const at = offsetAlong(origin, heading, along, radial);
      const placed = placeOnSurface(at.theta, at.phi, lift);
      vertices.push(placed.pos.x, placed.pos.y, placed.pos.z);
    }
  }
  for (let r = 0; r < radialSegments; r++) {
    for (let a = 0; a < alongSegments; a++) {
      const i = r * (alongSegments + 1) + a;
      indices.push(i, i + 1, i + alongSegments + 1, i + 1, i + alongSegments + 2, i + alongSegments + 1);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new Mesh(geo, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  mesh.userData.seatToPlanetSurface = true;
  mesh.userData.surfaceOffset = lift;
  return mesh;
}

function addLandingStrip(root: Group, site: Settlement): void {
  const tangent = LANDING_ANGLE + Math.PI / 2;
  const mid = ringPoint(site.theta, site.phi, fenceRadius(site) + STRIP_CLEARANCE, LANDING_ANGLE);
  const group = new Group();
  group.name = "landing-strip";

  // Levelled, mown ground under the whole airfield. Without it the strip reads
  // as a road cut into the forest floor.
  group.add(
    buildGroundRect(
      mid,
      tangent,
      STRIP_LENGTH / 2 + 2.3,
      BUILDING_RADIAL + 0.9,
      32,
      14,
      mownGrass,
      "airfield-ground",
      0.012,
    ),
  );

  // Shoulder, then the asphalt sitting on it.
  const shoulder = new Mesh(
    new BoxGeometry(SHOULDER_HALF_WIDTH * 2, 0.045, STRIP_LENGTH + 0.3),
    stripShoulder,
  );
  shoulder.receiveShadow = true;
  faceHeading(shoulder, mid, tangent, 0.024);
  group.add(shoulder);

  const slab = new Mesh(new BoxGeometry(STRIP_WIDTH, 0.05, STRIP_LENGTH), stripAsphalt);
  slab.receiveShadow = true;
  paintRunway(slab);
  addRunwayLights(slab);
  faceHeading(slab, mid, tangent, 0.052);
  group.add(slab);

  // Taxiway linking the runway to the apron, then the apron itself.
  const taxiway = new Mesh(
    new BoxGeometry(APRON_NEAR - SHOULDER_HALF_WIDTH, 0.045, TAXIWAY_HALF_WIDTH * 2.4),
    apronConcrete,
  );
  taxiway.receiveShadow = true;
  faceHeading(
    taxiway,
    offsetAlong(mid, tangent, APRON_ALONG_CENTRE, (SHOULDER_HALF_WIDTH + APRON_NEAR) / 2),
    tangent,
    0.052,
  );
  group.add(taxiway);

  const apron = new Mesh(
    new BoxGeometry(APRON_DEPTH, 0.045, APRON_ALONG_END - APRON_ALONG_START),
    apronConcrete,
  );
  apron.receiveShadow = true;
  // Lead-in line from the taxiway, and two parking stands.
  const lead = new Mesh(new BoxGeometry(APRON_DEPTH * 0.62, 0.01, 0.035), apronPaint);
  lead.position.set(-APRON_DEPTH * 0.12, 0.028, 0);
  apron.add(lead);
  for (const z of [-1.05, 1.05]) {
    const stand = new Mesh(new BoxGeometry(0.52, 0.01, 0.62), apronPaint);
    stand.position.set(APRON_DEPTH * 0.14, 0.028, z);
    apron.add(stand);
  }
  faceHeading(
    apron,
    offsetAlong(mid, tangent, APRON_ALONG_CENTRE, (APRON_NEAR + APRON_FAR) / 2),
    tangent,
    0.052,
  );
  group.add(apron);

  group.add(buildWindsock(offsetAlong(mid, tangent, STRIP_LENGTH / 2 - 0.4, -(SHOULDER_HALF_WIDTH + 0.22)), tangent));

  const terminalAt = offsetAlong(mid, tangent, TERMINAL_ALONG, BUILDING_RADIAL);
  group.add(buildTerminal(terminalAt, site));
  const towerAt = offsetAlong(mid, tangent, TOWER_ALONG, BUILDING_RADIAL);
  group.add(buildControlTower(towerAt, site));
  root.add(group);
}

/** Seven-segment geometry: [x, z, width, depth] in a 1x1 digit cell. */
const DIGIT_SEGMENTS: [number, number, number, number][] = [
  [0, 0.5, 0.5, 0.1], // top
  [0, 0, 0.5, 0.1], // middle
  [0, -0.5, 0.5, 0.1], // bottom
  [-0.25, 0.25, 0.1, 0.3], // upper left
  [0.25, 0.25, 0.1, 0.3], // upper right
  [-0.25, -0.25, 0.1, 0.3], // lower left
  [0.25, -0.25, 0.1, 0.3], // lower right
];
const DIGIT_SEGMENTS_FOR: Record<string, number[]> = {
  "0": [0, 2, 3, 4, 5, 6],
  "1": [4, 6],
  "2": [0, 1, 2, 4, 5],
  "3": [0, 1, 2, 4, 6],
  "4": [0, 1, 3, 4, 6],
  "5": [0, 1, 2, 3, 6],
  "6": [0, 1, 2, 3, 5, 6],
  "7": [0, 4, 6],
  "8": [0, 1, 2, 3, 4, 5, 6],
  "9": [0, 1, 2, 3, 4, 6],
};

/** Runway numbers, drawn from bars and rotated to read on approach. */
function addRunwayDesignator(slab: Mesh, end: number): void {
  const text = "27";
  const scale = 0.62;
  const cell = 0.5;
  const width = text.length * cell;
  const g = new Group();
  for (let d = 0; d < text.length; d++) {
    for (const s of DIGIT_SEGMENTS_FOR[text[d]]) {
      const [sx, sz, sw, sd] = DIGIT_SEGMENTS[s];
      const seg = new Mesh(new BoxGeometry(sw * scale, 0.012, sd * scale), runwayPaint);
      seg.position.set(-width / 2 + d * cell + cell / 2 + sx * scale, 0.031, sz * scale);
      g.add(seg);
    }
  }
  g.position.set(0, 0, end * (STRIP_LENGTH / 2 - 1.05));
  if (end < 0) g.rotation.y = Math.PI;
  slab.add(g);
}

function paintRunway(slab: Mesh): void {
  const halfLength = STRIP_LENGTH / 2;
  const halfWidth = STRIP_WIDTH / 2;

  // Threshold markings: a row of bars across each end of the runway.
  for (const end of [-1, 1]) {
    const bars = 8;
    for (let i = 0; i < bars; i++) {
      const bar = new Mesh(new BoxGeometry(0.075, 0.012, 0.3), runwayPaint);
      bar.position.set((i - (bars - 1) / 2) * 0.145, 0.031, end * (halfLength - 0.46));
      slab.add(bar);
    }
  }

  // Centreline dashes.
  const dashCount = Math.round(STRIP_LENGTH * (5 / 1.85));
  const span = STRIP_LENGTH * 0.6;
  for (let i = 0; i < dashCount; i++) {
    const dash = new Mesh(new BoxGeometry(0.032, 0.012, 0.14), runwayPaint);
    dash.position.set(0, 0.031, -span / 2 + (i * span) / (dashCount - 1));
    slab.add(dash);
  }

  // Touchdown zone markers, either side of the centreline just inside each end.
  for (const end of [-1, 1]) {
    for (const zone of [0.72, 1.24]) {
      for (const x of [-0.36, 0.36]) {
        const mark = new Mesh(new BoxGeometry(0.24, 0.012, 0.12), runwayPaint);
        mark.position.set(x, 0.031, end * (halfLength - zone));
        slab.add(mark);
      }
    }
  }

  // Edge lines the full length of the runway.
  for (const x of [-halfWidth + 0.09, halfWidth - 0.09]) {
    const edge = new Mesh(new BoxGeometry(0.036, 0.012, STRIP_LENGTH * 0.84), runwayPaint);
    edge.position.set(x, 0.031, 0);
    slab.add(edge);
  }

  addRunwayDesignator(slab, -1);
  addRunwayDesignator(slab, 1);
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
  const w = 1.5;
  const d = 0.62;
  const h = 0.44;
  const plaster = new MeshStandardMaterial({ color: "#e9e6df", roughness: 0.55, metalness: 0.03 });
  const roofMat = new MeshStandardMaterial({ color: "#7d858c", roughness: 0.42, metalness: 0.24 });
  const trim = new MeshStandardMaterial({ color: "#3d4650", roughness: 0.48, metalness: 0.16 });
  const glass = new MeshStandardMaterial({
    color: "#b5d0d8",
    emissive: "#7eacb8",
    emissiveIntensity: 0.34,
    roughness: 0.07,
    metalness: 0.4,
  });
  const doorMat = new MeshStandardMaterial({ color: "#2c333a", roughness: 0.38, metalness: 0.24 });
  const signMat = new MeshStandardMaterial({
    color: "#2f6f8f",
    emissive: "#1d4f68",
    emissiveIntensity: 0.5,
    roughness: 0.4,
  });

  const wall = new Mesh(new BoxGeometry(w, h, d), plaster);
  wall.position.y = h / 2;
  wall.castShadow = true;
  wall.receiveShadow = true;
  g.add(wall);

  const plinth = new Mesh(new BoxGeometry(w + 0.04, 0.03, d + 0.04), trim);
  plinth.position.y = 0.015;
  g.add(plinth);

  // Gable roof: two slabs meeting at a ridge running the length of the building.
  const rise = 0.27;
  const run = (d + 0.14) / 2;
  const slope = Math.hypot(run, rise);
  const angle = Math.atan2(rise, run);
  for (const side of [-1, 1]) {
    const slab = new Mesh(new BoxGeometry(w + 0.12, 0.028, slope), roofMat);
    slab.position.set(0, h + rise / 2, side * run / 2);
    slab.rotation.x = -side * angle;
    slab.castShadow = true;
    g.add(slab);
  }
  const ridge = new Mesh(new BoxGeometry(w + 0.12, 0.022, 0.07), trim);
  ridge.position.y = h + rise;
  g.add(ridge);

  // Glazed frontage facing the apron, divided into bays by mullions.
  const front = d / 2 + 0.012;
  const bays = 3;
  for (let i = 0; i < bays; i++) {
    const pane = new Mesh(new BoxGeometry(0.36, 0.2, 0.016), glass);
    pane.position.set((i - (bays - 1) / 2) * 0.44, h * 0.58, front);
    g.add(pane);
  }
  for (let i = 0; i <= bays; i++) {
    const mullion = new Mesh(new BoxGeometry(0.03, 0.24, 0.02), trim);
    mullion.position.set((i - bays / 2) * 0.44, h * 0.58, front + 0.004);
    g.add(mullion);
  }
  const door = new Mesh(new BoxGeometry(0.16, 0.26, 0.018), doorMat);
  door.position.set(0, 0.13, front + 0.004);
  g.add(door);

  const sign = new Mesh(new BoxGeometry(0.9, 0.11, 0.02), signMat);
  sign.position.set(0, h - 0.1, front + 0.006);
  g.add(sign);

  // Canopy over the entrance.
  const canopy = new Mesh(new BoxGeometry(0.7, 0.02, 0.3), trim);
  canopy.position.set(0, h * 0.52, front + 0.16);
  canopy.rotation.x = -0.12;
  g.add(canopy);

  const placed = placeOnSurface(at.theta, at.phi, 0);
  const village = placeOnSurface(site.theta, site.phi, 0);
  orient(g, placed.pos, placed.up, yawToward(placed.up, village.pos.clone().sub(placed.pos)));
  return g;
}

function buildControlTower(at: Ang, site: Settlement): Group {
  const g = new Group();
  g.name = "airstrip-control-tower";
  const plaster = new MeshStandardMaterial({ color: "#e9e6df", roughness: 0.55, metalness: 0.03 });
  const trim = new MeshStandardMaterial({ color: "#3d4650", roughness: 0.48, metalness: 0.16 });
  const roofMat = new MeshStandardMaterial({ color: "#7d858c", roughness: 0.42, metalness: 0.24 });
  const glass = new MeshStandardMaterial({
    color: "#a9cdd8",
    emissive: "#8fc4d6",
    emissiveIntensity: 0.42,
    roughness: 0.06,
    metalness: 0.42,
  });

  // Plinth, then a shaft with a collar at the top of it.
  const plinth = new Mesh(new BoxGeometry(0.46, 0.08, 0.46), trim);
  plinth.position.y = 0.04;
  g.add(plinth);

  const shaftH = 1.34;
  const shaft = new Mesh(new BoxGeometry(0.32, shaftH, 0.32), plaster);
  shaft.position.y = shaftH / 2 + 0.06;
  shaft.castShadow = true;
  g.add(shaft);

  const collar = new Mesh(new BoxGeometry(0.44, 0.06, 0.44), trim);
  collar.position.y = shaftH + 0.06;
  g.add(collar);

  // Cab: a mullioned core with a glazed pane on each of the four faces.
  const cabY = shaftH + 0.09;
  const cabH = 0.46;
  const cabW = 0.74;
  const core = new Mesh(new BoxGeometry(cabW, cabH, cabW), trim);
  core.position.y = cabY + cabH / 2;
  g.add(core);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const pane = new Mesh(new BoxGeometry(cabW * 0.8, cabH * 0.62, 0.02), glass);
    pane.position.set(Math.sin(a) * (cabW / 2), cabY + cabH / 2, Math.cos(a) * (cabW / 2));
    pane.rotation.y = a;
    g.add(pane);
  }

  // Overhanging roof, then the mast and beacon above it.
  const roof = new Mesh(new BoxGeometry(cabW + 0.14, 0.05, cabW + 0.14), roofMat);
  roof.position.y = cabY + cabH + 0.025;
  roof.castShadow = true;
  g.add(roof);

  const mast = new Mesh(new CylinderGeometry(0.011, 0.015, 0.42, 5), trim);
  mast.position.y = cabY + cabH + 0.26;
  g.add(mast);

  const beaconMat = new MeshStandardMaterial({
    color: "#ff6a55",
    emissive: "#ff3a26",
    emissiveIntensity: 2.4,
    roughness: 0.35,
  });
  const beacon = new Mesh(new SphereGeometry(0.038, 8, 6), beaconMat);
  beacon.position.y = cabY + cabH + 0.5;
  beacon.name = "tower-beacon";
  g.add(beacon);

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
  const crystalMat = new MeshStandardMaterial({
    color: "#d7b6ff",
    emissive: "#b388ff",
    emissiveIntensity: 1.2,
    roughness: 0.25,
  });

  // 3x scale — everything grows around the same ground point
  const SCALE = 3;

  // Base: wider, taller, with a subtle step
  const base = new Mesh(
    new CylinderGeometry(0.28 * SCALE, 0.32 * SCALE, 0.12 * SCALE, 12),
    stone,
  );
  const baseStep = new Mesh(
    new CylinderGeometry(0.35 * SCALE, 0.42 * SCALE, 0.06 * SCALE, 12),
    stone,
  );
  baseStep.position.y = -0.06 * SCALE;

  // Menhir: the central standing stone
  const menhir = new Mesh(
    new BoxGeometry(0.12 * SCALE, 0.7 * SCALE, 0.08 * SCALE),
    stone,
  );
  menhir.position.y = 0.35 * SCALE;

  // Cap stone on the menhir
  const cap = new Mesh(
    new BoxGeometry(0.16 * SCALE, 0.08 * SCALE, 0.12 * SCALE),
    stone,
  );
  cap.position.y = 0.7 * SCALE;

  // Main crystal atop the menhir
  const mainCrystal = new Mesh(
    new ConeGeometry(0.09 * SCALE, 0.28 * SCALE, 6),
    crystalMat,
  );
  mainCrystal.position.y = 0.74 * SCALE;

  // Ring of six crystals around the base step
  const ringCrystals: Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const c = new Mesh(
      new ConeGeometry(0.05 * SCALE, 0.16 * SCALE, 5),
      crystalMat,
    );
    c.position.set(
      Math.cos(angle) * 0.5 * SCALE,
      0.02 * SCALE,
      Math.sin(angle) * 0.5 * SCALE,
    );
    ringCrystals.push(c);
  }

  // Two flanking crystals at mid-height
  const sideA = new Mesh(
    new ConeGeometry(0.05 * SCALE, 0.16 * SCALE, 5),
    crystalMat,
  );
  sideA.position.set(0.22 * SCALE, 0.16 * SCALE, 0.08 * SCALE);
  const sideB = new Mesh(
    new ConeGeometry(0.04 * SCALE, 0.12 * SCALE, 5),
    crystalMat,
  );
  sideB.position.set(-0.18 * SCALE, 0.12 * SCALE, -0.1 * SCALE);

  // Lantern: a warm diffused glow at the front of the shrine
  const lanternFrame = new Mesh(
    new CylinderGeometry(0.06 * SCALE, 0.08 * SCALE, 0.18 * SCALE, 8, 1, true),
    new MeshStandardMaterial({ color: "#3d2a1e", roughness: 0.7, metalness: 0.3 }),
  );
  lanternFrame.position.set(0, 0.1 * SCALE, 0.55 * SCALE);

  const lanternGlass = new Mesh(
    new CylinderGeometry(0.05 * SCALE, 0.07 * SCALE, 0.14 * SCALE, 8, 1, true),
    new MeshStandardMaterial({
      color: "#ffd8a8",
      emissive: "#ffb860",
      emissiveIntensity: 0.6,
      roughness: 0.1,
      transparent: true,
      opacity: 0.35,
      side: DoubleSide,
    }),
  );
  lanternGlass.position.set(0, 0.1 * SCALE, 0.55 * SCALE);

  const lanternLight = new PointLight("#ffb860", 1.8, 3.5 * SCALE, 1.8);
  lanternLight.position.set(0, 0.1 * SCALE, 0.55 * SCALE);
  lanternLight.castShadow = false;

  g.add(
    base,
    baseStep,
    menhir,
    cap,
    mainCrystal,
    sideA,
    sideB,
    ...ringCrystals,
    lanternFrame,
    lanternGlass,
    lanternLight,
  );

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
  const wallMat = new MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.88 });
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
  const roofMesh = bakeScaled(roofs, createHipRoofGeometry(), roofMat, true, true);
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
    const geo = mesh.geometry;
    if (!geo) return;
    const params = (geo as BoxGeometry | ConeGeometry).parameters ?? {};
    // For custom BufferGeometry (hip roofs) use cone's radius/height as fallback.
    const sx = "width" in params ? params.width : (params.radius ?? (geo as any).radius ?? 1);
    const sy = (geo as any).height ?? params.height ?? 1;
    const sz = "depth" in params ? params.depth : (params.radius ?? (geo as any).radius ?? 1);
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
