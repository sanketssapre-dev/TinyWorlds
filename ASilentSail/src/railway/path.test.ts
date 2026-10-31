import { describe, expect, it } from "vitest";
import { createPlanetMesh } from "../planet/mesh";
import { indexPlanetSurface } from "../planet/surface";
import { PLANET } from "../config";
import { createRailwayPath, getSampleAt, scratchSample } from "./path";

describe("railway path", () => {
  it("builds a closed continuous loop with positive length", () => {
    const planet = createPlanetMesh();
    const surface = indexPlanetSurface(planet.geometry);
    const path = createRailwayPath(surface, 480);
    expect(path.samples.length).toBe(480);
    expect(path.totalLength).toBeGreaterThan(100);

    const first = path.samples[0];
    const last = path.samples[path.samples.length - 1];
    // Closure: last segment reconnects near the first sample
    const gap = last.position.distanceTo(first.position);
    expect(gap).toBeLessThan(8);

    const a = getSampleAt(path, 0, scratchSample());
    const b = getSampleAt(path, path.totalLength, scratchSample());
    expect(a.position.distanceTo(b.position)).toBeLessThan(0.5);
  });

  it("keeps the train on the planet surface band", () => {
    const planet = createPlanetMesh();
    const surface = indexPlanetSurface(planet.geometry);
    const path = createRailwayPath(surface, 360);
    for (let i = 0; i < path.samples.length; i += 20) {
      const r = path.samples[i].position.length();
      expect(r).toBeGreaterThan(PLANET.radius - 8);
      expect(r).toBeLessThan(PLANET.radius + PLANET.maxHeight + 6);
    }
  });
});
