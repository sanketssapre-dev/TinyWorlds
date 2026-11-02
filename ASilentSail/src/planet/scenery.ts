import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  Vector3,
  RepeatWrapping,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PLANET, TRACK } from "../config";
import { angularDistance, sphToCart, wrapPhi } from "../math/sphere";
import { alpineMaps, grassTuftMap, mappedStandard } from "../render/materials";
import { heightOffset, MOUNTAIN_SUMMIT_CENTERS, snowFactor } from "./height";
import { LAKES, SITES } from "./features";
import type { PlanetSurface } from "./surface";
import type { RailwayPath } from "../railway/path";

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const tmpPos = new Vector3();
const tmpScale = new Vector3();
const tmpMat = new Matrix4();
const axisX = new Vector3();
const axisZ = new Vector3();
const refAxis = new Vector3();
const CONIFER_CROWN_FRACTION = 0.7;
const CONIFER_BRANCH_DETAIL = 4;
const TRACKSIDE_ROCK_OFFSET = TRACK.trackSpacing * 0.5 + TRACK.sleeperWidth * 0.5 + 1.4;
export const MAX_ALPINE_TREES = 21_000;
const GROVE_COUNT = 1_080;
export const TREE_TRACK_CLEARANCE = 0.085;
const TREE_SUMMIT_CLEARANCE = 0.055;
let bark: CanvasTexture | undefined;
let coniferNeedles: CanvasTexture | undefined;

type TrackProximity = (theta: number, phi: number, reach: number) => boolean;

export const sceneryTime = { value: 0 };

export function buildAlpineScenery(
  surface: PlanetSurface,
  railway: RailwayPath,
): Group {
  const root = new Group();
  root.name = "alpine-scenery";

  const isNearTrack = createTrackProximity(railway);
  plantPines(root, surface, railway, isNearTrack);
  plantTrackside(root, surface, railway);
  plantChalets(root, surface, railway, isNearTrack);
  return root;
}

function trunkGeometry(): BufferGeometry {
  const trunk = new CylinderGeometry(0.035, 0.12, 1.65, 7, 5);
  const pos = trunk.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const angle = Math.atan2(z, x);
    const y = pos.getY(i);
    const grain = 1 + Math.sin(angle * 4 + y * 5) * 0.045;
    pos.setXYZ(i, x * grain, y, z * grain);
  }
  trunk.translate(0, 0.825, 0);
  trunk.computeVertexNormals();
  const flare = new CylinderGeometry(0.1, 0.19, 0.26, 7, 2);
  flare.translate(0, 0.12, 0);
  return mergeParts([trunk, flare]);
}

function barkTexture(): CanvasTexture {
  if (bark) return bark;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create the Alpine bark texture.");
  ctx.fillStyle = "#80664a";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 520; i++) {
    const x = hash(i * 3.3) * size;
    const y = hash(i * 7.1) * size;
    const length = 4 + hash(i * 2.9) * 28;
    ctx.strokeStyle = i % 3 === 0 ? "#403329" : "#b39a72";
    ctx.globalAlpha = 0.22 + hash(i * 8.7) * 0.5;
    ctx.lineWidth = 0.45 + hash(i * 4.1) * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (hash(i * 6.2) - 0.5) * 3, y + length);
    ctx.stroke();
  }
  for (let i = 0; i < 16; i++) {
    const x = hash(i * 11.3) * size;
    const y = hash(i * 13.7) * size;
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = "#32291f";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(x, y, 1.5 + hash(i) * 2, 3 + hash(i + 1) * 4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  bark = new CanvasTexture(canvas);
  bark.wrapS = RepeatWrapping;
  bark.wrapT = RepeatWrapping;
  bark.magFilter = LinearFilter;
  bark.minFilter = LinearMipmapLinearFilter;
  bark.colorSpace = SRGBColorSpace;
  bark.needsUpdate = true;
  return bark;
}

function coniferNeedleAtlas(): CanvasTexture {
  if (coniferNeedles) return coniferNeedles;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create the Alpine conifer texture.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size / 2, canvas.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(size / 2 + 8, 4, size / 2 - 16, canvas.height - 8);
  ctx.clip();

  const stemY = 37;
  ctx.strokeStyle = "rgba(255,255,255,0.74)";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(132, stemY);
  ctx.bezierCurveTo(170, stemY + 1, 214, stemY + 12, 252, 25);
  ctx.stroke();

  for (let section = 0; section < 17; section++) {
    const t = section / 16;
    const x = 136 + t * 112;
    const centerY = stemY - 12 * t * t;
    const length = (11 + (1 - t) * 18) * (0.72 + hash(section * 2.4) * 0.52);
    ctx.fillStyle = `rgba(255,255,255,${0.18 + hash(section * 3.2) * 0.26})`;
    ctx.beginPath();
    ctx.ellipse(
      x,
      centerY,
      4 + hash(section * 4.1) * 4,
      2.5 + hash(section * 5.3) * 2.5,
      (hash(section * 6.7) - 0.5) * 0.45,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    for (let side = -1; side <= 1; side += 2) {
      for (let needle = 0; needle < 8; needle++) {
        const n = section * 23 + needle * 7 + (side + 1) * 3;
        const startX = x + (hash(n + 0.2) - 0.5) * 7;
        const startY = centerY + side * (1 + hash(n + 0.7) * 3);
        const angle = side * (0.45 + hash(n + 1.3) * 1.05);
        const reach = length * (0.55 + hash(n + 2.1) * 0.65);
        const endX = startX + reach * Math.cos(angle) * (0.42 + hash(n + 3.5) * 0.4);
        const endY = startY + side * reach * (0.68 + hash(n + 4.7) * 0.4);
        ctx.strokeStyle = `rgba(255,255,255,${0.42 + hash(n + 5.3) * 0.5})`;
        ctx.lineWidth = 1.05 + hash(n + 6.1) * 1.35;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(
          startX + (endX - startX) * 0.38 - side * 1.4,
          startY + (endY - startY) * 0.45,
          endX,
          endY,
        );
        ctx.stroke();
      }
    }
  }
  ctx.restore();

  coniferNeedles = new CanvasTexture(canvas);
  coniferNeedles.colorSpace = SRGBColorSpace;
  coniferNeedles.magFilter = LinearFilter;
  coniferNeedles.minFilter = LinearMipmapLinearFilter;
  coniferNeedles.needsUpdate = true;
  return coniferNeedles;
}

/** Shared bough geometry with a fine, transparent needle atlas for close-up detail. */
function coniferCrown(
  spread: number,
  seed: number,
  branchCount: number,
  darkHex: string,
  lightHex: string,
): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const dark = new Color(darkHex);
  const light = new Color(lightHex);
  const shade = new Color();
  const height = 1.52;
  const addVertex = (x: number, y: number, z: number, tint: number, u = 0.25, v = 0.5) => {
    positions.push(x, y, z);
    shade.copy(dark).lerp(light, tint);
    colors.push(shade.r, shade.g, shade.b);
    uvs.push(u, v);
    return positions.length / 3 - 1;
  };

  const crownBase = height * (1 - CONIFER_CROWN_FRACTION);
  const appendBough = (start: Vector3, end: Vector3, width: number, branchSeed: number) => {
    const direction = end.clone().sub(start).normalize();
    const side = new Vector3(-direction.z, 0, direction.x).normalize();
    const up = new Vector3().crossVectors(direction, side).normalize();
    const rings = 2;
    const sides = 3;
    const base = positions.length / 3;
    for (let ring = 0; ring <= rings; ring++) {
      const t = ring / rings;
      const center = start.clone().lerp(end, t);
      center.y = Math.max(crownBase, center.y - t * t * width * 0.65);
      const radius = width * (0.88 * Math.pow(1 - t, 0.8) + 0.08);
      for (let sideIndex = 0; sideIndex < sides; sideIndex++) {
        const angle = (sideIndex / sides) * Math.PI * 2 + hash(branchSeed + ring) * 0.25;
        const offsetA = Math.cos(angle) * radius;
        const offsetB = Math.sin(angle) * radius * 0.58;
        addVertex(
          center.x + side.x * offsetA + up.x * offsetB,
          center.y + side.y * offsetA + up.y * offsetB,
          center.z + side.z * offsetA + up.z * offsetB,
          0.12 + hash(branchSeed + ring * 9 + sideIndex) * 0.25,
        );
      }
    }
    for (let ring = 0; ring < rings; ring++) {
      for (let sideIndex = 0; sideIndex < sides; sideIndex++) {
        const a = base + ring * sides + sideIndex;
        const b = base + ring * sides + (sideIndex + 1) % sides;
        const c = a + sides;
        const d = b + sides;
        indices.push(a, b, c, b, d, c);
      }
    }
  };

  const appendFoliageCard = (
    start: Vector3,
    end: Vector3,
    side: Vector3,
    width: number,
    cardSeed: number,
  ) => {
    const direction = end.clone().sub(start).normalize();
    const across = side.clone().addScaledVector(direction, -side.dot(direction)).normalize();
    const startWidth = width * (0.48 + hash(cardSeed) * 0.12);
    const endWidth = width * (0.12 + hash(cardSeed + 1) * 0.08);
    const baseTint = 0.26 + hash(cardSeed + 2) * 0.25;
    const tipTint = 0.5 + hash(cardSeed + 3) * 0.38;
    const base = positions.length / 3;
    const atlasU0 = 0.54;
    const atlasU1 = 0.99;
    const atlasV0 = 0.05;
    const atlasV1 = 0.95;

    addVertex(
      start.x - across.x * startWidth,
      start.y - across.y * startWidth,
      start.z - across.z * startWidth,
      baseTint,
      atlasU0,
      atlasV0,
    );
    addVertex(
      start.x + across.x * startWidth,
      start.y + across.y * startWidth,
      start.z + across.z * startWidth,
      baseTint,
      atlasU0,
      atlasV1,
    );
    addVertex(
      end.x - across.x * endWidth,
      end.y - across.y * endWidth,
      end.z - across.z * endWidth,
      tipTint,
      atlasU1,
      atlasV0,
    );
    addVertex(
      end.x + across.x * endWidth,
      end.y + across.y * endWidth,
      end.z + across.z * endWidth,
      tipTint,
      atlasU1,
      atlasV1,
    );
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  };

  const tiers = Math.max(5, Math.round(branchCount / 6));
  for (let tier = 0; tier < tiers; tier++) {
    const tierT = tier / Math.max(1, tiers - 1);
    const baseLimbs = Math.round(branchCount / tiers);
    const limbs = Math.max(3, baseLimbs + Math.floor(hash(seed + tier * 13.7) * 3) - 1);
    for (let limb = 0; limb < limbs; limb++) {
      const branchSeed = seed + tier * 37 + limb * 11.7;
      const crownHeight = height * CONIFER_CROWN_FRACTION;
      const y =
        crownBase +
        (tier + 0.5 + (hash(branchSeed) - 0.5) * 0.8) * (crownHeight / tiers);
      const angle = limb * 2.399963 + tier * 0.71 + (hash(branchSeed + 1) - 0.5) * 1.5;
      const reach = spread * (0.92 * Math.pow(1 - tierT, 0.72) + 0.075) *
        (0.72 + hash(branchSeed + 2) * 0.52);
      const droop = reach * (0.24 + hash(branchSeed + 3) * 0.2);
      const start = new Vector3(Math.cos(angle) * 0.045, y, Math.sin(angle) * 0.045);
      const end = new Vector3(
        Math.cos(angle) * reach,
        Math.max(crownBase, y - droop + reach * 0.08),
        Math.sin(angle) * reach,
      );
      appendBough(start, end, spread * (0.085 + (1 - tierT) * 0.05), branchSeed);

      const cardWidth =
        spread * (0.25 + (1 - tierT) * 0.2) * (0.84 + hash(branchSeed + 4) * 0.32);
      const crossBranch = new Vector3(-Math.sin(angle), 0, Math.cos(angle));
      appendFoliageCard(start, end, crossBranch, cardWidth, branchSeed + 5);
      appendFoliageCard(start, end, new Vector3(0, 1, 0), cardWidth * 0.9, branchSeed + 8);
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geo.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function snowCrown(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const cap = new IcosahedronGeometry(0.1 + hash(i + 2) * 0.07, 0);
    cap.translate((hash(i + 1) - 0.5) * 0.2, 1.35 + hash(i) * 0.18, (hash(i + 3) - 0.5) * 0.2);
    parts.push(cap);
  }
  return mergeParts(parts);
}

function mergeParts(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false)!;
  for (const geo of parts) geo.dispose();
  return merged;
}

function crossedCard(width: number, height: number): BufferGeometry {
  const a = new PlaneGeometry(width, height);
  a.translate(0, height * 0.5, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 3);
  const c = a.clone();
  c.rotateY(-Math.PI / 3);
  return mergeParts([a, b, c]);
}

function ruggedRock(radius: number, seed: number, flat: number): BufferGeometry {
  const geo = new IcosahedronGeometry(radius, 1);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const len = Math.hypot(x, y, z) || 1;
    const vertexSeed =
      Math.round((x / len + 1) * 100) * 1.7 +
      Math.round((y / len + 1) * 100) * 3.1 +
      Math.round((z / len + 1) * 100) * 7.3;
    const n = 0.9 + hash(seed + vertexSeed) * 0.2;
    pos.setXYZ(i, (x / len) * radius * n, (y / len) * radius * n * flat, (z / len) * radius * n);
  }
  geo.computeVertexNormals();
  return geo;
}

function cardMaterial(map: Texture, color = "#ffffff"): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({
    map,
    color,
    roughness: 0.88,
    alphaTest: 0.28,
    side: DoubleSide,
  });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -1;
  return mat;
}

function plantPines(
  root: Group,
  surface: PlanetSurface,
  railway: RailwayPath,
  isNearTrack: TrackProximity,
): void {
  const maps = alpineMaps();
  const foliage = new MeshStandardMaterial({
    map: coniferNeedleAtlas(),
    color: "#ffffff",
    roughness: 0.9,
    vertexColors: true,
    side: DoubleSide,
    alphaTest: 0.16,
  });
  const foliageB = new MeshStandardMaterial({
    map: coniferNeedleAtlas(),
    color: "#ffffff",
    roughness: 0.88,
    vertexColors: true,
    side: DoubleSide,
    alphaTest: 0.16,
  });
  const larchMat = new MeshStandardMaterial({
    map: coniferNeedleAtlas(),
    color: "#ffffff",
    roughness: 0.84,
    vertexColors: true,
    side: DoubleSide,
    alphaTest: 0.16,
  });
  const barkMat = new MeshStandardMaterial({
    map: barkTexture(),
    color: "#c5a985",
    roughness: 0.96,
  });
  const snowMat = mappedStandard(maps.snow, { color: "#e7eef3", roughness: 0.78 });
  const rockMat = mappedStandard(maps.alpineRock, { color: "#c5c8c3", roughness: 0.96 });

  const tall = coniferCrown(0.82, 1, 36 * CONIFER_BRANCH_DETAIL, "#315b3b", "#7d9c60");
  const wide = coniferCrown(1.02, 8, 40 * CONIFER_BRANCH_DETAIL, "#3c6846", "#90ad69");
  const larchGeo = coniferCrown(0.76, 21, 26 * CONIFER_BRANCH_DETAIL, "#748246", "#c1b86d");
  const snowGeo = snowCrown();
  const rockGeo = ruggedRock(0.48, 4, 0.7);

  const treeBuckets = Array.from({ length: 8 }, () => ({
    tall: [] as Matrix4[],
    wide: [] as Matrix4[],
    larch: [] as Matrix4[],
    trunks: [] as Matrix4[],
    snow: [] as Matrix4[],
  }));
  const trunkGeo = trunkGeometry();
  const rocks = new InstancedMesh(rockGeo, rockMat, 420);
  rocks.castShadow = true;
  rocks.receiveShadow = true;

  let tallCount = 0;
  let wideCount = 0;
  let larchCount = 0;
  let trunkCount = 0;
  let snowCount = 0;
  let rockCount = 0;
  let treeCount = 0;

  const placeTree = (theta: number, phi: number, scale: number, yaw: number, wideTree: boolean) => {
    if (treeCount >= MAX_ALPINE_TREES) return;
    if (theta < 0.04 || theta > Math.PI - 0.04) return;
    if (isNearTrack(theta, phi, TREE_TRACK_CLEARANCE)) return;
    if (nearMountainSummit(theta, phi)) return;
    if (nearLake(theta, phi)) return;
    const h = heightOffset(theta, phi);
    if (h < -0.55 || h > 14.8) return;
    const meshR = surface.radius(theta, phi);
    const r = (meshR > 1 ? meshR : PLANET.radius + h) - 0.02;
    placeOnSphere(theta, phi, r, scale, 0, yaw);
    const bucket = treeBuckets[
      Math.min(1, Math.floor((theta / Math.PI) * 2)) * 4 +
        Math.min(3, Math.floor((wrapPhi(phi) / (Math.PI * 2)) * 4))
    ];
    const larch = wideTree && hash(yaw * 3.7 + scale) > 0.62 && larchCount < 2200;
    if (larch) {
      bucket.larch.push(tmpMat.clone());
      larchCount++;
    } else if (wideTree) {
      bucket.wide.push(tmpMat.clone());
      wideCount++;
    } else {
      bucket.tall.push(tmpMat.clone());
      tallCount++;
    }
    treeCount++;
    if (trunkCount < MAX_ALPINE_TREES) {
      bucket.trunks.push(tmpMat.clone());
      trunkCount++;
    }
    if (snowFactor(theta, h) > 0.55 && snowCount < MAX_ALPINE_TREES && scale > 1.3) {
      placeOnSphere(theta, phi, r, scale, 0, yaw);
      bucket.snow.push(tmpMat.clone());
      snowCount++;
    }
  };

  // Valley banks first, as irregular stands rather than a row of evenly
  // spaced trees. The rest of the planet is groves: dense in the middle,
  // empty meadow between them.
  for (let i = 0; i < railway.samples.length && treeCount < MAX_ALPINE_TREES; i += 4) {
    const s = railway.samples[i];
    const side = (hash(i * 1.3) > 0.5 ? 1 : -1) * (6 + hash(i * 2.1) * 22);
    const p = s.position.clone().addScaledVector(s.binormal, side);
    const len = p.length() || 1;
    const cTheta = Math.acos(Math.min(1, Math.max(-1, p.y / len)));
    const cPhi = Math.atan2(p.z, p.x);
    const members = 7 + Math.floor(hash(i * 4.4) * 9);
    const spread = 0.03 + hash(i * 6.2) * 0.07;
    for (let t = 0; t < members && treeCount < MAX_ALPINE_TREES; t++) {
      const ang = hash(i * 20 + t * 3.3) * Math.PI * 2;
      const dist = Math.pow(hash(i * 8 + t * 5.1), 0.6) * spread;
      const theta = cTheta + Math.cos(ang) * dist;
      const phi = wrapPhi(cPhi + (Math.sin(ang) * dist) / Math.max(0.3, Math.sin(cTheta)));
      placeTree(theta, phi, 1.45 + hash(i + t * 2) * 1.5, ang, hash(i + t) > 0.5);
    }
  }

  for (let g = 0; g < GROVE_COUNT && treeCount < MAX_ALPINE_TREES; g++) {
    const u = hash(g * 19.1 + 2.3);
    const v = hash(g * 7.7 + 11.2);
    const cTheta = Math.acos(Math.min(1, Math.max(-1, 2 * u - 1)));
    const cPhi = wrapPhi(v * Math.PI * 2);
    const centerH = heightOffset(cTheta, cPhi);
    if (centerH < -0.65 || centerH > 15.2) continue;
    if (nearLake(cTheta, cPhi)) continue;

    const members = 14 + Math.floor(hash(g * 3.1) * 20);
    const spread = 0.045 + hash(g * 5.4) * 0.11;
    for (let t = 0; t < members && treeCount < MAX_ALPINE_TREES; t++) {
      const ang = hash(g * 100 + t * 1.7) * Math.PI * 2;
      const dist = Math.pow(hash(g * 130 + t * 2.3), 0.5) * spread;
      const theta = cTheta + Math.cos(ang) * dist;
      const phi = wrapPhi(cPhi + (Math.sin(ang) * dist) / Math.max(0.3, Math.sin(cTheta)));
      const scale = 1.7 + hash(g * 17 + t) * 1.25;
      placeTree(theta, phi, scale, ang, hash(t * 9 + g) > 0.45);
    }
  }

  if (rockCount < 420) {
    for (let i = 0; i < 900 && rockCount < 420; i++) {
      const theta = hash(i * 2.2) * Math.PI;
      const phi = hash(i * 3.7) * Math.PI * 2;
      const h = heightOffset(theta, phi);
      if (h < 4.0 || h > 16.5) continue;
      if (isNearTrack(theta, phi, 0.04) || nearLake(theta, phi)) continue;
      if (hash(i * 8.8) < 0.72) continue;
      const meshR = surface.radius(theta, phi);
      const r = (meshR > 1 ? meshR : PLANET.radius + h) - 0.04;
      placeOnSphere(theta, phi, r, 0.4 + hash(i) * 0.7, 0, hash(i * 1.1) * 6);
      rocks.setMatrixAt(rockCount++, tmpMat.clone());
    }
  }

  for (const bucket of treeBuckets) {
    addInstances(tall, foliage, bucket.tall, "spruce-tall");
    addInstances(wide, foliageB, bucket.wide, "spruce-wide");
    addInstances(larchGeo, larchMat, bucket.larch, "larch");
    addInstances(trunkGeo, barkMat, bucket.trunks, "tree-trunks");
    addInstances(snowGeo, snowMat, bucket.snow, "pine-snow");
  }
  rocks.count = rockCount;
  rocks.instanceMatrix.needsUpdate = true;
  rocks.name = "alpine-rocks";
  root.add(rocks);

  function addInstances(
    geometry: BufferGeometry,
    material: MeshStandardMaterial,
    matrices: Matrix4[],
    name: string,
  ): void {
    if (matrices.length === 0) return;
    const mesh = new InstancedMesh(geometry, material, matrices.length);
    for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.name = name;
    mesh.castShadow = false;
    root.add(mesh);
  }
}

/** Grass tufts, dry-stone walls, and pasture fences along the meadows. */
function plantTrackside(root: Group, surface: PlanetSurface, railway: RailwayPath): void {
  const grassMat = cardMaterial(grassTuftMap(), "#f2f6e4");
  const grassMatB = cardMaterial(grassTuftMap(), "#e7d48a");
  const limestone = mappedStandard(alpineMaps().stone, { color: "#c9c3b8", roughness: 0.94 });

  const grassA = new InstancedMesh(crossedCard(0.55, 0.34), grassMat, 6000);
  const grassB = new InstancedMesh(crossedCard(0.48, 0.46), grassMatB, 2400);
  const stone = new InstancedMesh(ruggedRock(0.22, 2, 0.58), limestone, 2000);
  const boulder = new InstancedMesh(
    ruggedRock(0.55, 9, 0.72),
    mappedStandard(alpineMaps().alpineRock, { color: "#c5c8c3", roughness: 0.96 }),
    800,
  );
  const fenceWood = mappedStandard(alpineMaps().wood, { color: "#6b5340", roughness: 0.86 });
  const postGeo = new CylinderGeometry(0.035, 0.05, 0.62, 5);
  postGeo.translate(0, 0.31, 0);
  const railGeo = new BoxGeometry(0.045, 0.045, 0.78);
  const posts = new InstancedMesh(postGeo, fenceWood, 640);
  const rails = new InstancedMesh(railGeo, fenceWood, 640);

  const cap = {
    grassA: 0,
    grassB: 0,
    stone: 0,
    boulder: 0,
    post: 0,
    rail: 0,
  };

  const seat = (theta: number, phi: number, lift: number) => {
    const meshR = surface.radius(theta, phi);
    const h = heightOffset(theta, phi);
    return (meshR > 1 ? meshR : PLANET.radius + h) + lift;
  };

  const samples = railway.samples;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    const drift = hash(Math.floor(i / 14) * 1.9);
    for (const side of [-1, 1]) {
      if (drift < 0.12) continue;
      const dist = 1.25 + hash(i * 1.3 + side) * 5.4;
      const origin = s.position.clone().addScaledVector(s.binormal, side * dist);
      const here = polarOf(origin);
      if (nearLake(here.theta, here.phi) || !gentleMeadow(here.theta, here.phi)) continue;

      const tufts = 2 + Math.floor(hash(i + side * 5) * 2);
      for (let k = 0; k < tufts; k++) {
        const q = origin
          .clone()
          .addScaledVector(s.tangent, (hash(i * 4 + k) - 0.5) * 1.15)
          .addScaledVector(s.binormal, (hash(i * 6 + k) - 0.5) * 0.85);
        const at = polarOf(q);
        const tall = hash(k + i) > 0.72;
        if (tall && cap.grassB >= 2400) continue;
        if (!tall && cap.grassA >= 6000) continue;
        placeOnSphere(
          at.theta,
          at.phi,
          seat(at.theta, at.phi, -0.02),
          (tall ? 0.68 : 0.58) + hash(k + i) * 0.24,
          0,
          hash(k) * 6,
        );
        if (tall) grassB.setMatrixAt(cap.grassB++, tmpMat.clone());
        else grassA.setMatrixAt(cap.grassA++, tmpMat.clone());
      }

    }

    if (i % 11 === 0 && !s.elevated && drift > 0.22 && cap.stone < 1900) {
      const side = hash(i * 5.1) > 0.5 ? 1 : -1;
      const shoulder = s.position.clone().addScaledVector(s.binormal, side * TRACKSIDE_ROCK_OFFSET);
      const at0 = polarOf(shoulder);
      if (gentleMeadow(at0.theta, at0.phi) && !nearLake(at0.theta, at0.phi)) {
        const courses = hash(i) > 0.45 ? 3 : 2;
        for (let k = 0; k < 9 && cap.stone < 2000; k++) {
          for (let course = 0; course < courses; course++) {
            if (cap.stone >= 2000) break;
            const p = s.position
              .clone()
              .addScaledVector(
                s.binormal,
                side * (TRACKSIDE_ROCK_OFFSET + hash(i + k) * 0.12 + course * 0.02),
              )
              .addScaledVector(s.tangent, (k - 4) * 0.3);
            const at = polarOf(p);
            placeOnSphere(
              at.theta,
              at.phi,
              seat(at.theta, at.phi, -0.04),
              0.75 + hash(i + k + course) * 0.55,
              course * 0.2,
              hash(i + k) * 6.2,
              0.72 + hash(k + course) * 0.4,
            );
            stone.setMatrixAt(cap.stone++, tmpMat.clone());
          }
        }
      }
    }

    if (i % 8 === 0 && !s.elevated && drift > 0.35 && cap.post < 600) {
      const side = hash(i * 2.3) > 0.5 ? 1 : -1;
      const line = s.position
        .clone()
        .addScaledVector(
          s.binormal,
          side * (TRACK.trackSpacing * 0.5 + TRACK.sleeperWidth * 0.5 + 1 + hash(i) * 1.2),
        );
      const at = polarOf(line);
      const h = heightOffset(at.theta, at.phi);
      if (h > 0.2 && h < 3.6 && !nearLake(at.theta, at.phi)) {
        for (let k = 0; k < 4 && cap.post < 640; k++) {
          const p = line.clone().addScaledVector(s.tangent, (k - 1.5) * 0.72);
          const spot = polarOf(p);
          placeOnSphere(
            spot.theta,
            spot.phi,
            seat(spot.theta, spot.phi, -0.01),
            0.85 + hash(i + k) * 0.3,
            0,
            hash(k),
          );
          posts.setMatrixAt(cap.post++, tmpMat.clone());
          if (k < 3 && cap.rail < 620) {
            const mid = line.clone().addScaledVector(s.tangent, (k - 1) * 0.72);
            const midAt = polarOf(mid);
            const railR = seat(midAt.theta, midAt.phi, -0.01);
            placeOnSphere(midAt.theta, midAt.phi, railR, 1, 0.28, 0, 1, s.tangent);
            rails.setMatrixAt(cap.rail++, tmpMat.clone());
            placeOnSphere(midAt.theta, midAt.phi, railR, 1, 0.48, 0, 1, s.tangent);
            rails.setMatrixAt(cap.rail++, tmpMat.clone());
          }
        }
      }
    }

    if (i % 4 === 0 && cap.boulder < 760) {
      const bank = hash(i * 2.2) > 0.5 ? 1 : -1;
      const shoulder = s.position
        .clone()
        .addScaledVector(s.binormal, bank * (TRACKSIDE_ROCK_OFFSET + hash(i) * 0.9));
      const bankAt = polarOf(shoulder);
      if (!nearLake(bankAt.theta, bankAt.phi) && !gentleMeadow(bankAt.theta, bankAt.phi)) {
        const bankH = heightOffset(bankAt.theta, bankAt.phi);
        if (bankH > 0.3 && bankH < 8.2) {
          const pile = 2 + Math.floor(hash(i + 4) * 2);
          for (let k = 0; k < pile && cap.boulder < 800; k++) {
            const q = shoulder.clone().addScaledVector(s.tangent, (hash(i + k) - 0.5) * 1.3);
            const spot = polarOf(q);
            placeOnSphere(
              spot.theta,
              spot.phi,
              seat(spot.theta, spot.phi, -0.02),
              0.32 + hash(i + k) * 0.85,
              0,
              hash(k + i) * 5,
              0.45 + hash(k) * 0.35,
            );
            boulder.setMatrixAt(cap.boulder++, tmpMat.clone());
          }
        }
      }
    }

    if (i % 6 === 0 && cap.boulder < 800 && hash(i * 1.4) > 0.35) {
      const side = hash(i) > 0.5 ? 1 : -1;
      const p = s.position
        .clone()
        .addScaledVector(s.binormal, side * (TRACKSIDE_ROCK_OFFSET + 0.8 + hash(i) * 2.2));
      const at = polarOf(p);
      const h = heightOffset(at.theta, at.phi);
      if (h > 1.4 && h < 7 && !nearLake(at.theta, at.phi)) {
        placeOnSphere(at.theta, at.phi, seat(at.theta, at.phi, -0.04), 0.6 + hash(i) * 1.4, 0, hash(i) * 5, 0.65);
        boulder.setMatrixAt(cap.boulder++, tmpMat.clone());
      }
    }
  }

  const named: Array<[InstancedMesh, number, string]> = [
    [grassA, cap.grassA, "meadow-grass"],
    [grassB, cap.grassB, "meadow-grass-dry"],
    [stone, cap.stone, "dry-stone-wall"],
    [boulder, cap.boulder, "scree"],
    [posts, cap.post, "pasture-posts"],
    [rails, cap.rail, "pasture-rails"],
  ];
  for (const [mesh, count, name] of named) {
    mesh.count = count;
    mesh.name = name;
    mesh.instanceMatrix.needsUpdate = true;
    if (name === "scree" || name === "dry-stone-wall") {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    root.add(mesh);
  }
}

function gentleMeadow(theta: number, phi: number): boolean {
  const h = heightOffset(theta, phi);
  if (h < 0.05 || h > 6.8) return false;
  const e = 0.012;
  const hx = heightOffset(Math.min(Math.PI - 0.02, theta + e), phi);
  const hz = heightOffset(theta, wrapPhi(phi + e));
  return Math.max(Math.abs(hx - h), Math.abs(hz - h)) < 0.3;
}

function polarOf(p: Vector3): { theta: number; phi: number } {
  const len = p.length() || 1;
  return {
    theta: Math.acos(Math.min(1, Math.max(-1, p.y / len))),
    phi: Math.atan2(p.z, p.x),
  };
}

function plantChalets(
  root: Group,
  surface: PlanetSurface,
  railway: RailwayPath,
  isNearTrack: TrackProximity,
): void {
  const villages = [SITES.villageA, SITES.villageB, SITES.villageC, SITES.chaletRidge];
  for (const village of villages) {
    const cluster = new Group();
    cluster.name = `chalets-${village.id}`;
    const n = village.kind === "chalet" ? 4 : 14;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + village.phi * 0.1;
      const dTheta = Math.cos(ang) * 0.04;
      const dPhi = Math.sin(ang) * 0.05;
      const theta = village.theta + dTheta;
      const phi = wrapPhi(village.phi + dPhi);
      if (isNearTrack(theta, phi, 0.035)) continue;
      const h = heightOffset(theta, phi);
      const meshR = surface.radius(theta, phi);
      const ground = meshR > 1 ? meshR : PLANET.radius + h;
      const chalet = makeChalet();
      const s = 1.25 + (i % 3) * 0.18;
      placeOnSphere(theta, phi, ground + 0.2 * s - 0.04, s, 0, ang);
      chalet.matrix.copy(tmpMat);
      chalet.matrixAutoUpdate = false;
      cluster.add(chalet);
    }
    root.add(cluster);
  }
  plantValleyHouses(root, surface, railway, isNearTrack);
}

function plantValleyHouses(
  root: Group,
  surface: PlanetSurface,
  railway: RailwayPath,
  isNearTrack: TrackProximity,
): void {
  const cluster = new Group();
  cluster.name = "valley-houses";
  let placed = 0;
  const samples = railway.samples;
  for (let i = 30; i < samples.length && placed < 22; i += 32) {
    const s = samples[i];
    if (s.elevated) continue;
    const side = hash(i * 1.7) > 0.5 ? 1 : -1;
    const dist = 5.4 + hash(i + 2) * 3.2;
    const p = s.position.clone().addScaledVector(s.binormal, side * dist);
    const at = polarOf(p);
    if (isNearTrack(at.theta, at.phi, 0.035)) continue;
    const h = heightOffset(at.theta, at.phi);
    if (h < 0.25 || h > 5.8 || nearLake(at.theta, at.phi, 0.05) || !gentleMeadow(at.theta, at.phi)) continue;
    const meshR = surface.radius(at.theta, at.phi);
    const ground = meshR > 1 ? meshR : PLANET.radius + h;
    const house = makeChalet();
    const scale = 1.2 + hash(i) * 0.35;
    placeOnSphere(at.theta, at.phi, ground + 0.2 * scale - 0.04, scale, 0, 0, 1, s.position);
    house.matrix.copy(tmpMat);
    house.matrixAutoUpdate = false;
    cluster.add(house);
    placed++;
  }
  root.add(cluster);
}

function makeChalet(): Group {
  const maps = alpineMaps();
  const plaster = mappedStandard(maps.stone, { color: "#f4f0e6", roughness: 0.82 });
  const wood = mappedStandard(maps.wood, { color: "#6a4a30", roughness: 0.78 });
  const timber = mappedStandard(maps.wood, { color: "#3d2a1c", roughness: 0.8 });
  const stone = mappedStandard(maps.stone, { color: "#9a948a", roughness: 0.94 });
  const roofMat = mappedStandard(maps.roof, { color: "#4a4038", roughness: 0.72 });
  const glass = new MeshStandardMaterial({
    color: "#243038",
    roughness: 0.15,
    metalness: 0.35,
  });
  const bloom = new MeshStandardMaterial({ color: "#c43848", roughness: 0.55 });
  const leaf = new MeshStandardMaterial({ color: "#2f6b34", roughness: 0.8 });
  const g = new Group();

  const add = (mesh: Mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };

  add(new Mesh(new BoxGeometry(1.7, 0.72, 1.4), stone)).position.y = 0.16;

  const wall = add(new Mesh(new BoxGeometry(1.4, 0.95, 1.05), wood));
  wall.position.y = 0.85;

  const upper = add(new Mesh(new BoxGeometry(1.28, 0.62, 0.92), plaster));
  upper.position.y = 1.22;

  for (const x of [-0.62, 0.62]) {
    const post = add(new Mesh(new BoxGeometry(0.07, 1.15, 1.08), timber));
    post.position.set(x, 0.95, 0);
  }
  for (const z of [-0.5, 0.5]) {
    const beam = add(new Mesh(new BoxGeometry(1.42, 0.07, 0.07), timber));
    beam.position.set(0, 0.48, z);
  }

  const balcony = add(new Mesh(new BoxGeometry(1.5, 0.05, 0.42), wood));
  balcony.position.set(0, 0.98, 0.68);
  const rail = add(new Mesh(new BoxGeometry(1.46, 0.08, 0.04), timber));
  rail.position.set(0, 1.14, 0.86);
  for (const x of [-0.66, 0.66]) {
    const post = add(new Mesh(new BoxGeometry(0.04, 0.2, 0.04), timber));
    post.position.set(x, 1.08, 0.86);
  }
  for (let i = 0; i < 7; i++) {
    const x = -0.48 + i * 0.16;
    const pot = add(new Mesh(new SphereGeometry(0.055, 6, 5), bloom));
    pot.position.set(x, 1.08, 0.72);
    const greens = add(new Mesh(new SphereGeometry(0.04, 5, 4), leaf));
    greens.position.set(x, 1.14, 0.7);
  }

  const windows: Array<[number, number, number]> = [
    [-0.38, 1.22, 0.47],
    [0.38, 1.22, 0.47],
    [0, 0.72, 0.54],
    [-0.4, 0.72, 0.54],
    [0.4, 0.72, 0.54],
  ];
  for (const [x, y, z] of windows) {
    const pane = add(new Mesh(new BoxGeometry(0.2, 0.28, 0.04), glass));
    pane.position.set(x, y, z);
    for (const side of [-1, 1]) {
      const shutter = add(new Mesh(new BoxGeometry(0.07, 0.3, 0.03), timber));
      shutter.position.set(x + side * 0.15, y, z + 0.01);
    }
  }

  const roofL = add(new Mesh(new BoxGeometry(0.95, 0.07, 1.55), roofMat));
  roofL.position.set(-0.34, 1.72, 0);
  roofL.rotation.z = 0.72;
  const roofR = add(new Mesh(new BoxGeometry(0.95, 0.07, 1.55), roofMat));
  roofR.position.set(0.34, 1.72, 0);
  roofR.rotation.z = -0.72;

  const chimney = add(new Mesh(new BoxGeometry(0.16, 0.42, 0.16), stone));
  chimney.position.set(0.42, 1.95, -0.28);
  const cap = add(new Mesh(new BoxGeometry(0.22, 0.04, 0.22), stone));
  cap.position.set(0.42, 2.16, -0.28);

  const stall = add(new Mesh(new BoxGeometry(0.72, 0.58, 0.7), wood));
  stall.position.set(1.05, 0.5, -0.15);
  const stallRoof = add(new Mesh(new BoxGeometry(0.88, 0.06, 0.86), roofMat));
  stallRoof.position.set(1.05, 0.84, -0.15);
  stallRoof.rotation.z = -0.18;

  return g;
}

function placeOnSphere(
  theta: number,
  phi: number,
  radius: number,
  scale: number,
  alongNormal: number,
  yaw = 0,
  squashY = 1,
  alignZ?: Vector3,
): void {
  tmpPos.copy(sphToCart(radius, theta, phi));
  const normal = tmpPos.clone().normalize();
  tmpPos.addScaledVector(normal, alongNormal);
  // Trunk is local +Y. Build the basis so that axis is the surface normal,
  // then spin the other two axes around it. A quaternion yaw was tipping trunks.
  if (alignZ) {
    axisZ.copy(alignZ).addScaledVector(normal, -alignZ.dot(normal));
    if (axisZ.lengthSq() < 1e-8) axisZ.set(1, 0, 0);
    axisZ.normalize();
    axisX.crossVectors(normal, axisZ).normalize();
  } else {
    refAxis.set(Math.abs(normal.y) > 0.9 ? 1 : 0, Math.abs(normal.y) > 0.9 ? 0 : 1, 0);
    axisX.crossVectors(refAxis, normal).normalize();
    if (yaw) axisX.applyAxisAngle(normal, yaw);
    axisZ.crossVectors(axisX, normal).normalize();
    axisX.crossVectors(normal, axisZ).normalize();
  }
  tmpMat.makeBasis(axisX, normal, axisZ);
  tmpMat.scale(tmpScale.set(scale, scale * squashY, scale));
  tmpMat.setPosition(tmpPos);
}

export function createTrackProximity(railway: RailwayPath): TrackProximity {
  const directions = railway.samples
    .filter((_, index) => index % 2 === 0)
    .map((sample) => sample.position.clone().normalize());
  const candidate = new Vector3();

  return (theta, phi, reach) => {
    const sinTheta = Math.sin(theta);
    candidate.set(sinTheta * Math.cos(phi), Math.cos(theta), sinTheta * Math.sin(phi));
    const minDot = Math.cos(reach);
    for (const direction of directions) {
      if (candidate.dot(direction) > minDot) return true;
    }
    return false;
  };
}

export function nearMountainSummit(theta: number, phi: number): boolean {
  return MOUNTAIN_SUMMIT_CENTERS.some(
    (center) => angularDistance(theta, phi, center.theta, center.phi) < TREE_SUMMIT_CLEARANCE,
  );
}

function nearLake(theta: number, phi: number, extra = 0): boolean {
  for (const lake of LAKES) {
    const reach = lake.radius * 1.18 / PLANET.radius + 0.025 + extra;
    if (angularDistance(theta, phi, lake.site.theta, lake.site.phi) < reach) return true;
  }
  return false;
}

export function updateLife(_scenery: Group, _t: number): void {
  // Reserved for subtle ambient motion
}
