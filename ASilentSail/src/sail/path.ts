import { Quaternion, Vector3 } from "three";
import { cartToSph, orthonormalFrame, sphToCart, wrap01 } from "../math/sphere";
import { PLANET, SAIL, WATER_LEVEL } from "../config";
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

export type SailPath = {
  samples: PathSample[];
  totalLength: number;
  controlPoints: Vector3[];
};

/** Retained alias for SailPath */
export type RailwayPath = SailPath;

const THETA_MIN = 0.52;
const THETA_MAX = Math.PI - 0.52;
const SCAN_STEP = 0.022;
/** Beaches count as land for routing. */
const SHALLOW = WATER_LEVEL - 0.55;
/** Extra theta padding around every land band. */
const LAND_PAD = 0.12;
/** If two land bands are closer than this, treat them as one continent. */
const MERGE_GAP = 0.24;
/** Nearby meridians count as the same obstacle so narrow straits are closed. */
const PHI_LOOK = 0.26;
const PHI_STEP = 0.05;
const MAX_STEP = 0.04;

type Band = [number, number];
const BAND_CACHE = new Map<number, Band[]>();

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clampTheta(theta: number): number {
  return Math.min(THETA_MAX, Math.max(THETA_MIN, theta));
}

function isNavLand(theta: number, phi: number): boolean {
  return heightOffset(theta, phi) > SHALLOW;
}

function wrapPhi(phi: number): number {
  const tau = Math.PI * 2;
  return ((phi % tau) + tau) % tau;
}

function landBands(phi: number): Band[] {
  const key = Math.round(wrapPhi(phi) / 0.02);
  const cached = BAND_CACHE.get(key);
  if (cached) return cached;

  const thetas: number[] = [];
  for (let t = THETA_MIN; t <= THETA_MAX + 1e-6; t += SCAN_STEP) thetas.push(t);
  const dry = new Array<boolean>(thetas.length).fill(false);
  for (let dphi = -PHI_LOOK; dphi <= PHI_LOOK + 1e-6; dphi += PHI_STEP) {
    const meridian = wrapPhi(phi + dphi);
    for (let i = 0; i < thetas.length; i++) {
      if (!dry[i] && isNavLand(thetas[i], meridian)) dry[i] = true;
    }
  }
  const pad = Math.max(1, Math.round(LAND_PAD / SCAN_STEP));
  const marked = dry.slice();
  for (let i = 0; i < dry.length; i++) {
    if (!dry[i]) continue;
    for (let k = -pad; k <= pad; k++) {
      const j = i + k;
      if (j >= 0 && j < marked.length) marked[j] = true;
    }
  }
  const raw: Band[] = [];
  let i = 0;
  while (i < marked.length) {
    if (!marked[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < marked.length && marked[j]) j++;
    raw.push([thetas[i], thetas[j - 1]]);
    i = j;
  }
  const merged: Band[] = [];
  for (const band of raw) {
    const last = merged[merged.length - 1];
    if (last && band[0] - last[1] < MERGE_GAP) last[1] = band[1];
    else merged.push([band[0], band[1]]);
  }
  BAND_CACHE.set(key, merged);
  return merged;
}

function blocked(theta: number, bands: Band[]): boolean {
  return bands.some(([a, b]) => theta >= a && theta <= b);
}

function landBetween(a: number, b: number, bands: Band[]): boolean {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return bands.some(([start, end]) => end > lo && start < hi);
}

function openTheta(target: number, bands: Band[], prefer: number, maxStep = MAX_STEP): number {
  const want = clampTheta(target);
  const stay = clampTheta(prefer);
  const edges: number[] = [want, stay, THETA_MIN, THETA_MAX];
  for (const [a, b] of bands) {
    edges.push(a - 0.04, b + 0.04);
  }
  const pick = (sameSideOnly: boolean): number | undefined => {
    let best: number | undefined;
    let bestScore = Infinity;
    const consider = (t: number) => {
      const theta = clampTheta(t);
      if (blocked(theta, bands)) return;
      if (sameSideOnly && landBetween(theta, stay, bands)) return;
      const score = Math.abs(theta - want) + 1.4 * Math.abs(theta - stay);
      if (score < bestScore) {
        bestScore = score;
        best = theta;
      }
    };
    for (const edge of edges) consider(edge);
    if (best === undefined) {
      for (let t = THETA_MIN; t <= THETA_MAX; t += SCAN_STEP) consider(t);
    }
    return best;
  };
  const picked = pick(true) ?? pick(false) ?? stay;
  if (blocked(stay, bands)) return picked;
  const delta = picked - stay;
  if (Math.abs(delta) <= maxStep) return picked;
  const limited = clampTheta(stay + Math.sign(delta) * maxStep);
  if (!blocked(limited, bands) && !landBetween(limited, stay, bands)) return limited;
  return stay;
}

export function pushOffLand(theta: number, phi: number): { theta: number; phi: number } {
  return { theta: openTheta(theta, landBands(phi), theta), phi };
}

export function isCruiseBlocked(theta: number, phi: number): boolean {
  return blocked(theta, landBands(phi));
}

function smoothCircular(values: number[], radius: number): number[] {
  const n = values.length;
  const out = new Array<number>(n);
  const sigma = Math.max(1, radius * 0.5);
  const span = Math.ceil(radius * 2);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let wsum = 0;
    for (let k = -span; k <= span; k++) {
      const w = Math.exp(-(k * k) / (2 * sigma * sigma));
      sum += values[(i + k + n) % n] * w;
      wsum += w;
    }
    out[i] = sum / wsum;
  }
  return out;
}

function rideRadius(): number {
  return PLANET.radius + WATER_LEVEL + SAIL.draft;
}

function projectOpen(positions: Vector3[], phis: number[]): void {
  const n = positions.length;
  for (let i = 0; i < n; i++) {
    const sph = cartToSph(positions[i]);
    const prev = cartToSph(positions[(i - 1 + n) % n]).theta;
    const theta = openTheta(sph.theta, landBands(phis[i]), prev);
    positions[i].copy(sphToCart(rideRadius(), theta, phis[i]));
  }
}

function easeIfOpen(positions: Vector3[], phis: number[]): void {
  const n = positions.length;
  const next = positions.map((p) => p.clone());
  for (let i = 0; i < n; i++) {
    const prev = positions[(i - 1 + n) % n];
    const curr = positions[i];
    const nxt = positions[(i + 1) % n];
    next[i].copy(prev).add(nxt).multiplyScalar(0.5).lerp(curr, 0.78);
    next[i].setLength(rideRadius());
    const sph = cartToSph(next[i]);
    const bands = landBands(phis[i]);
    const from = cartToSph(curr);
    if (blocked(sph.theta, bands) || landBetween(sph.theta, from.theta, bands)) next[i].copy(curr);
  }
  for (let i = 0; i < n; i++) positions[i].copy(next[i]);
}

export type SailRouteKind = "cross" | "south" | "north" | "basin";

export type FleetRoute = {
  seed: number;
  kind: SailRouteKind;
  theta0: number;
  phi0: number;
  /** Semi-major axis in radians. Full reach is 2 * amp * planet radius. */
  amp: number;
  /** Minor axis as a fraction of the major axis. Near 0.5 stays rounded and gentle. */
  aspect: number;
  /** Rotation of the long axis on the water. */
  axis: number;
  reverse: boolean;
};

/** Long axes run from just under half the planet's diameter to just over it. */
export const FLEET_ROUTES: FleetRoute[] = [
  { seed: 811, kind: "basin", theta0: 1.35, phi0: 5.95, amp: 1.02, aspect: 0.7, axis: 1.6, reverse: false },
  { seed: 937, kind: "basin", theta0: 1.89, phi0: 0.8, amp: 0.88, aspect: 0.68, axis: 1.1, reverse: true },
  { seed: 1211, kind: "basin", theta0: 1.77, phi0: 1.2, amp: 0.8, aspect: 0.68, axis: 2.6, reverse: false },
  { seed: 1348, kind: "basin", theta0: 1.41, phi0: 4.8, amp: 0.72, aspect: 0.68, axis: 0.3, reverse: true },
  { seed: 1485, kind: "basin", theta0: 2.01, phi0: 0.0, amp: 0.72, aspect: 0.68, axis: 1.1, reverse: false },
  { seed: 1622, kind: "basin", theta0: 2.01, phi0: 1.6, amp: 0.72, aspect: 0.68, axis: 1.9, reverse: true },
  { seed: 1759, kind: "basin", theta0: 2.01, phi0: 4.0, amp: 0.64, aspect: 0.7, axis: 1.1, reverse: false },
  { seed: 1896, kind: "basin", theta0: 2.01, phi0: 4.8, amp: 0.64, aspect: 0.7, axis: 1.1, reverse: true },
  { seed: 2033, kind: "basin", theta0: 1.29, phi0: 1.2, amp: 0.56, aspect: 0.75, axis: 0.3, reverse: false },
  { seed: 2170, kind: "basin", theta0: 2.13, phi0: 5.6, amp: 0.48, aspect: 0.81, axis: 1.9, reverse: true },
];

function rawTrack(
  kind: SailRouteKind,
  i: number,
  n: number,
  phase: number,
  theta0: number,
  phi0: number,
  amp: number,
  reverse: boolean,
): { theta: number; phi: number } {
  const a = (i / n) * Math.PI * 2 * (reverse ? -1 : 1);
  if (kind === "basin") {
    return {
      phi: wrapPhi(phi0 + Math.sin(a) * amp + Math.sin(a * 2 + phase) * amp * 0.12),
      theta: theta0 + Math.cos(a) * amp * 0.62 + Math.sin(a * 3 + phase) * amp * 0.08,
    };
  }
  const wander = kind === "cross" ? amp : amp;
  return {
    phi: wrapPhi(phi0 + a),
    theta: theta0 + Math.sin(a + phase) * wander + Math.sin(a * 3 + phase * 1.2) * wander * 0.22,
  };
}

/** Closed cruise in open water. Narrow straits are treated as land. */
export function createSailPath(sampleCount = 768, route: FleetRoute | number = 811, kind: SailRouteKind = "cross"): RailwayPath {
  const spec: FleetRoute =
    typeof route === "number"
      ? FLEET_ROUTES.find((r) => r.seed === route && r.kind === kind) ?? {
          seed: route,
          kind,
          theta0: kind === "south" ? 2.12 : kind === "north" ? 0.84 : kind === "basin" ? 1.5 : 1.2,
          phi0: 0,
          amp: kind === "basin" ? 0.8 : 0.2,
          aspect: 0.55,
          axis: 0.4,
          reverse: false,
        }
      : route;
  const rng = mulberry32(spec.seed);
  const phase = rng() * 0.7;
  const theta0 = spec.theta0;
  const phi0 = spec.phi0;
  const n = Math.max(sampleCount, 720);
  if (spec.kind === "basin") return finishPath(basinLoop(n, spec, phase));
  const phis: number[] = [];
  const thetas: number[] = [];
  let prev = theta0;
  for (let i = 0; i < n; i++) {
    const track = rawTrack(spec.kind, i, n, phase, theta0, phi0, spec.amp, spec.reverse);
    phis.push(track.phi);
    const theta = openTheta(track.theta, landBands(track.phi), prev);
    thetas.push(theta);
    prev = theta;
  }

  let smooth = smoothCircular(thetas, 40);
  let keep = thetas[0];
  for (let i = 0; i < n; i++) {
    smooth[i] = openTheta(smooth[i], landBands(phis[i]), keep);
    keep = smooth[i];
  }
  smooth = smoothCircular(smooth, 22);
  keep = smooth[0];
  for (let i = 0; i < n; i++) {
    smooth[i] = openTheta(smooth[i], landBands(phis[i]), keep);
    keep = smooth[i];
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const prev = smooth[(i - 1 + n) % n];
      smooth[i] = openTheta(smooth[i], landBands(phis[i]), prev);
    }
  }

  const positions = smooth.map((theta, i) => sphToCart(rideRadius(), clampTheta(theta), phis[i]));
  for (let pass = 0; pass < 3; pass++) {
    easeIfOpen(positions, phis);
    projectOpen(positions, phis);
  }
  return finishPath(positions);
}

const shiftP = new Vector3();
const shiftSouth = new Vector3();
const shiftEast = new Vector3();
const shiftAxis = new Vector3();
const shiftQuat = new Quaternion();

function shift(theta: number, phi: number, south: number, east: number): { theta: number; phi: number } {
  const dist = Math.hypot(south, east);
  sphToCart(1, theta, phi, shiftP);
  if (dist < 1e-5) return { theta, phi };
  const thetaSouth = Math.min(Math.PI - 0.04, Math.max(0.04, theta + 0.02));
  sphToCart(1, thetaSouth, phi, shiftSouth).sub(shiftP);
  if (shiftSouth.lengthSq() < 1e-8) shiftSouth.set(0, theta < 1 ? -1 : 1, 0);
  shiftSouth.normalize();
  shiftEast.crossVectors(shiftP, shiftSouth).normalize();
  shiftSouth.multiplyScalar(south / dist).add(shiftEast.multiplyScalar(east / dist));
  shiftAxis.crossVectors(shiftP, shiftSouth).normalize();
  shiftQuat.setFromAxisAngle(shiftAxis, dist);
  shiftP.applyQuaternion(shiftQuat);
  const sph = cartToSph(shiftP);
  return { theta: sph.theta, phi: sph.phi };
}

function basinLoop(n: number, spec: FleetRoute, _phase: number): Vector3[] {
  const positions: Vector3[] = [];
  const dir = spec.reverse ? -1 : 1;
  const aspect = spec.aspect;
  const axis = spec.axis;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 * dir;
    const along = Math.cos(a) * spec.amp;
    const across = Math.sin(a) * spec.amp * aspect;
    const south = along * Math.cos(axis) - across * Math.sin(axis);
    const east = along * Math.sin(axis) + across * Math.cos(axis);
    let southUse = south;
    let eastUse = east;
    let p = shift(spec.theta0, spec.phi0, southUse, eastUse);
    for (let pull = 0; pull < 10 && (p.theta < THETA_MIN || p.theta > THETA_MAX || heightOffset(p.theta, p.phi) >= WATER_LEVEL - 0.36); pull++) {
      southUse *= 0.9;
      eastUse *= 0.9;
      p = shift(spec.theta0, spec.phi0, southUse, eastUse);
    }
    positions.push(sphToCart(rideRadius(), clampTheta(p.theta), wrapPhi(p.phi)));
  }
  return positions;
}

function finishPath(positions: Vector3[]): RailwayPath {
  const n = positions.length;
  const tangents: Vector3[] = [];
  for (let i = 0; i < n; i++) {
    tangents.push(positions[(i + 1) % n].clone().sub(positions[(i - 1 + n) % n]).normalize());
  }
  const samples: PathSample[] = [];
  let totalLength = 0;
  let prevSide: Vector3 | undefined;
  for (let i = 0; i < n; i++) {
    const position = positions[i];
    const frame = orthonormalFrame(position, tangents[i], prevSide);
    prevSide = frame.binormal;
    if (i > 0) totalLength += position.distanceTo(positions[i - 1]);
    const sph = cartToSph(position);
    const ground = heightOffset(sph.theta, sph.phi);
    samples.push({
      position: position.clone(),
      tangent: frame.tangent,
      normal: frame.normal,
      binormal: frame.binormal,
      s: totalLength,
      trackRadius: position.length(),
      groundRadius: PLANET.radius + ground,
      elevation: position.length() - (PLANET.radius + ground),
      inTunnel: false,
      inCutting: false,
    });
  }
  totalLength += positions[n - 1].distanceTo(positions[0]);
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
  return { samples, totalLength, controlPoints: positions };
}

const scratch: PathSample = freshSample();

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

export function getSampleAt(path: SailPath, s: number, out?: PathSample): PathSample {
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
  out.inTunnel = false;
  out.inCutting = false;
  return out;
}

