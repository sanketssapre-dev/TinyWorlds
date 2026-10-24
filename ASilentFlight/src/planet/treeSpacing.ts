import { Vector3 } from "three";
import { PLANET } from "../config";
import { sphToCart } from "../math/sphere";

export type TreeSite = {
  theta: number;
  phi: number;
  kind: number;
  scale: number;
  /** Pines up on the high ground wear a cap of snow. */
  snowy?: boolean;
};

/**
 * Half the width of the widest part of a tree, in world units.
 *
 * Taken from the geometry each kind is actually planted with: pines are
 * narrow cones, birches a little wider, broadleaf crowns widest.
 */
export function treeFootprint(kind: number, scale: number): number {
  if (kind === 1) return 0.29 * 1.17 * scale;
  if (kind === 2) return 0.42 * 0.936 * scale;
  return 0.42 * 1.3 * scale;
}

/**
 * How close two trunks must stand, as a fraction of the width of their two
 * canopies together, before the pair counts as sitting on top of each other.
 *
 * Deliberately well below 1. A wood where canopies brush reads as a wood, and
 * the groves are planted far too densely to separate every canopy anyway —
 * measured, the average tree stands 0.60 units from its neighbour while its
 * canopy is 1.61 wide. What has to go is the trees that are practically
 * concentric, which read as one lump rather than as two trees.
 */
export const CROWDING = 0.3;

/**
 * Drop only the trees planted almost on top of one another.
 *
 * The planting is walked in order and a tree is kept unless it crowds a tree
 * already kept. Survivors are returned untouched — same angles, bit for bit —
 * so each grove keeps its shape and extent, and no well-spaced tree moves at
 * all.
 */
export function thinCrowdedTrees(sites: TreeSite[], crowding = CROWDING): TreeSite[] {
  const n = sites.length;
  if (n < 2) return sites.slice();

  const dirs = new Array<Vector3>(n);
  const radii = new Array<number>(n);
  let widest = 0;
  for (let i = 0; i < n; i++) {
    dirs[i] = sphToCart(1, sites[i].theta, sites[i].phi).normalize();
    radii[i] = treeFootprint(sites[i].kind, sites[i].scale);
    if (radii[i] > widest) widest = radii[i];
  }

  // Bucket by direction in 3D rather than by theta/phi: a theta/phi grid
  // collapses to nothing near the poles, where a whole ring of cells would have
  // to be searched. The cell is as wide as the widest pair we would ever
  // reject, so scanning one cell either way finds every candidate.
  const cell = Math.max(1e-4, (widest * 2 * crowding) / PLANET.radius);
  const span = Math.max(1, Math.ceil(2 / cell));
  const grid = new Map<number, number[]>();
  const key = (x: number, y: number, z: number): number => (x * span + y) * span + z;
  const coord = (v: number): number =>
    Math.max(0, Math.min(span - 1, Math.floor(((v + 1) / 2) * span)));

  const kept: TreeSite[] = [];

  for (let i = 0; i < n; i++) {
    const x = coord(dirs[i].x);
    const y = coord(dirs[i].y);
    const z = coord(dirs[i].z);

    let crowded = false;
    search: for (let dx = -1; dx <= 1; dx++) {
      const gx = x + dx;
      if (gx < 0 || gx >= span) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const gy = y + dy;
        if (gy < 0 || gy >= span) continue;
        for (let dz = -1; dz <= 1; dz++) {
          const gz = z + dz;
          if (gz < 0 || gz >= span) continue;
          const bucket = grid.get(key(gx, gy, gz));
          if (!bucket) continue;
          for (const j of bucket) {
            const limit = (radii[i] + radii[j]) * crowding;
            const dot = Math.max(-1, Math.min(1, dirs[i].dot(dirs[j])));
            if (dot > Math.cos(limit / PLANET.radius)) {
              crowded = true;
              break search;
            }
          }
        }
      }
    }
    if (crowded) continue;

    kept.push(sites[i]);
    const bucketKey = key(x, y, z);
    const bucket = grid.get(bucketKey);
    if (bucket) bucket.push(i);
    else grid.set(bucketKey, [i]);
  }

  return kept;
}

/** How many pairs sit closer than `crowding` times their two canopies together. */
export function countCrowdedPairs(sites: TreeSite[], crowding = CROWDING): number {
  const n = sites.length;
  const dirs = new Array<Vector3>(n);
  const radii = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    dirs[i] = sphToCart(1, sites[i].theta, sites[i].phi).normalize();
    radii[i] = treeFootprint(sites[i].kind, sites[i].scale);
  }
  let crowded = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const limit = (radii[i] + radii[j]) * crowding;
      const dot = Math.max(-1, Math.min(1, dirs[i].dot(dirs[j])));
      if (dot > Math.cos(limit / PLANET.radius)) crowded++;
    }
  }
  return crowded;
}
