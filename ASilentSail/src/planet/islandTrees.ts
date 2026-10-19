import {
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from "three";
import { hash01 } from "../flight/math/noise";
import { sphToCart } from "../flight/math/sphere";
import { WATER_LEVEL } from "../config";
import { SETTLEMENT_ISLANDS, heightOffset, isDryLand, slopeMagnitude, surfaceRadius } from "./height";
import { SITES } from "../flight/planet/features";

const dummy = new Object3D();
const up = new Vector3(0, 1, 0);

const GROVES = [
  ...SETTLEMENT_ISLANDS.map((s) => ({ theta: s.theta, phi: s.phi, reach: 0.14, count: 90 })),
  { theta: SITES.castle.theta, phi: SITES.castle.phi, reach: 0.12, count: 70 },
  { theta: SITES.ancientTree.theta, phi: SITES.ancientTree.phi, reach: 0.16, count: 110 },
  { theta: SITES.shrine.theta, phi: SITES.shrine.phi, reach: 0.1, count: 50 },
  { theta: SITES.tower.theta, phi: SITES.tower.phi, reach: 0.1, count: 45 },
  { theta: SITES.peakNorth.theta, phi: SITES.peakNorth.phi, reach: 0.14, count: 60 },
  { theta: SITES.peakWest.theta, phi: SITES.peakWest.phi, reach: 0.12, count: 50 },
  { theta: SITES.peakEast.theta, phi: SITES.peakEast.phi, reach: 0.12, count: 50 },
];

export function createIslandTrees(): Group {
  const group = new Group();
  group.name = "island-trees";

  const trunkGeo = new CylinderGeometry(0.045, 0.09, 0.55, 6);
  trunkGeo.translate(0, 0.275, 0);
  const pineGeo = new ConeGeometry(0.26, 0.95, 7);
  pineGeo.translate(0, 0.55, 0);
  const canopyGeo = new SphereGeometry(0.38, 7, 6);
  canopyGeo.translate(0, 0.62, 0);

  const trunkMat = new MeshStandardMaterial({ color: "#4a3428", roughness: 0.92 });
  const pineMat = new MeshStandardMaterial({ color: "#234a36", roughness: 0.76 });
  const leafA = new MeshStandardMaterial({ color: "#2f5a38", roughness: 0.78 });
  const leafB = new MeshStandardMaterial({ color: "#3f6b3c", roughness: 0.8 });

  const candidates: { theta: number; phi: number; kind: number; scale: number }[] = [];
  for (const grove of GROVES) {
    for (let i = 0; i < grove.count; i++) {
      const ang = Math.sqrt(hash01(i, grove.theta, 1, 3)) * grove.reach;
      const rot = hash01(i, grove.phi, 2, 5) * Math.PI * 2;
      const theta = grove.theta + Math.cos(rot) * ang;
      const phi = grove.phi + (Math.sin(rot) * ang) / Math.max(0.35, Math.sin(grove.theta));
      if (!isDryLand(theta, phi, 0.18)) continue;
      const h = heightOffset(theta, phi);
      if (h < WATER_LEVEL + 0.35 || h > 8.8) continue;
      if (slopeMagnitude(theta, phi) > 6.2) continue;
      candidates.push({
        theta,
        phi,
        kind: hash01(theta, phi, i, 11) < 0.42 ? 1 : 0,
        scale: 0.8 + hash01(theta, phi, i, 13) * 0.9,
      });
    }
  }

  const trunks = new InstancedMesh(trunkGeo, trunkMat, Math.max(1, candidates.length));
  const pines = new InstancedMesh(pineGeo, pineMat, Math.max(1, candidates.length));
  const canopies = new InstancedMesh(canopyGeo, leafA, Math.max(1, candidates.length));
  const canopiesB = new InstancedMesh(canopyGeo, leafB, Math.max(1, candidates.length));
  for (const m of [trunks, pines, canopies, canopiesB]) {
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.castShadow = true;
    m.receiveShadow = true;
  }

  let ti = 0;
  let pi = 0;
  let c1 = 0;
  let c2 = 0;
  for (const c of candidates) {
    const pos = sphToCart(surfaceRadius(c.theta, c.phi), c.theta, c.phi);
    dummy.position.copy(pos);
    dummy.quaternion.setFromUnitVectors(up, pos.clone().normalize());
    dummy.scale.setScalar(c.scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(ti++, dummy.matrix);
    if (c.kind === 1) pines.setMatrixAt(pi++, dummy.matrix);
    else {
      canopies.setMatrixAt(c1++, dummy.matrix);
      if (hash01(c.theta, c.phi, 2, 17) > 0.45) canopiesB.setMatrixAt(c2++, dummy.matrix);
    }
  }
  trunks.count = ti;
  pines.count = pi;
  canopies.count = c1;
  canopiesB.count = c2;
  for (const m of [trunks, pines, canopies, canopiesB]) m.instanceMatrix.needsUpdate = true;
  group.add(trunks, pines, canopies, canopiesB);
  return group;
}
