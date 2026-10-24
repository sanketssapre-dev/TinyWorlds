import { BufferGeometry, Group, Mesh } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Fold a set of geometries into one, leaving each part's baked transform in its
 * vertices. Used to build a single tree silhouette out of several primitives,
 * so the whole tree still costs one instance and one draw.
 */
export function mergeGeometryParts(parts: BufferGeometry[]): BufferGeometry {
  const pieces = parts.map((geometry) => geometry.clone());
  const merged = mergeGeometries(pieces, false);
  for (const geometry of pieces) geometry.dispose();
  if (!merged) throw new Error("Could not merge geometry parts.");
  return merged;
}

/**
 * Fold rigid meshes that share a material and the same shadow flags into one
 * draw. Local transforms are baked. Source geometries are not disposed, so
 * shared hull and body primitives stay usable.
 */
export function mergeRigidMeshes(parent: Group, meshes: Mesh[]): void {
  const buckets = new Map<string, Mesh[]>();
  for (const mesh of meshes) {
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const key = `${material.uuid}:${mesh.castShadow ? 1 : 0}:${mesh.receiveShadow ? 1 : 0}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(mesh);
    else buckets.set(key, [mesh]);
  }

  for (const bucket of buckets.values()) {
    if (bucket.length === 1) {
      parent.add(bucket[0]);
      continue;
    }
    const pieces: BufferGeometry[] = [];
    for (const mesh of bucket) {
      const geo = mesh.geometry.clone();
      mesh.updateMatrix();
      geo.applyMatrix4(mesh.matrix);
      pieces.push(geo);
    }
    const merged = mergeGeometries(pieces, false);
    for (const geo of pieces) geo.dispose();
    if (!merged) {
      for (const mesh of bucket) parent.add(mesh);
      continue;
    }
    const mesh = new Mesh(merged, bucket[0].material);
    mesh.castShadow = bucket[0].castShadow;
    mesh.receiveShadow = bucket[0].receiveShadow;
    parent.add(mesh);
  }
}
