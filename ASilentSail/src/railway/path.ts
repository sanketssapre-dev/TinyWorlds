import { Vector3 } from "three";
import { PLANET, TRACK } from "../config";
import {
  angularDistance,
  orthonormalFrame,
  sphToCart,
  wrap01,
  wrapPhi,
} from "../math/sphere";
import { heightOffset } from "../planet/height";
import { SITES } from "../planet/features";
import type { PlanetSurface } from "../planet/surface";

export type PathSample = {
  position: Vector3;
  tangent: Vector3;
  normal: Vector3;
  binormal: Vector3;
  s: number;
  trackRadius: number;
  groundRadius: number;
  elevation: number;
  /** Inside a lake crossing, even when the gap is too modest for a mountain fill. */
  bridge: boolean;
  elevated: boolean;
};

export type RailwayPath = {
  samples: PathSample[];
  totalLength: number;
};

type Waypoint = { theta: number; phi: number };

/** Closed Alpine circuit — mid-latitudes with mountain bends and lake crossings. */
function designKeys(): Waypoint[] {
  return [
    { theta: 1.18, phi: 0.0 },
    { theta: 1.12, phi: 0.35 },
    { theta: 1.22, phi: 0.72 },
    { theta: 1.36, phi: 0.95 }, // lake Geneva approach
    { theta: 1.42, phi: 1.2 },
    { theta: 1.28, phi: 1.55 },
    { theta: 1.1, phi: 1.85 },
    { theta: 0.98, phi: 2.15 },
    { theta: 1.08, phi: 2.45 },
    { theta: 1.26, phi: 2.7 },
    { theta: 1.38, phi: 3.05 }, // lake Brienz
    { theta: 1.3, phi: 3.4 },
    { theta: 1.05, phi: 3.75 }, // mountain pass
    { theta: 0.95, phi: 4.05 },
    { theta: 1.15, phi: 4.4 },
    { theta: 1.28, phi: 4.75 },
    { theta: 1.2, phi: 5.15 },
    { theta: 1.1, phi: 5.5 },
    { theta: 1.22, phi: 5.85 },
    { theta: 1.3, phi: 6.1 },
  ];
}

function thetaAt(keys: Waypoint[], phi: number): number {
  const p = wrapPhi(phi);
  let i = keys.length - 1;
  for (let k = 0; k < keys.length; k++) {
    if (keys[k].phi <= p) i = k;
  }
  const a = keys[i];
  const b = keys[(i + 1) % keys.length];
  let bPhi = b.phi;
  if (bPhi <= a.phi) bPhi += Math.PI * 2;
  let p2 = p < a.phi ? p + Math.PI * 2 : p;
  const span = bPhi - a.phi || 1;
  const t = Math.min(1, Math.max(0, (p2 - a.phi) / span));
  const s = t * t * (3 - 2 * t);
  return a.theta + (b.theta - a.theta) * s;
}

function smoothCircular(values: number[], radius: number): number[] {
  const n = values.length;
  const out = new Array<number>(n);
  const sigma = Math.max(1, radius * 0.5);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    let wsum = 0;
    for (let k = -radius; k <= radius; k++) {
      const w = Math.exp(-(k * k) / (2 * sigma * sigma));
      acc += w * values[(i + k + n) % n];
      wsum += w;
    }
    out[i] = acc / wsum;
  }
  return out;
}

/** Follow the ground with a smooth, slope-limited grade instead of bridging broad shallow dips. */
function formationRadius(grounds: number[]): number[] {
  const n = grounds.length;
  const grade = grounds.map((ground) => ground + 0.06);
  const maxStep = ((2 * Math.PI * PLANET.radius) / n) * 0.085;
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      const required = grade[i] - maxStep;
      if (grade[next] < required) {
        grade[next] = required;
        changed = true;
      }
    }
    for (let i = n - 1; i >= 0; i--) {
      const previous = (i - 1 + n) % n;
      const required = grade[i] - maxStep;
      if (grade[previous] < required) {
        grade[previous] = required;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return grade;
}

/** Add a smoothed lift wherever the grade still cuts the mesh, so the correction is a ramp, not a kink. */
function liftClearance(
  grade: number[],
  grounds: number[],
  margin: number,
  radius: number,
  passes: number,
): number[] {
  const n = grade.length;
  let ride = grade;
  for (let pass = 0; pass < passes; pass++) {
    const deficit = new Array<number>(n);
    for (let i = 0; i < n; i++) deficit[i] = Math.max(0, grounds[i] + margin - ride[i]);
    const lift = smoothCircular(deficit, radius);
    const next = new Array<number>(n);
    for (let i = 0; i < n; i++) next[i] = ride[i] + lift[i];
    ride = next;
  }
  return ride;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const span = edge1 - edge0;
  const t = span === 0 ? 0 : Math.min(1, Math.max(0, (x - edge0) / span));
  return t * t * (3 - 2 * t);
}

const BRIDGES = [
  { theta: SITES.lakeGeneva.theta, phi: SITES.lakeGeneva.phi, reach: 0.21, clearance: 1.7 },
  { theta: SITES.lakeBrienz.theta, phi: SITES.lakeBrienz.phi, reach: 0.17, clearance: 1.5 },
];

/** A lake crossing is a viaduct once the rails are clearly off the water, not only past the deep-gap threshold. */
function isViaduct(elevation: number, bridge: boolean): boolean {
  return elevation > TRACK.elevatedThreshold || (bridge && elevation > 1.05);
}

function bridgeClearance(theta: number, phi: number): number {
  let lift = 0;
  for (const lake of BRIDGES) {
    const d = angularDistance(theta, phi, lake.theta, lake.phi);
    if (d >= lake.reach) continue;
    const t = smoothstep(lake.reach, lake.reach * 0.3, d);
    lift = Math.max(lift, lake.clearance * t);
  }
  return lift;
}

export function createRailwayPath(
  surface: PlanetSurface,
  sampleCount = 720,
): RailwayPath {
  const keys = designKeys();
  const thetas: number[] = [];
  const phis: number[] = [];
  const grounds: number[] = [];
  const rides: number[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const phi = (i / sampleCount) * Math.PI * 2;
    const theta = thetaAt(keys, phi);
    thetas.push(theta);
    phis.push(phi);
    const meshR = surface.radius(theta, phi);
    const h = heightOffset(theta, phi);
    const ground = meshR > 1 ? meshR : PLANET.radius + h;
    grounds.push(ground);
    rides.push(ground + TRACK.bedOffset);
  }

  // A railway formation, not the grass. Local stones are filled or ignored.
  // The grade only climbs where a whole hillside does.
  const bed = formationRadius(grounds);
  for (let i = 0; i < sampleCount; i++) {
    rides[i] = bed[i] + 0.14 + bridgeClearance(thetas[i], phis[i]);
  }
  let smoothRide = smoothCircular(rides, 8);
  smoothRide = liftClearance(smoothRide, grounds, 0.1, 6, 6);

  const positions: Vector3[] = [];
  for (let i = 0; i < sampleCount; i++) {
    positions.push(sphToCart(smoothRide[i], thetas[i], phis[i]));
  }

  // Arc-length table
  const lengths: number[] = [0];
  let total = 0;
  for (let i = 0; i < sampleCount; i++) {
    const a = positions[i];
    const b = positions[(i + 1) % sampleCount];
    total += a.distanceTo(b);
    lengths.push(total);
  }

  const samples: PathSample[] = [];
  let prevSide: Vector3 | undefined;
  for (let i = 0; i < sampleCount; i++) {
    const prev = positions[(i - 1 + sampleCount) % sampleCount];
    const next = positions[(i + 1) % sampleCount];
    const tangent = next.clone().sub(prev).normalize();
    const frame = orthonormalFrame(positions[i], tangent, prevSide);
    // Keep the road's up outward, and the side continuous, so the second
    // track cannot swap sides where the cross product flips.
    if (frame.normal.dot(positions[i]) < 0) {
      frame.normal.negate();
      frame.binormal.negate();
    }
    if (prevSide && frame.binormal.dot(prevSide) < 0) frame.binormal.negate();
    prevSide = frame.binormal;
    const groundR = grounds[i];
    const trackR = smoothRide[i];
    const elev = trackR - groundR;
    const bridge = bridgeClearance(thetas[i], phis[i]) > 0.4;
    samples.push({
      position: positions[i].clone(),
      tangent: frame.tangent,
      normal: frame.normal,
      binormal: frame.binormal,
      s: lengths[i],
      trackRadius: trackR,
      groundRadius: groundR,
      elevation: elev,
      bridge,
      elevated: isViaduct(elev, bridge),
    });
  }

  return { samples, totalLength: total };
}

export function getSampleAt(
  path: RailwayPath,
  distance: number,
  out: PathSample = scratchSample(),
): PathSample {
  const s = wrap01(distance, path.totalLength);
  const samples = path.samples;
  const n = samples.length;
  // Binary search on arc length
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (samples[mid].s <= s) lo = mid;
    else hi = mid - 1;
  }
  const a = samples[lo];
  const b = samples[(lo + 1) % n];
  const aS = a.s;
  let bS = b.s;
  if (bS <= aS) bS += path.totalLength;
  let s2 = s < aS ? s + path.totalLength : s;
  const span = bS - aS || 1;
  const t = Math.min(1, Math.max(0, (s2 - aS) / span));

  out.position.copy(a.position).lerp(b.position, t);
  out.tangent.copy(a.tangent).lerp(b.tangent, t).normalize();
  out.normal.copy(a.normal).lerp(b.normal, t).normalize();
  out.binormal.copy(a.binormal).lerp(b.binormal, t).normalize();
  out.s = s;
  out.trackRadius = a.trackRadius + (b.trackRadius - a.trackRadius) * t;
  out.groundRadius = a.groundRadius + (b.groundRadius - a.groundRadius) * t;
  out.elevation = a.elevation + (b.elevation - a.elevation) * t;
  out.bridge = t < 0.5 ? a.bridge : b.bridge;
  out.elevated = isViaduct(out.elevation, out.bridge);
  return out;
}

export function scratchSample(): PathSample {
  return {
    position: new Vector3(),
    tangent: new Vector3(),
    normal: new Vector3(),
    binormal: new Vector3(),
    s: 0,
    trackRadius: 0,
    groundRadius: 0,
    elevation: 0,
    bridge: false,
    elevated: false,
  };
}
