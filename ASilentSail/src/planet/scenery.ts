import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  Texture,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PLANET } from "../config";
import { angularDistance, sphToCart, wrapPhi } from "../math/sphere";
import {
  alpineMaps,
  buttercupMap,
  edelweissMap,
  gentianMap,
  grassTuftMap,
  mappedStandard,
  roseMap,
} from "../render/materials";
import { heightOffset, snowFactor } from "./height";
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

export const sceneryTime = { value: 0 };

export function buildAlpineScenery(
  surface: PlanetSurface,
  railway: RailwayPath,
): Group {
  const root = new Group();
  root.name = "alpine-scenery";

  plantPines(root, surface, railway);
  plantTrackside(root, surface, railway);
  plantChalets(root, surface, railway);
  return root;
}

function trunkGeometry(): BufferGeometry {
  const trunk = new CylinderGeometry(0.06, 0.12, 0.42, 6);
  trunk.translate(0, 0.2, 0);
  const flare = new CylinderGeometry(0.1, 0.18, 0.22, 6);
  flare.translate(0, 0.08, 0);
  return mergeParts([trunk, flare]);
}

/** Clumps in a ragged cone, so the crown is a tree and not a stack of perfect cones. */
function clumpFoliage(spread: number, seed: number, clumps: number, bias: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < clumps; i++) {
    const t = Math.pow(hash(seed + i * 1.37), bias);
    const y = 0.02 + t * (1.45 + spread * 0.2);
    const env = spread * (1.15 * (1 - t) + 0.1) * (0.7 + hash(seed + i * 2.1) * 0.55);
    const ang = hash(seed + i * 3.3) * Math.PI * 2;
    const rad = 0.22 + hash(seed + i * 5.1) * 0.16 * Math.max(0.8, spread);
    const clump = new IcosahedronGeometry(rad, 0);
    clump.scale(1, 0.66 + hash(seed + i) * 0.2, 1);
    clump.translate(Math.cos(ang) * env, y, Math.sin(ang) * env);
    parts.push(clump);
  }
  return mergeParts(parts);
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
    const n = 0.84 + hash(seed + i * 1.9) * 0.28;
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

function plantPines(root: Group, surface: PlanetSurface, railway: RailwayPath): void {
  const maps = alpineMaps();
  const foliage = new MeshStandardMaterial({ color: "#1e4a32", roughness: 0.9 });
  const foliageB = new MeshStandardMaterial({ color: "#2c5a3c", roughness: 0.88 });
  const larchMat = new MeshStandardMaterial({ color: "#8a9344", roughness: 0.84 });
  const bark = new MeshStandardMaterial({ color: "#5c4032", roughness: 0.92 });
  const snowMat = mappedStandard(maps.snow, { color: "#e7eef3", roughness: 0.78 });
  const rockMat = mappedStandard(maps.rock, { roughness: 0.94 });

  const tall = clumpFoliage(1.05, 1, 36, 1.25);
  const wide = clumpFoliage(1.32, 8, 32, 1.05);
  const larchGeo = clumpFoliage(0.82, 21, 20, 0.85);
  const snowGeo = snowCrown();
  const rockGeo = ruggedRock(0.48, 4, 0.7);

  const maxTrees = 9000;
  const tallMesh = new InstancedMesh(tall, foliage, maxTrees);
  const wideMesh = new InstancedMesh(wide, foliageB, maxTrees);
  const larchMesh = new InstancedMesh(larchGeo, larchMat, 2200);
  const trunkMesh = new InstancedMesh(trunkGeometry(), bark, maxTrees);
  const snowCaps = new InstancedMesh(snowGeo, snowMat, maxTrees);
  const rocks = new InstancedMesh(rockGeo, rockMat, 420);
  tallMesh.castShadow = true;
  wideMesh.castShadow = true;
  larchMesh.castShadow = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;

  let tallCount = 0;
  let wideCount = 0;
  let larchCount = 0;
  let trunkCount = 0;
  let snowCount = 0;
  let rockCount = 0;

  const placeTree = (theta: number, phi: number, scale: number, yaw: number, wideTree: boolean) => {
    if (tallCount + wideCount + larchCount >= maxTrees) return;
    if (theta < 0.04 || theta > Math.PI - 0.04) return;
    const h = heightOffset(theta, phi);
    if (h < -0.35 || h > 8.2) return;
    if (nearTrack(railway, theta, phi, 0.07)) return;
    if (nearLake(theta, phi)) return;
    const meshR = surface.radius(theta, phi);
    const r = (meshR > 1 ? meshR : PLANET.radius + h) + 0.04;
    placeOnSphere(theta, phi, r, scale, 0, yaw);
    const larch = wideTree && hash(yaw * 3.7 + scale) > 0.62 && larchCount < 2200;
    if (larch) larchMesh.setMatrixAt(larchCount++, tmpMat.clone());
    else if (wideTree) wideMesh.setMatrixAt(wideCount++, tmpMat.clone());
    else tallMesh.setMatrixAt(tallCount++, tmpMat.clone());
    if (trunkCount < maxTrees) trunkMesh.setMatrixAt(trunkCount++, tmpMat.clone());
    if (snowFactor(theta, h) > 0.55 && snowCount < maxTrees && scale > 1.3) {
      placeOnSphere(theta, phi, r, scale, 0, yaw);
      snowCaps.setMatrixAt(snowCount++, tmpMat.clone());
    }
  };

  // Valley banks first, as irregular stands rather than a row of evenly
  // spaced trees. The rest of the planet is groves: dense in the middle,
  // empty meadow between them.
  for (let i = 0; i < railway.samples.length && tallCount + wideCount < maxTrees; i += 5) {
    const s = railway.samples[i];
    const side = (hash(i * 1.3) > 0.5 ? 1 : -1) * (6 + hash(i * 2.1) * 22);
    const p = s.position.clone().addScaledVector(s.binormal, side);
    const len = p.length() || 1;
    const cTheta = Math.acos(Math.min(1, Math.max(-1, p.y / len)));
    const cPhi = Math.atan2(p.z, p.x);
    const members = 4 + Math.floor(hash(i * 4.4) * 7);
    const spread = 0.02 + hash(i * 6.2) * 0.045;
    for (let t = 0; t < members && tallCount + wideCount < maxTrees; t++) {
      const ang = hash(i * 20 + t * 3.3) * Math.PI * 2;
      const dist = Math.pow(hash(i * 8 + t * 5.1), 0.6) * spread;
      const theta = cTheta + Math.cos(ang) * dist;
      const phi = wrapPhi(cPhi + (Math.sin(ang) * dist) / Math.max(0.3, Math.sin(cTheta)));
      placeTree(theta, phi, 1.05 + hash(i + t * 2) * 1.2, ang, hash(i + t) > 0.5);
    }
  }

  const groveCount = 200;
  for (let g = 0; g < groveCount && tallCount + wideCount < maxTrees; g++) {
    const u = hash(g * 19.1 + 2.3);
    const v = hash(g * 7.7 + 11.2);
    const cTheta = Math.acos(Math.min(1, Math.max(-1, 2 * u - 1)));
    const cPhi = wrapPhi(v * Math.PI * 2);
    const centerH = heightOffset(cTheta, cPhi);
    if (centerH < -0.45 || centerH > 8.4) continue;
    if (nearLake(cTheta, cPhi)) continue;

    const members = 10 + Math.floor(hash(g * 3.1) * 18);
    const spread = 0.04 + hash(g * 5.4) * 0.1;
    for (let t = 0; t < members && tallCount + wideCount < maxTrees; t++) {
      const ang = hash(g * 100 + t * 1.7) * Math.PI * 2;
      const dist = Math.pow(hash(g * 130 + t * 2.3), 0.5) * spread;
      const theta = cTheta + Math.cos(ang) * dist;
      const phi = wrapPhi(cPhi + (Math.sin(ang) * dist) / Math.max(0.3, Math.sin(cTheta)));
      const scale = 1.15 + hash(g * 17 + t) * 0.85;
      placeTree(theta, phi, scale, ang, hash(t * 9 + g) > 0.45);
    }
  }

  if (rockCount < 420) {
    for (let i = 0; i < 900 && rockCount < 420; i++) {
      const theta = hash(i * 2.2) * Math.PI;
      const phi = hash(i * 3.7) * Math.PI * 2;
      const h = heightOffset(theta, phi);
      if (h < 2.4 || h > 8.5) continue;
      if (nearTrack(railway, theta, phi, 0.04) || nearLake(theta, phi)) continue;
      if (hash(i * 8.8) < 0.72) continue;
      const r = PLANET.radius + h + 0.05;
      placeOnSphere(theta, phi, r, 0.4 + hash(i) * 0.7, 0.12, hash(i * 1.1) * 6);
      rocks.setMatrixAt(rockCount++, tmpMat.clone());
    }
  }

  tallMesh.count = tallCount;
  wideMesh.count = wideCount;
  larchMesh.count = larchCount;
  trunkMesh.count = trunkCount;
  snowCaps.count = snowCount;
  rocks.count = rockCount;
  tallMesh.instanceMatrix.needsUpdate = true;
  wideMesh.instanceMatrix.needsUpdate = true;
  larchMesh.instanceMatrix.needsUpdate = true;
  trunkMesh.instanceMatrix.needsUpdate = true;
  snowCaps.instanceMatrix.needsUpdate = true;
  rocks.instanceMatrix.needsUpdate = true;
  tallMesh.name = "spruce-tall";
  wideMesh.name = "spruce-wide";
  larchMesh.name = "larch";
  trunkMesh.name = "tree-trunks";
  snowCaps.name = "pine-snow";
  rocks.name = "alpine-rocks";
  root.add(trunkMesh, tallMesh, wideMesh, larchMesh, snowCaps, rocks);
}

/** Grass, edelweiss, gentians, and limestone walls along the meadows. */
function plantTrackside(root: Group, surface: PlanetSurface, railway: RailwayPath): void {
  const grassMat = cardMaterial(grassTuftMap(), "#f2f6e4");
  const grassMatB = cardMaterial(grassTuftMap(), "#e7d48a");
  const limestone = mappedStandard(alpineMaps().stone, { color: "#c9c3b8", roughness: 0.94 });

  const grassA = new InstancedMesh(crossedCard(0.55, 0.34), grassMat, 6000);
  const grassB = new InstancedMesh(crossedCard(0.48, 0.46), grassMatB, 2400);
  const stars = new InstancedMesh(crossedCard(0.42, 0.56), cardMaterial(edelweissMap()), 900);
  const cups = new InstancedMesh(crossedCard(0.5, 0.48), cardMaterial(buttercupMap()), 800);
  const roses = new InstancedMesh(crossedCard(0.48, 0.5), cardMaterial(roseMap()), 420);
  const bells = new InstancedMesh(crossedCard(0.4, 0.58), cardMaterial(gentianMap()), 380);
  const stone = new InstancedMesh(ruggedRock(0.22, 2, 0.58), limestone, 2000);
  const boulder = new InstancedMesh(ruggedRock(0.55, 9, 0.72), mappedStandard(alpineMaps().rock, { roughness: 0.95 }), 800);
  const fenceWood = mappedStandard(alpineMaps().wood, { color: "#6b5340", roughness: 0.86 });
  const postGeo = new CylinderGeometry(0.035, 0.05, 0.62, 5);
  postGeo.translate(0, 0.31, 0);
  const railGeo = new BoxGeometry(0.045, 0.045, 0.78);
  const posts = new InstancedMesh(postGeo, fenceWood, 640);
  const rails = new InstancedMesh(railGeo, fenceWood, 640);

  const cap = {
    grassA: 0,
    grassB: 0,
    stars: 0,
    cups: 0,
    roses: 0,
    bells: 0,
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
    if (s.inTunnel || tunnelMouth(samples, i)) continue;
    const drift = hash(Math.floor(i / 14) * 1.9);
    for (const side of [-1, 1]) {
      if (drift < 0.12) continue;
      const dist = 1.25 + hash(i * 1.3 + side) * 5.4;
      const origin = s.position.clone().addScaledVector(s.binormal, side * dist);
      const here = polarOf(origin);
      if (nearLake(here.theta, here.phi) || !gentleMeadow(here.theta, here.phi)) continue;

      const tufts = 3 + Math.floor(hash(i + side * 5) * 2);
      for (let k = 0; k < tufts; k++) {
        const q = origin
          .clone()
          .addScaledVector(s.tangent, (hash(i * 4 + k) - 0.5) * 1.15)
          .addScaledVector(s.binormal, (hash(i * 6 + k) - 0.5) * 0.85);
        const at = polarOf(q);
        const tall = hash(k + i) > 0.72;
        if (tall && cap.grassB >= 2400) continue;
        if (!tall && cap.grassA >= 6000) continue;
        const rr = PLANET.radius + heightOffset(at.theta, at.phi) + 0.03;
        placeOnSphere(at.theta, at.phi, rr, (tall ? 0.95 : 0.72) + hash(k + i) * 0.4, 0, hash(k) * 6);
        if (tall) grassB.setMatrixAt(cap.grassB++, tmpMat.clone());
        else grassA.setMatrixAt(cap.grassA++, tmpMat.clone());
      }

      if (i % 2 === 0 && hash(i * 2 + side) > 0.42 && cap.stars < 880) {
        const n = 3 + Math.floor(hash(i + side) * 3);
        for (let k = 0; k < n && cap.stars < 900; k++) {
          const at = polarOf(
            origin
              .clone()
              .addScaledVector(s.tangent, (hash(i + k) - 0.5) * 0.9)
              .addScaledVector(s.binormal, (hash(i * 3 + k) - 0.5) * 0.6),
          );
          const scale = 1.45 + hash(i + side + k) * 0.55;
          placeOnSphere(at.theta, at.phi, PLANET.radius + heightOffset(at.theta, at.phi) + 0.03, scale, 0, hash(i + k) * 6);
          stars.setMatrixAt(cap.stars++, tmpMat.clone());
        }
      }
      if (hash(i * 3 + side) > 0.48 && cap.cups < 800) {
        const at = polarOf(origin.clone().addScaledVector(s.binormal, side * 0.35));
        placeOnSphere(at.theta, at.phi, PLANET.radius + heightOffset(at.theta, at.phi) + 0.03, 1.2 + hash(i) * 0.5, 0, hash(side + i) * 4);
        cups.setMatrixAt(cap.cups++, tmpMat.clone());
      }
      if (hash(i * 5 + side) > 0.72 && cap.roses < 420) {
        const at = polarOf(origin.clone().addScaledVector(s.tangent, 0.4));
        placeOnSphere(at.theta, at.phi, PLANET.radius + heightOffset(at.theta, at.phi) + 0.03, 1.15 + hash(i + 2) * 0.45, 0, 1);
        roses.setMatrixAt(cap.roses++, tmpMat.clone());
      }
      if (hash(i * 7 + side) > 0.74 && cap.bells < 380) {
        const at = polarOf(origin.clone().addScaledVector(s.tangent, -0.35));
        placeOnSphere(at.theta, at.phi, PLANET.radius + heightOffset(at.theta, at.phi) + 0.03, 1.2 + hash(i + 4) * 0.4, 0, 0.2);
        bells.setMatrixAt(cap.bells++, tmpMat.clone());
      }
    }

    if (i % 11 === 0 && !s.elevated && drift > 0.22 && cap.stone < 1900) {
      const side = hash(i * 5.1) > 0.5 ? 1 : -1;
      const shoulder = s.position.clone().addScaledVector(s.binormal, side * 1.7);
      const at0 = polarOf(shoulder);
      if (gentleMeadow(at0.theta, at0.phi) && !nearLake(at0.theta, at0.phi)) {
        const rWall = seat(at0.theta, at0.phi, 0.02);
        const courses = hash(i) > 0.45 ? 3 : 2;
        for (let k = 0; k < 9 && cap.stone < 2000; k++) {
          for (let course = 0; course < courses; course++) {
            if (cap.stone >= 2000) break;
            const p = s.position
              .clone()
              .addScaledVector(s.binormal, side * (1.65 + hash(i + k) * 0.12 + course * 0.02))
              .addScaledVector(s.tangent, (k - 4) * 0.3);
            const at = polarOf(p);
            placeOnSphere(
              at.theta,
              at.phi,
              rWall,
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
      const line = s.position.clone().addScaledVector(s.binormal, side * (3.4 + hash(i) * 1.2));
      const at = polarOf(line);
      const h = heightOffset(at.theta, at.phi);
      if (h > 0.2 && h < 3.6 && !nearLake(at.theta, at.phi)) {
        const r = seat(at.theta, at.phi, 0.02);
        for (let k = 0; k < 4 && cap.post < 640; k++) {
          const p = line.clone().addScaledVector(s.tangent, (k - 1.5) * 0.72);
          const spot = polarOf(p);
          placeOnSphere(spot.theta, spot.phi, r, 0.85 + hash(i + k) * 0.3, 0, hash(k));
          posts.setMatrixAt(cap.post++, tmpMat.clone());
          if (k < 3 && cap.rail < 620) {
            const mid = line.clone().addScaledVector(s.tangent, (k - 1) * 0.72);
            const midAt = polarOf(mid);
            placeOnSphere(midAt.theta, midAt.phi, r, 1, 0.22, 0, 1, s.tangent);
            rails.setMatrixAt(cap.rail++, tmpMat.clone());
            placeOnSphere(midAt.theta, midAt.phi, r, 1, 0.42, 0, 1, s.tangent);
            rails.setMatrixAt(cap.rail++, tmpMat.clone());
          }
        }
      }
    }

    if (i % 4 === 0 && cap.boulder < 760) {
      const bank = hash(i * 2.2) > 0.5 ? 1 : -1;
      const shoulder = s.position.clone().addScaledVector(s.binormal, bank * (1.7 + hash(i) * 2.2));
      const bankAt = polarOf(shoulder);
      if (!nearLake(bankAt.theta, bankAt.phi) && !gentleMeadow(bankAt.theta, bankAt.phi)) {
        const bankH = heightOffset(bankAt.theta, bankAt.phi);
        if (bankH > 0.3 && bankH < 8.2) {
          const pile = 2 + Math.floor(hash(i + 4) * 2);
          for (let k = 0; k < pile && cap.boulder < 800; k++) {
            const q = shoulder.clone().addScaledVector(s.tangent, (hash(i + k) - 0.5) * 1.3);
            const spot = polarOf(q);
            const hh = heightOffset(spot.theta, spot.phi);
            placeOnSphere(
              spot.theta,
              spot.phi,
              PLANET.radius + hh + 0.05,
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
      const p = s.position.clone().addScaledVector(s.binormal, side * (4 + hash(i) * 6));
      const at = polarOf(p);
      const h = heightOffset(at.theta, at.phi);
      if (h > 1.4 && h < 7 && !nearLake(at.theta, at.phi)) {
        placeOnSphere(at.theta, at.phi, seat(at.theta, at.phi, 0.05), 0.6 + hash(i) * 1.4, 0, hash(i) * 5, 0.65);
        boulder.setMatrixAt(cap.boulder++, tmpMat.clone());
      }
    }
  }

  const named: Array<[InstancedMesh, number, string]> = [
    [grassA, cap.grassA, "meadow-grass"],
    [grassB, cap.grassB, "meadow-grass-dry"],
    [stars, cap.stars, "edelweiss"],
    [cups, cap.cups, "buttercup"],
    [roses, cap.roses, "alpine-rose"],
    [bells, cap.bells, "gentian"],
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
  if (h < 0.05 || h > 4.4) return false;
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

function plantChalets(root: Group, surface: PlanetSurface, railway: RailwayPath): void {
  const villages = [SITES.villageA, SITES.villageB, SITES.villageC, SITES.chaletRidge];
  for (const village of villages) {
    const cluster = new Group();
    cluster.name = `chalets-${village.id}`;
    const n = village.kind === "chalet" ? 2 : 5;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + village.phi * 0.1;
      const dTheta = Math.cos(ang) * 0.04;
      const dPhi = Math.sin(ang) * 0.05;
      const theta = village.theta + dTheta;
      const phi = wrapPhi(village.phi + dPhi);
      if (nearTrack(railway, theta, phi, 0.035)) continue;
      const h = heightOffset(theta, phi);
      const r = surface.radius(theta, phi) || PLANET.radius + h;
      const chalet = makeChalet();
      const s = 1.25 + (i % 3) * 0.18;
      placeOnSphere(theta, phi, r - 0.06, s, 0, ang);
      chalet.matrix.copy(tmpMat);
      chalet.matrixAutoUpdate = false;
      cluster.add(chalet);
    }
    root.add(cluster);
  }
  plantValleyHouses(root, surface, railway);
}

function plantValleyHouses(root: Group, surface: PlanetSurface, railway: RailwayPath): void {
  const cluster = new Group();
  cluster.name = "valley-houses";
  let placed = 0;
  const samples = railway.samples;
  for (let i = 30; i < samples.length && placed < 10; i += 64) {
    const s = samples[i];
    if (s.inTunnel || s.elevated) continue;
    const side = hash(i * 1.7) > 0.5 ? 1 : -1;
    const dist = 5.4 + hash(i + 2) * 3.2;
    const p = s.position.clone().addScaledVector(s.binormal, side * dist);
    const at = polarOf(p);
    const h = heightOffset(at.theta, at.phi);
    if (h < 0.25 || h > 3.2 || nearLake(at.theta, at.phi, 0.05) || !gentleMeadow(at.theta, at.phi)) continue;
    const meshR = surface.radius(at.theta, at.phi);
    const r = (meshR > 1 ? meshR : PLANET.radius + h) - 0.06;
    const house = makeChalet();
    const scale = 1.2 + hash(i) * 0.35;
    placeOnSphere(at.theta, at.phi, r, scale, 0, 0, 1, s.position);
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

function tunnelMouth(samples: { inTunnel: boolean }[], index: number): boolean {
  const n = samples.length;
  for (let d = 1; d <= 3; d++) {
    if (samples[(index + d) % n].inTunnel) return true;
    if (samples[(index - d + n) % n].inTunnel) return true;
  }
  return false;
}

function nearTrack(
  railway: RailwayPath,
  theta: number,
  phi: number,
  reach: number,
): boolean {
  // Sparse check against every Nth sample for speed
  const step = 8;
  for (let i = 0; i < railway.samples.length; i += step) {
    const s = railway.samples[i];
    const sph = {
      theta: Math.acos(Math.min(1, Math.max(-1, s.position.y / (s.position.length() || 1)))),
      phi: Math.atan2(s.position.z, s.position.x),
    };
    if (angularDistance(theta, phi, sph.theta, sph.phi) < reach) return true;
  }
  return false;
}

function nearLake(theta: number, phi: number, extra = 0): boolean {
  for (const lake of LAKES) {
    const reach = lake.radius / PLANET.radius + 0.025 + extra;
    if (angularDistance(theta, phi, lake.site.theta, lake.site.phi) < reach) return true;
  }
  return false;
}

export function updateLife(_scenery: Group, _t: number): void {
  // Reserved for subtle ambient motion
}
