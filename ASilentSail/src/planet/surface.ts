import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import { wrapPhi } from "../math/sphere";

const THETA_BINS = 72;
const PHI_BINS = 144;

export type PlanetSurface = {
  /** Radius of the visible mesh along this direction. 0 when the lookup misses. */
  radius(theta: number, phi: number): number;
};

const a = new Vector3();
const b = new Vector3();
const c = new Vector3();
const dir = new Vector3();
const edge1 = new Vector3();
const edge2 = new Vector3();
const pvec = new Vector3();
const tvec = new Vector3();
const qvec = new Vector3();

export function indexPlanetSurface(geo: BufferGeometry): PlanetSurface {
  const pos = geo.attributes.position as BufferAttribute;
  const indexed = geo.index;
  const triCount = indexed ? indexed.count / 3 : Math.floor(pos.count / 3);
  const corner = (tri: number, k: number) => (indexed ? indexed.getX(tri * 3 + k) : tri * 3 + k);
  const bins: number[][] = Array.from({ length: THETA_BINS * PHI_BINS }, () => []);

  const push = (theta: number, phi: number, tri: number) => {
    const ti = Math.min(THETA_BINS - 1, Math.max(0, Math.floor((theta / Math.PI) * THETA_BINS)));
    const pi = Math.min(PHI_BINS - 1, Math.floor((wrapPhi(phi) / (Math.PI * 2)) * PHI_BINS));
    const bin = bins[ti * PHI_BINS + pi];
    const last = bin.length - 1;
    if (last < 0 || bin[last] !== tri) bin.push(tri);
  };

  for (let tri = 0; tri < triCount; tri++) {
    a.fromBufferAttribute(pos, corner(tri, 0));
    push(Math.acos(Math.min(1, Math.max(-1, a.y / (a.length() || 1)))), Math.atan2(a.z, a.x), tri);
    b.fromBufferAttribute(pos, corner(tri, 1));
    push(Math.acos(Math.min(1, Math.max(-1, b.y / (b.length() || 1)))), Math.atan2(b.z, b.x), tri);
    c.fromBufferAttribute(pos, corner(tri, 2));
    push(Math.acos(Math.min(1, Math.max(-1, c.y / (c.length() || 1)))), Math.atan2(c.z, c.x), tri);
  }

  const seen = new Uint32Array(triCount);
  let stamp = 1;

  return {
    radius(theta: number, phi: number): number {
      sphToUnit(theta, phi, dir);
      const ti = Math.min(THETA_BINS - 1, Math.max(0, Math.floor((theta / Math.PI) * THETA_BINS)));
      const pi = Math.floor((wrapPhi(phi) / (Math.PI * 2)) * PHI_BINS);
      stamp = stamp === 0xffffffff ? 1 : stamp + 1;
      let best = 0;
      for (let dt = -2; dt <= 2; dt++) {
        const t2 = ti + dt;
        if (t2 < 0 || t2 >= THETA_BINS) continue;
        for (let dp = -2; dp <= 2; dp++) {
          const p2 = (pi + dp + PHI_BINS) % PHI_BINS;
          const list = bins[t2 * PHI_BINS + p2];
          if (!list) continue;
          for (let n = 0; n < list.length; n++) {
            const tri = list[n];
            if (seen[tri] === stamp) continue;
            seen[tri] = stamp;
            const hit = radialHit(pos, corner(tri, 0), corner(tri, 1), corner(tri, 2), dir);
            if (hit > best) best = hit;
          }
        }
      }
      return best;
    },
  };
}

function sphToUnit(theta: number, phi: number, out: Vector3): void {
  const st = Math.sin(theta);
  out.set(st * Math.cos(phi), Math.cos(theta), st * Math.sin(phi));
}

function radialHit(pos: BufferAttribute, i0: number, i1: number, i2: number, direction: Vector3): number {
  a.fromBufferAttribute(pos, i0);
  b.fromBufferAttribute(pos, i1);
  c.fromBufferAttribute(pos, i2);
  edge1.subVectors(b, a);
  edge2.subVectors(c, a);
  pvec.crossVectors(direction, edge2);
  const det = edge1.dot(pvec);
  if (Math.abs(det) < 1e-8) return 0;
  const inv = 1 / det;
  tvec.copy(a).negate();
  const u = tvec.dot(pvec) * inv;
  if (u < -1e-4 || u > 1.0001) return 0;
  qvec.crossVectors(tvec, edge1);
  const v = direction.dot(qvec) * inv;
  if (v < -1e-4 || u + v > 1.0001) return 0;
  const s = edge2.dot(qvec) * inv;
  return s > 0 ? s : 0;
}
