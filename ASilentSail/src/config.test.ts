import { describe, expect, it } from "vitest";
import { MOON, PLANET, TRAIN } from "./config";

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
});
