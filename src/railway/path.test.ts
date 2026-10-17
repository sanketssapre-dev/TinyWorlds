import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { FLIGHT, PLANET, TRAIN, TRACK, planetToLocoRatio } from "../config";
import { createFlightPath, createRailwayPath, getSampleAt } from "./path";
import { collectPierPositions } from "./trackSupport";
import {
  checkClosedLoop,
  checkElevatedSupport,
  checkFinite,
  checkFrameSteps,
  checkGauge,
  checkOutwardFrames,
  checkPierReach,
  checkRouteVisits,
  checkScaleRatio,
  checkSeamTraversal,
  checkTangentContinuity,
  checkTrackSeated,
} from "./invariants";

const path = createRailwayPath(768);

describe("scale", () => {
  it("keeps a 60:1 planet-diameter-to-locomotive ratio", () => {
    expect(planetToLocoRatio()).toBe(60);
    expect(PLANET.diameter).toBe(90);
    expect(PLANET.radius).toBe(45);
    expect(TRAIN.locomotiveLength).toBe(1.5);
    const r = checkScaleRatio();
    expect(r.ok).toBe(true);
  });
});

describe("closed railway path", () => {
  it("joins start and end without a gap", () => {
    const r = checkClosedLoop(path);
    expect(r.ok, r.detail).toBe(true);
  });

  it("has continuous tangents at the seam", () => {
    const r = checkTangentContinuity(path);
    expect(r.ok, r.detail).toBe(true);
  });

  it("contains only finite coordinates and frames", () => {
    const r = checkFinite(path);
    expect(r.ok, r.detail).toBe(true);
  });

  it("traverses the seam without a jump", () => {
    const r = checkSeamTraversal(path);
    expect(r.ok, r.detail).toBe(true);
  });

  it("wraps getSampleAt(totalLength) to the start", () => {
    const a = getSampleAt(path, 0);
    const b = getSampleAt(path, path.totalLength);
    expect(a.position.distanceTo(b.position)).toBeLessThan(1e-4);
  });

  it("keeps the circuit on the planet", () => {
    for (const s of path.samples) {
      const r = s.position.length();
      expect(r).toBeGreaterThan(PLANET.radius + PLANET.minHeight - 0.5);
      expect(r).toBeLessThan(PLANET.radius + PLANET.maxHeight + 4);
    }
    expect(path.totalLength).toBeGreaterThan(Math.PI * PLANET.radius);
  });
});

describe("track construction invariants", () => {
  it("uses a consistent railway gauge", () => {
    expect(checkGauge().ok).toBe(true);
    expect(TRACK.gauge).toBeCloseTo(0.28);
  });

  it("supports elevated sections with piers", () => {
    const piers = collectPierPositions(path);
    const r = checkElevatedSupport(path, piers.length);
    expect(r.ok, r.detail).toBe(true);
    const needs = path.samples.some((s) => s.elevation >= TRACK.elevatedThreshold);
    if (needs) expect(piers.length).toBeGreaterThan(4);
  });

  it("keeps the rails on the ground, in a cutting, or in a tunnel", () => {
    const r = checkTrackSeated(path);
    expect(r.ok, r.detail).toBe(true);
  });

  it("keeps the track frame upright and continuous", () => {
    const outward = checkOutwardFrames(path);
    const steps = checkFrameSteps(path);
    expect(outward.ok, outward.detail).toBe(true);
    expect(steps.ok, steps.detail).toBe(true);
  });

  it("passes the villages, water, and landmarks", () => {
    const r = checkRouteVisits(path);
    expect(r.ok, r.detail).toBe(true);
  });

  it("places a pier near every elevated sample", () => {
    const piers = collectPierPositions(path);
    const r = checkPierReach(path, piers);
    expect(r.ok, r.detail).toBe(true);
    for (const pier of piers) {
      expect(pier.bottom.length()).toBeLessThan(pier.top.length());
    }
  });
});

function angleBetween(a: Vector3, b: Vector3): number {
  const dot = a.clone().normalize().dot(b.clone().normalize());
  return Math.acos(Math.min(1, Math.max(-1, dot)));
}

function maxTangentStep(path: ReturnType<typeof createFlightPath>): number {
  let maxTurn = 0;
  for (let i = 1; i < path.samples.length; i++) {
    const dot = path.samples[i - 1].tangent.dot(path.samples[i].tangent);
    const turn = Math.acos(Math.min(1, Math.max(-1, dot)));
    if (turn > maxTurn) maxTurn = turn;
  }
  return maxTurn;
}

function phiOf(point: Vector3): number {
  const phi = Math.atan2(point.z, point.x);
  return phi < 0 ? phi + Math.PI * 2 : phi;
}

describe("flight path variation", () => {
  const railway = createRailwayPath(128);
  const cruiseRadius = PLANET.radius + FLIGHT.cruise;

  it("uses one stable seed while tests are running", () => {
    const implicit = createFlightPath(96);
    const seeded = createFlightPath(96, 1);
    expect(implicit.samples[20].position.distanceTo(seeded.samples[20].position)).toBeLessThan(1e-6);
    const again = createFlightPath(96);
    expect(again.totalLength).toBeCloseTo(implicit.totalLength, 8);
  });

  it("repeats a seeded loop and changes when the seed changes", () => {
    const a = createFlightPath(128, 4);
    const b = createFlightPath(128, 4);
    const other = createFlightPath(128, 9);
    expect(a.controlPoints.length).toBe(b.controlPoints.length);
    for (let i = 0; i < a.controlPoints.length; i++) {
      expect(a.controlPoints[i].distanceTo(b.controlPoints[i])).toBeLessThan(1e-6);
    }
    let separated = 0;
    for (let i = 0; i < a.controlPoints.length; i++) {
      if (a.controlPoints[i].distanceTo(other.controlPoints[i]) > 0.25) separated++;
    }
    expect(separated).toBeGreaterThan(a.controlPoints.length / 2);
  });

  it("shifts each waypoint by about a quarter of the local spacing", () => {
    const flight = createFlightPath(128, 1);
    const n = railway.controlPoints.length;
    expect(flight.controlPoints.length).toBe(n);
    const ratios: number[] = [];
    const shifts: number[] = [];
    let previousPhi = -1;
    for (let i = 0; i < n; i++) {
      const prev = railway.controlPoints[(i - 1 + n) % n];
      const curr = railway.controlPoints[i];
      const next = railway.controlPoints[(i + 1) % n];
      const spacing = Math.min(angleBetween(prev, curr), angleBetween(curr, next));
      const moved = angleBetween(curr, flight.controlPoints[i]);
      ratios.push(moved / spacing);
      shifts.push(moved);
      expect(moved).toBeLessThanOrEqual(spacing * 0.34 + 1e-6);
      expect(flight.controlPoints[i].length()).toBeCloseTo(cruiseRadius, 5);
      const phi = phiOf(flight.controlPoints[i]);
      expect(phi).toBeGreaterThan(previousPhi);
      previousPhi = phi;
    }
    const mean = ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
    const meanShift = shifts.reduce((sum, value) => sum + value, 0) / shifts.length;
    expect(mean).toBeGreaterThan(0.16);
    expect(mean).toBeLessThan(0.3);
    expect(meanShift).toBeGreaterThan(0.04);
    expect(meanShift).toBeLessThan(0.12);
    expect(meanShift * cruiseRadius).toBeGreaterThan(2);
    expect(meanShift * cruiseRadius).toBeLessThan(6);
  });

  it("stays one graceful closed cruise for several seeds", () => {
    const lengths: number[] = [];
    for (const seed of [1, 2, 3, 7, 11, 42]) {
      const path = createFlightPath(512, seed);
      lengths.push(path.totalLength);
      expect(path.samples[0].position.distanceTo(path.samples[path.samples.length - 1].position)).toBeLessThan(
        1e-4,
      );
      const step = path.totalLength / (path.samples.length - 1);
      const seam = path.samples[path.samples.length - 2].position.distanceTo(path.samples[0].position);
      expect(seam).toBeLessThan(step * 2.5);
      expect(maxTangentStep(path)).toBeLessThan(0.22);
      for (const sample of path.samples) {
        expect(sample.elevation).toBeGreaterThanOrEqual(FLIGHT.minClearance - 0.05);
        expect(sample.position.length()).toBeGreaterThan(PLANET.radius + 1);
        expect(Number.isFinite(sample.position.x)).toBe(true);
        expect(Number.isFinite(sample.tangent.x)).toBe(true);
      }
    }
    expect(Math.max(...lengths) / Math.min(...lengths)).toBeLessThan(1.2);
  });
});
