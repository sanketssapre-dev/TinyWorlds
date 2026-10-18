import { Vector3 } from "three";
import { FLIGHT, PLANET, TRACK } from "../config";
import {
  angularDistance,
  cartToSph,
  orthonormalFrame,
  sphToCart,
  wrap01,
  wrapPhi,
} from "../math/sphere";
import { SITES } from "../planet/features";
import { heightOffset } from "../planet/height";

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
  inCutting: boolean;
};

export type RailwayPath = {
  samples: PathSample[];
  totalLength: number;
  controlPoints: Vector3[];
};

type Waypoint = { theta: number; phi: number };

const LAKES = [
  { theta: SITES.lake.theta, phi: SITES.lake.phi, reach: 0.36, deck: 1.28 },
  { theta: SITES.lake2.theta, phi: SITES.lake2.phi, reach: 0.3, deck: 1.15 },
];

const TUNNEL_REACH = 0.34;

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

function smoothstep(edge0: number, edge1: number, x: number): number {
  const span = edge1 - edge0;
  const t = span === 0 ? 0 : Math.min(1, Math.max(0, (x - edge0) / span));
  return t * t * (3 - 2 * t);
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

function applyBridges(theta: number, phi: number, ride: number): number {
  let result = ride;
  for (const lake of LAKES) {
    const d = angularDistance(theta, phi, lake.theta, lake.phi);
    if (d >= lake.reach) continue;
    const t = smoothstep(lake.reach, lake.reach * 0.2, d);
    const raised = result + (Math.max(result, lake.deck) - result) * t;
    if (raised > result) result = raised;
  }
  return result;
}

function applyTunnel(
  thetas: number[],
  phis: number[],
  grounds: number[],
  rides: number[],
  tunnels: boolean[],
): void {
  const dists = thetas.map((theta, i) =>
    angularDistance(theta, phis[i], SITES.peakWest.theta, SITES.peakWest.phi),
  );
  const entrance: number[] = [];
  for (let i = 0; i < dists.length; i++) {
    if (dists[i] > 0.16 && dists[i] < TUNNEL_REACH) {
      entrance.push(grounds[i] + TRACK.bedOffset);
    }
  }
  if (entrance.length < 4) return;
  entrance.sort((a, b) => a - b);
  const entranceRide = entrance[Math.floor(entrance.length * 0.25)] - 0.15;
  for (let i = 0; i < dists.length; i++) {
    if (dists[i] >= TUNNEL_REACH) continue;
    const t = smoothstep(TUNNEL_REACH, 0.09, dists[i]);
    rides[i] = rides[i] * (1 - t) + entranceRide * t;
    const cover = grounds[i] - rides[i];
    tunnels[i] = t > 0.42 && cover > TRACK.tunnelClearance + 0.65;
  }
  solidify(tunnels);
}

function solidify(flags: boolean[]): void {
  const n = flags.length;
  const copy = flags.slice();
  for (let i = 0; i < n; i++) {
    let on = 0;
    for (let k = -3; k <= 3; k++) if (copy[(i + k + n) % n]) on++;
    flags[i] = on >= 4;
  }
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

export function createRailwayPath(sampleCount = 1024): RailwayPath {
  const keys = designKeys();
  const controlPoints = keys.map((wp) => sphToCart(PLANET.radius, wp.theta, wp.phi));

  const coarseN = Math.max(sampleCount, 768);
  const dirs: Vector3[] = [];
  const grounds: number[] = [];
  const thetas: number[] = [];
  const phis: number[] = [];
  for (let i = 0; i < coarseN; i++) {
    const phi = (i / coarseN) * Math.PI * 2;
    const theta = thetaAt(keys, phi);
    dirs.push(sphToCart(1, theta, phi));
    thetas.push(theta);
    phis.push(phi);
    grounds.push(heightOffset(theta, phi));
  }

  const smoothGround = smoothCircular(grounds, 7);
  const rides = new Array<number>(coarseN);
  const tunnels = new Array<boolean>(coarseN).fill(false);
  for (let i = 0; i < coarseN; i++) {
    rides[i] = applyBridges(thetas[i], phis[i], smoothGround[i] + TRACK.bedOffset);
  }
  applyTunnel(thetas, phis, grounds, rides, tunnels);
  const cutting = tunnels.map((flag, i) => {
    const nearPeak =
      angularDistance(thetas[i], phis[i], SITES.peakWest.theta, SITES.peakWest.phi) <
      TUNNEL_REACH;
    return flag || (nearPeak && grounds[i] - rides[i] > 0.22);
  });
  for (let i = 0; i < coarseN; i++) {
    if (!cutting[i]) rides[i] = Math.max(rides[i], grounds[i] + 0.07);
  }

  const coarse: Coarse[] = dirs.map((dir, i) => ({
    position: dir.multiplyScalar(PLANET.radius + rides[i]),
    ride: rides[i],
    ground: grounds[i],
    tunnel: tunnels[i],
    cutting: cutting[i],
  }));

  const resampled = resampleClosed(coarse, sampleCount);
  const seated = resampled.points.map((p) => seatSample(p));
  for (let pass = 0; pass < 5; pass++) relaxKinks(seated);

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
    const trackRadius = position.length();
    const elevation = trackRadius - groundRadius;
    samples.push({
      position,
      tangent: frame.tangent,
      normal: frame.normal,
      binormal: frame.binormal,
      s: totalLength,
      trackRadius,
      groundRadius,
      elevation,
      inTunnel: seated[i].tunnel,
      inCutting: seated[i].cutting && elevation < -0.08,
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
    trackRadius: first.trackRadius,
    groundRadius: first.groundRadius,
    elevation: first.elevation,
    inTunnel: first.inTunnel,
    inCutting: first.inCutting,
  });

  return { samples, totalLength, controlPoints };
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

  const softLateral = smoothClosed(smoothClosed(lateral));
  const softAlong = smoothClosed(smoothClosed(along));
  matchRms(softLateral, rms(lateral));
  matchRms(softAlong, rms(along));
  const maxFraction = Math.hypot(
    FLIGHT_LATERAL_FRACTION * (1 + FLIGHT_LATERAL_WOBBLE),
    FLIGHT_ALONG_FRACTION,
  );
  for (let i = 0; i < n; i++) {
    const mag = Math.hypot(softLateral[i], softAlong[i]);
    const cap = maxFraction * spacing[i];
    if (mag > cap && mag > 1e-8) {
      const scale = cap / mag;
      softLateral[i] *= scale;
      softAlong[i] *= scale;
    }
  }

  const shifted = new Array<Waypoint>(n);
  const previousSide = new Vector3();
  let hasSide = false;
  for (let i = 0; i < n; i++) {
    const curr = keys[i];
    if (spacing[i] < 1e-4) {
      shifted[i] = copyWaypoint(curr);
      continue;
    }
    const prev = keys[(i - 1 + n) % n];
    const next = keys[(i + 1) % n];
    const position = sphToCart(1, curr.theta, curr.phi);
    const before = sphToCart(1, prev.theta, prev.phi);
    const after = sphToCart(1, next.theta, next.phi);
    const route = after.sub(before);
    route.addScaledVector(position, -route.dot(position));
    const side = new Vector3().crossVectors(position, route);
    if (route.lengthSq() < 1e-12 || side.lengthSq() < 1e-12) {
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
): RailwayPath {
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
    const trackRadius = position.length();
    samples.push({
      position,
      tangent: frame.tangent,
      normal: frame.normal,
      binormal: frame.binormal,
      s: totalLength,
      trackRadius,
      groundRadius,
      elevation: trackRadius - groundRadius,
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

function relaxKinks(seated: Coarse[]): void {
  const n = seated.length;
  const blended = seated.map((p) => p.position.clone());
  for (let i = 0; i < n; i++) {
    const prev = seated[(i - 1 + n) % n].position;
    const curr = seated[i].position;
    const next = seated[(i + 1) % n].position;
    const incoming = curr.clone().sub(prev);
    const outgoing = next.clone().sub(curr);
    if (incoming.lengthSq() < 1e-8 || outgoing.lengthSq() < 1e-8) continue;
    incoming.normalize();
    outgoing.normalize();
    const bend = Math.acos(Math.min(1, Math.max(-1, incoming.dot(outgoing))));
    if (bend < 0.16) continue;
    const avg = prev.clone().add(next).multiplyScalar(0.5);
    const pull = Math.min(0.7, (bend - 0.16) * 0.9);
    blended[i].copy(curr).lerp(avg, pull);
  }
  for (let i = 0; i < n; i++) {
    seated[i].position.copy(blended[i]);
    const sph = sphericalOf(seated[i].position);
    const ground = heightOffset(sph.theta, sph.phi);
    let ride = seated[i].position.length() - PLANET.radius;
    const cover = ground - ride;
    if (!seated[i].cutting && !seated[i].tunnel && ride < ground + 0.07) {
      ride = ground + 0.07;
      seated[i].position.setLength(PLANET.radius + ride);
    }
    seated[i].ground = ground;
    seated[i].ride = seated[i].position.length() - PLANET.radius;
    seated[i].tunnel = seated[i].tunnel && cover > TRACK.tunnelClearance + 0.4;
    seated[i].cutting = seated[i].cutting && ground - seated[i].ride > 0.1;
  }
}

function seatSample(p: Coarse): Coarse {
  const sph = sphericalOf(p.position);
  const ground = heightOffset(sph.theta, sph.phi);
  let ride = p.position.length() - PLANET.radius;
  const cover = ground - ride;
  let tunnel = p.tunnel && cover > TRACK.tunnelClearance + 0.45;
  const cutting = p.cutting && cover > 0.12;
  if (!cutting && !tunnel && ride < ground + 0.07) {
    ride = ground + 0.07;
    p.position.setLength(PLANET.radius + ride);
    tunnel = false;
  }
  return { position: p.position, ride, ground, tunnel, cutting };
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
  trackRadius: 0,
  groundRadius: 0,
  elevation: 0,
  inTunnel: false,
  inCutting: false,
};

export function getSampleAt(path: RailwayPath, s: number, out?: PathSample): PathSample {
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
  out.trackRadius = a.trackRadius + (b.trackRadius - a.trackRadius) * k;
  out.groundRadius = a.groundRadius + (b.groundRadius - a.groundRadius) * k;
  out.elevation = a.elevation + (b.elevation - a.elevation) * k;
  out.inTunnel = k < 0.5 ? a.inTunnel : b.inTunnel;
  out.inCutting = a.inCutting || b.inCutting;
  return out;
}

export function framesAlong(path: RailwayPath, distances: number[]): PathSample[] {
  return distances.map((s) => getSampleAt(path, s));
}
