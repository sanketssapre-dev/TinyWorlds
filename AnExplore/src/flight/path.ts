import { Vector3 } from "three";
import { FLIGHT, PLANET } from "../config";
import {
  angularDistance,
  cartToSph,
  orthonormalFrame,
  sphToCart,
  wrap01,
  wrapPhi,
} from "../math/sphere";
import { heightOffset } from "../planet/height";

export type PathSample = {
  position: Vector3;
  tangent: Vector3;
  normal: Vector3;
  binormal: Vector3;
  s: number;
  flightRadius: number;
  /** Retained alias for flightRadius */
  trackRadius: number;
  groundRadius: number;
  elevation: number;
  inTunnel: boolean;
  inCutting: boolean;
};

export type FlightPath = {
  samples: PathSample[];
  totalLength: number;
  controlPoints: Vector3[];
};

/** Retained alias for FlightPath */
export type RailwayPath = FlightPath;

type Waypoint = { theta: number; phi: number };

/** Lateral wander, as a fraction of the gap to the nearer neighbor. */
const FLIGHT_LATERAL_FRACTION = 0.25;
/** Along-track jitter, smaller than the lateral shift. */
const FLIGHT_ALONG_FRACTION = 0.08;
/** ± share so the lateral move stays near a quarter of the gap. */
const FLIGHT_LATERAL_WOBBLE = 0.15;
const FLIGHT_TEST_SEED = 1;

function designKeys(variant = 0): Waypoint[] {
  const phis = [
    0.0, 0.22, 0.55, 0.86, 1.18, 1.55, 1.95, 2.35, 2.62, 2.95, 3.28, 3.55, 3.9,
    4.08, 4.42, 4.85, 5.18, 5.58, 5.95,
  ];
  const thetaByVariant = [
    [1.23, 1.23, 1.3, 1.34, 1.42, 1.28, 1.05, 0.88, 1.16, 1.78, 1.46, 1.26, 1.08, 1.66, 1.4, 1.2, 1.12, 1.06, 1.16],
    [2.3, 2.38, 2.48, 2.52, 2.38, 2.18, 1.98, 1.82, 1.96, 2.28, 2.52, 2.42, 2.2, 1.88, 1.72, 1.84, 2.04, 2.22, 2.3],
    [0.68, 0.82, 1.12, 1.58, 2.02, 2.34, 2.52, 2.42, 2.08, 1.62, 1.18, 0.84, 0.62, 0.76, 1.16, 1.72, 2.16, 2.38, 1.76],
  ];
  const thetas = thetaByVariant[((variant % thetaByVariant.length) + thetaByVariant.length) % thetaByVariant.length];
  return phis.map((phi, index) => ({ phi, theta: thetas[index] }));
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

type Coarse = {
  position: Vector3;
  ride: number;
  ground: number;
  tunnel: boolean;
  cutting: boolean;
};

function resampleClosed(coarse: Coarse[], sampleCount: number): { points: Coarse[]; total: number } {
  const n = coarse.length;
  const cum = [0];
  for (let i = 1; i <= n; i++) {
    cum.push(cum[i - 1] + coarse[i - 1].position.distanceTo(coarse[i % n].position));
  }
  const total = cum[n];
  const points: Coarse[] = [];
  for (let s = 0; s < sampleCount; s++) {
    const dist = (s / sampleCount) * total;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid + 1] <= dist) lo = mid + 1;
      else hi = mid;
    }
    const span = Math.max(1e-8, cum[lo + 1] - cum[lo]);
    const k = (dist - cum[lo]) / span;
    const i0 = lo % n;
    const i1 = (lo + 1) % n;
    const position = coarse[i0].position.clone().lerp(coarse[i1].position, k);
    points.push({
      position,
      ride: coarse[i0].ride + (coarse[i1].ride - coarse[i0].ride) * k,
      ground: coarse[i0].ground + (coarse[i1].ground - coarse[i0].ground) * k,
      tunnel: k < 0.5 ? coarse[i0].tunnel : coarse[i1].tunnel,
      cutting: coarse[i0].cutting || coarse[i1].cutting,
    });
  }
  return { points, total };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function flightPathSeed(explicit: number | undefined): number {
  if (explicit !== undefined) return explicit >>> 0;
  const env = import.meta.env as { MODE?: string; VITEST?: boolean | string };
  if (env.MODE === "test" || env.VITEST === true || env.VITEST === "true") return FLIGHT_TEST_SEED;
  return (Math.floor(Math.random() * 0x7fffffff) + 1) >>> 0;
}

function copyWaypoint(wp: Waypoint): Waypoint {
  return { theta: wp.theta, phi: wp.phi };
}

function smoothClosed(values: number[]): number[] {
  const n = values.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const prev = values[(i - 1 + n) % n];
    const next = values[(i + 1) % n];
    out[i] = values[i] * 0.5 + (prev + next) * 0.25;
  }
  return out;
}

function rms(values: number[]): number {
  let sum = 0;
  for (const value of values) sum += value * value;
  return Math.sqrt(sum / values.length);
}

function matchRms(values: number[], target: number): void {
  const current = rms(values);
  if (current < 1e-8) return;
  const gain = target / current;
  for (let i = 0; i < values.length; i++) values[i] *= gain;
}

/** Shift each design key once. The result stays a single phi-monotonic loop. */
function varyFlightWaypoints(keys: Waypoint[], seed: number): Waypoint[] {
  const random = mulberry32(seed);
  const n = keys.length;
  if (n < 3) return keys.map(copyWaypoint);

  const lateral = new Array<number>(n);
  const along = new Array<number>(n);
  const spacing = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const curr = keys[i];
    const prev = keys[(i - 1 + n) % n];
    const next = keys[(i + 1) % n];
    const gapPrev = angularDistance(prev.theta, prev.phi, curr.theta, curr.phi);
    const gapNext = angularDistance(curr.theta, curr.phi, next.theta, next.phi);
    spacing[i] = Math.min(gapPrev, gapNext);
    const wobble = 1 + (random() * 2 - 1) * FLIGHT_LATERAL_WOBBLE;
    const lateralSign = random() < 0.5 ? -1 : 1;
    lateral[i] = lateralSign * FLIGHT_LATERAL_FRACTION * wobble * spacing[i];
    along[i] = (random() * 2 - 1) * FLIGHT_ALONG_FRACTION * spacing[i];
  }

  const targetLateralRms = rms(lateral);
  const targetAlongRms = rms(along);
  let softLateral = smoothClosed(smoothClosed(lateral));
  let softAlong = smoothClosed(along);
  matchRms(softLateral, targetLateralRms);
  matchRms(softAlong, targetAlongRms);

  const shifted: Waypoint[] = new Array<Waypoint>(n);
  const previousSide = new Vector3();
  let hasSide = false;

  for (let i = 0; i < n; i++) {
    const curr = keys[i];
    const prev = keys[(i - 1 + n) % n];
    const next = keys[(i + 1) % n];
    const position = sphToCart(1, curr.theta, curr.phi);
    const toPrev = sphToCart(1, prev.theta, prev.phi).sub(position);
    const toNext = sphToCart(1, next.theta, next.phi).sub(position);
    const route = toNext.clone().sub(toPrev);
    const up = position.clone().normalize();
    const side = new Vector3().crossVectors(up, route);
    if (route.lengthSq() < 1e-8 || side.lengthSq() < 1e-8) {
      shifted[i] = copyWaypoint(curr);
      continue;
    }
    route.normalize();
    side.normalize();
    if (hasSide && side.dot(previousSide) < 0) side.negate();
    previousSide.copy(side);
    hasSide = true;
    const moved = position
      .addScaledVector(side, softLateral[i])
      .addScaledVector(route, softAlong[i])
      .normalize();
    const sph = cartToSph(moved);
    shifted[i] =
      Number.isFinite(sph.theta) && Number.isFinite(sph.phi)
        ? { theta: sph.theta, phi: sph.phi }
        : copyWaypoint(curr);
  }

  return restrainFlightWaypoints(keys, shifted);
}

function restrainFlightWaypoints(original: Waypoint[], shifted: Waypoint[]): Waypoint[] {
  const n = original.length;
  const twopi = Math.PI * 2;
  const phis = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let phi = shifted[i].phi;
    const base = original[i].phi;
    while (phi - base > Math.PI) phi -= twopi;
    while (base - phi > Math.PI) phi += twopi;
    const prevPhi = i === 0 ? original[n - 1].phi - twopi : original[i - 1].phi;
    const nextPhi = i === n - 1 ? original[0].phi + twopi : original[i + 1].phi;
    const lower = Math.max(1e-3, base - FLIGHT_LATERAL_FRACTION * (base - prevPhi));
    const upper = Math.min(twopi - 1e-3, base + FLIGHT_LATERAL_FRACTION * (nextPhi - base));
    phis[i] = Math.min(Math.max(phi, lower), Math.max(lower, upper));
  }

  return shifted.map((wp, i) => ({
    theta: Math.min(Math.PI - 0.35, Math.max(0.35, wp.theta)),
    phi: wrapPhi(phis[i]),
  }));
}

/** Closed cruise above the hills. Waypoints shift once when the path is built. */
export function createFlightPath(
  sampleCount = 768,
  seed?: number,
  variant = 0,
): FlightPath {
  const selectedVariant = ((Math.floor(variant) % 3) + 3) % 3;
  const keys = varyFlightWaypoints(designKeys(selectedVariant), flightPathSeed(seed));
  const controlPoints = keys.map((wp) =>
    sphToCart(PLANET.radius + FLIGHT.cruise, wp.theta, wp.phi),
  );

  const coarseN = Math.max(sampleCount, 640);
  const thetas: number[] = [];
  const phis: number[] = [];
  for (let i = 0; i < coarseN; i++) {
    const phi = (i / coarseN) * Math.PI * 2;
    phis.push(phi);
    thetas.push(thetaAt(keys, phi));
  }
  const smoothTheta = smoothCircular(thetas, 22);
  const dirs: Vector3[] = [];
  const grounds: number[] = [];
  for (let i = 0; i < coarseN; i++) {
    dirs.push(sphToCart(1, smoothTheta[i], phis[i]));
    grounds.push(heightOffset(smoothTheta[i], phis[i]));
  }

  const smoothGround = smoothCircular(grounds, 26);
  const coarse: Coarse[] = dirs.map((dir, i) => {
    const ride = Math.max(smoothGround[i] + FLIGHT.cruise, grounds[i] + FLIGHT.minClearance);
    return {
      position: dir.multiplyScalar(PLANET.radius + ride),
      ride,
      ground: grounds[i],
      tunnel: false,
      cutting: false,
    };
  });

  const resampled = resampleClosed(coarse, sampleCount);
  const seated = resampled.points;
  easeRoute(seated);
  easeRoute(seated);
  for (const p of seated) liftCruise(p);

  const tangents: Vector3[] = [];
  for (let i = 0; i < seated.length; i++) {
    const prev = seated[(i - 1 + seated.length) % seated.length].position;
    const next = seated[(i + 1) % seated.length].position;
    tangents.push(next.clone().sub(prev).normalize());
  }

  const samples: PathSample[] = [];
  let totalLength = 0;
  let prevSide: Vector3 | undefined;
  for (let i = 0; i < seated.length; i++) {
    const position = seated[i].position;
    const tangent = tangents[i];
    const frame = orthonormalFrame(position, tangent, prevSide);
    prevSide = frame.binormal;
    if (i > 0) totalLength += position.distanceTo(seated[i - 1].position);
    const groundRadius = PLANET.radius + seated[i].ground;
    const flightRadius = position.length();
    samples.push({
      position,
      tangent: frame.tangent,
      normal: frame.normal,
      binormal: frame.binormal,
      s: totalLength,
      flightRadius,
      trackRadius: flightRadius,
      groundRadius,
      elevation: flightRadius - groundRadius,
      inTunnel: false,
      inCutting: false,
    });
  }

  totalLength += seated[seated.length - 1].position.distanceTo(seated[0].position);
  const first = samples[0];
  samples.push({
    position: first.position.clone(),
    tangent: first.tangent.clone(),
    normal: first.normal.clone(),
    binormal: first.binormal.clone(),
    s: totalLength,
    flightRadius: first.flightRadius,
    trackRadius: first.trackRadius,
    groundRadius: first.groundRadius,
    elevation: first.elevation,
    inTunnel: false,
    inCutting: false,
  });

  return { samples, totalLength, controlPoints };
}

function easeRoute(points: Coarse[]): void {
  const n = points.length;
  const next = points.map((p) => p.position.clone());
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n].position;
    const curr = points[i].position;
    const nxt = points[(i + 1) % n].position;
    next[i].copy(prev).add(nxt).multiplyScalar(0.5);
    next[i].lerp(curr, 0.62);
  }
  for (let i = 0; i < n; i++) points[i].position.copy(next[i]);
}

function liftCruise(p: Coarse): void {
  const sph = sphericalOf(p.position);
  const ground = heightOffset(sph.theta, sph.phi);
  let ride = p.position.length() - PLANET.radius;
  if (ride < ground + FLIGHT.minClearance) {
    ride = ground + FLIGHT.minClearance;
    p.position.setLength(PLANET.radius + ride);
  }
  p.ground = ground;
  p.ride = p.position.length() - PLANET.radius;
  p.tunnel = false;
  p.cutting = false;
}

function sphericalOf(v: Vector3): { theta: number; phi: number } {
  const r = v.length() || 1;
  const theta = Math.acos(Math.min(1, Math.max(-1, v.y / r)));
  const phi = Math.atan2(v.z, v.x);
  return { theta, phi };
}

const scratch: PathSample = {
  position: new Vector3(),
  tangent: new Vector3(),
  normal: new Vector3(),
  binormal: new Vector3(),
  s: 0,
  flightRadius: 0,
  trackRadius: 0,
  groundRadius: 0,
  elevation: 0,
  inTunnel: false,
  inCutting: false,
};

export function getSampleAt(path: FlightPath, s: number, out?: PathSample): PathSample {
  const samples = path.samples;
  const dist = wrap01(s, path.totalLength);
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].s <= dist) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const span = Math.max(1e-8, b.s - a.s);
  const k = (dist - a.s) / span;
  return lerpSample(a, b, k, out ?? freshSample());
}

export function scratchSample(): PathSample {
  return scratch;
}

function freshSample(): PathSample {
  return {
    position: new Vector3(),
    tangent: new Vector3(),
    normal: new Vector3(),
    binormal: new Vector3(),
    s: 0,
    flightRadius: 0,
    trackRadius: 0,
    groundRadius: 0,
    elevation: 0,
    inTunnel: false,
    inCutting: false,
  };
}

function lerpSample(a: PathSample, b: PathSample, k: number, out: PathSample): PathSample {
  out.position.copy(a.position).lerp(b.position, k);
  out.tangent.copy(a.tangent).lerp(b.tangent, k).normalize();
  const frame = orthonormalFrame(out.position, out.tangent, a.binormal);
  out.tangent.copy(frame.tangent);
  out.normal.copy(frame.normal);
  out.binormal.copy(frame.binormal);
  out.s = a.s + (b.s - a.s) * k;
  out.flightRadius = a.flightRadius + (b.flightRadius - a.flightRadius) * k;
  out.trackRadius = out.flightRadius;
  out.groundRadius = a.groundRadius + (b.groundRadius - a.groundRadius) * k;
  out.elevation = a.elevation + (b.elevation - a.elevation) * k;
  out.inTunnel = k < 0.5 ? a.inTunnel : b.inTunnel;
  out.inCutting = a.inCutting || b.inCutting;
  return out;
}

export function framesAlong(path: FlightPath, distances: number[]): PathSample[] {
  return distances.map((s) => getSampleAt(path, s));
}
