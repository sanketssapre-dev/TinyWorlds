import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { FLIGHT, PLANET } from "../config";
import { createFlightPath, getSampleAt } from "./path";

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

describe("flight path", () => {
  const path = createFlightPath(768);

  it("joins start and end without a gap", () => {
    const start = path.samples[0].position;
    const end = path.samples[path.samples.length - 1].position;
    expect(start.distanceTo(end)).toBeLessThan(1e-4);
  });

  it("has continuous tangents at the seam", () => {
    const start = path.samples[0].tangent;
    const end = path.samples[path.samples.length - 1].tangent;
    expect(start.distanceTo(end)).toBeLessThan(1e-3);
  });

  it("contains only finite coordinates and frames", () => {
    for (const s of path.samples) {
      expect(Number.isFinite(s.position.x)).toBe(true);
      expect(Number.isFinite(s.position.y)).toBe(true);
      expect(Number.isFinite(s.position.z)).toBe(true);
      expect(Number.isFinite(s.tangent.x)).toBe(true);
      expect(Number.isFinite(s.normal.x)).toBe(true);
      expect(Number.isFinite(s.binormal.x)).toBe(true);
    }
  });

  it("traverses the seam without a jump", () => {
    const preSeam = path.samples[path.samples.length - 2].position;
    const seam = path.samples[0].position;
    const postSeam = path.samples[1].position;
    const step1 = preSeam.distanceTo(seam);
    const step2 = seam.distanceTo(postSeam);
    expect(Math.abs(step1 - step2)).toBeLessThan(step2 * 1.5);
  });

  it("wraps getSampleAt(totalLength) to the start", () => {
    const a = getSampleAt(path, 0);
    const b = getSampleAt(path, path.totalLength);
    expect(a.position.distanceTo(b.position)).toBeLessThan(1e-4);
  });

  it("keeps the circuit on the planet above safe terrain clearance", () => {
    for (const s of path.samples) {
      const r = s.position.length();
      expect(r).toBeGreaterThan(PLANET.radius + FLIGHT.minClearance);
      expect(s.elevation).toBeGreaterThanOrEqual(FLIGHT.minClearance - 0.05);
    }
    expect(path.totalLength).toBeGreaterThan(Math.PI * PLANET.radius);
  });
});

describe("flight path variation", () => {
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

  it("stays one graceful closed cruise for several seeds", () => {
    const lengths: number[] = [];
    for (const seed of [1, 2, 3, 7, 11, 42]) {
      const p = createFlightPath(512, seed);
      lengths.push(p.totalLength);
      expect(p.samples[0].position.distanceTo(p.samples[p.samples.length - 1].position)).toBeLessThan(
        1e-4,
      );
      const step = p.totalLength / (p.samples.length - 1);
      const seam = p.samples[p.samples.length - 2].position.distanceTo(p.samples[0].position);
      expect(seam).toBeLessThan(step * 2.5);
      expect(maxTangentStep(p)).toBeLessThan(0.22);
      for (const sample of p.samples) {
        expect(sample.elevation).toBeGreaterThanOrEqual(FLIGHT.minClearance - 0.05);
        expect(sample.position.length()).toBeGreaterThan(PLANET.radius + 1);
        expect(Number.isFinite(sample.position.x)).toBe(true);
        expect(Number.isFinite(sample.tangent.x)).toBe(true);
      }
    }
    expect(Math.max(...lengths) / Math.min(...lengths)).toBeLessThan(1.2);
  });
});
