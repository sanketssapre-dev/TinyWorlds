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
  inTunnel: boolean;
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
    { theta: 1.05, phi: 3.75 }, // tunnel approach
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

function smoothstep(edge0: number, edge1: number, x: number): number {
  const span = edge1 - edge0;
  const t = span === 0 ? 0 : Math.min(1, Math.max(0, (x - edge0) / span));
  return t * t * (3 - 2 * t);
}

const BRIDGES = [
  { theta: SITES.lakeGeneva.theta, phi: SITES.lakeGeneva.phi, reach: 0.21, clearance: 1.7 },
  { theta: SITES.lakeBrienz.theta, phi: SITES.lakeBrienz.phi, reach: 0.17, clearance: 1.5 },
];

/** Extra height above the rails while they cross a lake. Added, not used as an absolute radius. */
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

function applyTunnelCut(thetas: number[], phis: number[]): boolean[] {
  const tunnels = new Array<boolean>(thetas.length).fill(false);
  const portals = [
    { theta: SITES.tunnelA.theta, phi: SITES.tunnelA.phi, reach: 0.11 },
    { theta: SITES.tunnelB.theta, phi: SITES.tunnelB.phi, reach: 0.155 },
  ];
  for (let i = 0; i < thetas.length; i++) {
    for (const portal of portals) {
      const d = angularDistance(thetas[i], phis[i], portal.theta, portal.phi);
      if (d < portal.reach) tunnels[i] = true;
    }
  }
  return tunnels;
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

  const smoothGround = smoothCircular(grounds, 3);
  for (let i = 0; i < sampleCount; i++) {
    rides[i] = smoothGround[i] + TRACK.bedOffset + bridgeClearance(thetas[i], phis[i]);
  }
  const tunnels = applyTunnelCut(thetas, phis);
  let smoothRide = smoothCircular(rides, 8);
  // Smoothing cuts chords through the mesh. Seat on the smoothed ground,
  // not the raw samples, so the rails stay a curve a train can follow.
  // The bore is a gallery over the rails. Dipping the ride puts the train
  // through the hillside instead of through the mouth.
  for (let i = 0; i < sampleCount; i++) {
    const seated = smoothGround[i] + TRACK.bedOffset + 0.22;
    smoothRide[i] = Math.max(smoothRide[i], seated);
  }
  smoothRide = smoothCircular(smoothRide, 4);
  for (let i = 0; i < sampleCount; i++) {
    const clear = grounds[i] + 0.28;
    if (smoothRide[i] < clear) smoothRide[i] = clear;
  }

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
    prevSide = frame.binormal;
    const groundR = smoothGround[i];
    const trackR = smoothRide[i];
    const elev = trackR - groundR;
    samples.push({
      position: positions[i].clone(),
      tangent: frame.tangent,
      normal: frame.normal,
      binormal: frame.binormal,
      s: lengths[i],
      trackRadius: trackR,
      groundRadius: groundR,
      elevation: elev,
      inTunnel: tunnels[i],
      elevated: elev > TRACK.elevatedThreshold,
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
  out.inTunnel = t < 0.5 ? a.inTunnel : b.inTunnel;
  out.elevated = out.elevation > TRACK.elevatedThreshold;
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
    inTunnel: false,
    elevated: false,
  };
}
