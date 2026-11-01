import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import { wrapPhi } from "../math/sphere";
import type { RailwayPath } from "./path";

/** Full bench. The chase camera sits outside the second road, so the
 * slope has to start well past that road or the outer track reads as
 * running along the raw hillside. */
const FLAT = 5.1;
/** Shoulder where the cutting eases back into the hillside. */
const HALF = 7.6;
const ALONG = 2.1;
/** Just under the ballast, so the bed meets the grass instead of floating. */
const SHELF_DROP = 0.06;

/**
 * Lower open-ground vertices beside the railway onto the formation.
 * A constant sideways copy of the centre line otherwise runs into the raw
 * side slope, so the outer road leaves the bed.
 */
export function cutRailwayShelf(geo: BufferGeometry, path: RailwayPath): void {
  const pos = geo.attributes.position as BufferAttribute;
  const samples = path.samples;
  const n = samples.length;
  const open = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (samples[i].inTunnel || samples[i].elevated) continue;
    let clear = true;
    for (let k = -12; k <= 12; k++) {
      const near = samples[(i + k + n) % n];
      if (near.inTunnel || near.elevated) {
        clear = false;
        break;
      }
    }
    if (clear) open[i] = 1;
  }

  const PHI_BINS = 240;
  const bins: number[][] = Array.from({ length: PHI_BINS }, () => []);
  for (let i = 0; i < n; i++) {
    if (!open[i]) continue;
    const p = samples[i].position;
    const b = Math.floor((wrapPhi(Math.atan2(p.z, p.x)) / (Math.PI * 2)) * PHI_BINS) % PHI_BINS;
    bins[b].push(i);
  }

  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = v.length();
    if (r < 1) continue;
    const b = Math.floor((wrapPhi(Math.atan2(v.z, v.x)) / (Math.PI * 2)) * PHI_BINS) % PHI_BINS;

    let bestSide = 0;
    let bestUp = 0;
    let bestR = 0;
    let bestLat = Infinity;
    let found = false;
    for (let k = -8; k <= 8; k++) {
      const list = bins[(b + k + PHI_BINS) % PHI_BINS];
      for (let j = 0; j < list.length; j++) {
        const s = samples[list[j]];
        const dx = v.x - s.position.x;
        const dy = v.y - s.position.y;
        const dz = v.z - s.position.z;
        const along = dx * s.tangent.x + dy * s.tangent.y + dz * s.tangent.z;
        if (Math.abs(along) > ALONG) continue;
        const side = dx * s.binormal.x + dy * s.binormal.y + dz * s.binormal.z;
        const absSide = Math.abs(side);
        if (absSide > HALF) continue;
        const up = dx * s.normal.x + dy * s.normal.y + dz * s.normal.z;
        const lat = absSide + Math.abs(along) * 0.35;
        if (lat < bestLat) {
          bestLat = lat;
          bestSide = absSide;
          bestUp = up;
          bestR = s.trackRadius;
          found = true;
        }
      }
    }
    if (!found || bestUp < 0.08) continue;
    // Shave the berm. A hard cap here left the slope standing just past the outer rail.
    if (bestUp > 11) continue;

    const edge = Math.min(1, Math.max(0, (bestSide - FLAT) / (HALF - FLAT)));
    const keep = edge * edge;
    const shelf = bestR - SHELF_DROP;
    const newR = shelf + (r - shelf) * keep;
    if (newR < r - 0.02) {
      v.multiplyScalar(newR / r);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
}
