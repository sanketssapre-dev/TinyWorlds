import { describe, expect, it } from "vitest";
import { MOON, PLANET, TRACK, TRAIN } from "./config";

describe("world scale", () => {
  it("uses an enlarged planet and a farther single Moon", () => {
    expect(PLANET.radius).toBeGreaterThan(45);
    expect(MOON.orbitDistance).toBeGreaterThan(PLANET.radius * 3);
    expect(MOON.radius / PLANET.radius).toBeGreaterThan(0.2);
    expect(MOON.radius / PLANET.radius).toBeLessThan(0.4);
  });

  it("doubles the autonomous train cruise speed", () => {
    expect(TRAIN.cruiseSpeed).toBe(1.32);
  });

  it("keeps the twin railway lines broad and well separated", () => {
    expect(TRACK.trackSpacing).toBe(4.8);
    expect(TRACK.sleeperWidth).toBe(1);
    expect(TRACK.sleeperLength).toBe(0.16);
    expect(TRACK.gauge).toBe(0.42);
  });
});
