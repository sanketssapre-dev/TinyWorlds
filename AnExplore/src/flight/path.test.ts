import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { FLIGHT, PLANET } from "../config";
import { cartToSph, sphToCart } from "../math/sphere";
import { heightOffset } from "../planet/height";
import { createFlightPath, getSampleAt, traceRoute } from "./path";

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

  it("wraps getSampleAt(totalLength) to the start", () => {
    const a = getSampleAt(path, 0);
    const b = getSampleAt(path, path.totalLength);
    expect(a.position.distanceTo(b.position)).toBeLessThan(1e-4);
  });

  it("clears the terrain at every sample", () => {
    for (const sample of path.samples) {
      const sph = cartToSph(sample.position);
      const ground = heightOffset(sph.theta, sph.phi);
      expect(sample.elevation).toBeGreaterThanOrEqual(ground + FLIGHT.minClearance - 1e-6);
    }
    expect(path.totalLength).toBeGreaterThan(Math.PI * PLANET.radius);
  });

  it("contains only finite coordinates and frames", () => {
    for (const sample of path.samples) {
      for (const v of [sample.position, sample.tangent, sample.normal, sample.binormal]) {
        expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)).toBe(true);
      }
    }
  });
});

describe("traceRoute", () => {
  const dir = sphToCart(1, 0.8, 1.1).normalize();
  const heading = new Vector3(0, 1, 0).cross(dir).normalize();

  it("leaves the craft along its own heading", () => {
    const route = traceRoute(dir, heading, 256);
    expect(route.samples[0].position.clone().normalize().distanceTo(dir)).toBeLessThan(1e-6);
    expect(route.samples[0].tangent.dot(heading)).toBeGreaterThan(0.999);
  });

  it("is a true great circle, not a bent one", () => {
    const route = traceRoute(dir, heading, 256);
    const axis = new Vector3().crossVectors(dir, heading).normalize();
    for (const sample of route.samples) {
      expect(Math.abs(sample.position.clone().normalize().dot(axis))).toBeLessThan(1e-6);
    }
  });

  it("closes cleanly and never kinks", () => {
    const route = traceRoute(dir, heading, 256);
    expect(route.samples[0].position.distanceTo(route.samples.at(-1)!.position)).toBeLessThan(1e-4);
    for (let i = 1; i < route.samples.length; i++) {
      const turn = Math.acos(
        Math.min(1, Math.max(-1, route.samples[i - 1].tangent.dot(route.samples[i].tangent))),
      );
      expect(turn).toBeLessThan(0.05);
    }
  });

  it("swings the whole loop when the heading swings", () => {
    const turned = heading.clone().applyAxisAngle(dir, 0.3);
    const a = traceRoute(dir, heading, 256);
    const b = traceRoute(dir, turned, 256);
    const meanSeparation =
      a.samples
        .slice(0, -1)
        .reduce((sum, sample, i) => sum + sample.position.distanceTo(b.samples[i].position), 0) /
      (a.samples.length - 1);
    expect(meanSeparation).toBeGreaterThan(1);
  });
});
