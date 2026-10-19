import { PointLight } from "three";
import { describe, expect, it } from "vitest";
import { SAIL } from "../config";
import { createFleet, focusNextYacht, updateFleet } from "./yacht";

describe("yacht masthead", () => {
  it("veers aside instead of stacking behind a slower yacht", () => {
    const fleet = createFleet();
    const hero = fleet.hero;
    const blocker = fleet.guests[0];
    blocker.paths = hero.paths;
    blocker.pathIndex = 0;
    hero.distance = 20;
    blocker.distance = 23;
    for (let i = 0; i < 120; i++) updateFleet(hero, [blocker], 0.05);
    expect(Math.abs(hero.lane)).toBeGreaterThan(1.4);
    expect(hero.speed).toBeGreaterThan(blocker.speed * 1.2);
    const side = Math.sign(hero.lane);

    const held = hero.lane;
    blocker.distance = hero.distance + 1.2;
    for (let i = 0; i < 30; i++) updateFleet(hero, [blocker], 0.05);
    expect(Math.sign(hero.lane) || side).toBe(side);
    expect(Math.abs(hero.lane)).toBeGreaterThan(Math.abs(held) * 0.8);

    blocker.distance = hero.distance - 16;
    for (let i = 0; i < 220; i++) updateFleet(hero, [blocker], 0.05);
    expect(Math.abs(hero.lane)).toBeLessThan(0.5);
  });

  it("keeps hulls from occupying the same water", () => {
    const fleet = createFleet();
    for (let i = 0; i < 30; i++) updateFleet(fleet.hero, fleet.guests, 0.05);
    const boats = [fleet.hero, ...fleet.guests];
    for (let i = 0; i < boats.length; i++) {
      const a = boats[i].craft.position;
      for (let j = i + 1; j < boats.length; j++) {
        expect(a.distanceTo(boats[j].craft.position), `${boats[i].name} vs ${boats[j].name}`).toBeGreaterThan(2.2);
      }
    }
  });

  it("sails a fleet of ten with a faster hero", () => {
    const fleet = createFleet();
    expect(fleet.guests).toHaveLength(9);
    expect(fleet.hero.baseSpeed).toBeCloseTo(SAIL.speed * SAIL.heroMul, 5);
    for (const guest of fleet.guests) {
      expect(fleet.hero.baseSpeed).toBeGreaterThan(guest.baseSpeed * 1.45);
    }
  });

  it("gives the next yacht the hero speed", () => {
    const fleet = createFleet();
    const first = fleet.hero;
    const next = focusNextYacht(fleet);
    expect(next).not.toBe(first);
    expect(fleet.hero).toBe(next);
    expect(next.role).toBe("hero");
    expect(next.baseSpeed).toBeCloseTo(SAIL.speed * SAIL.heroMul, 5);
    expect(next.speed).toBeCloseTo(SAIL.speed * SAIL.heroMul, 5);
    expect(first.role).toBe("guest");
    expect(first.baseSpeed).toBeCloseTo(first.cruise, 5);
    expect(fleet.guests).toHaveLength(9);
    expect(fleet.guests).toContain(first);
    for (const guest of fleet.guests) {
      expect(next.baseSpeed).toBeGreaterThan(guest.baseSpeed * 1.45);
    }
  });

  it("keeps mast lamps on in daylight and at night", () => {
    const fleet = createFleet();
    updateFleet(fleet.hero, fleet.guests, 1);
    for (const boat of [fleet.hero, ...fleet.guests]) {
      expect(boat.mastLight.intensity).toBeGreaterThan(3);
      expect(boat.mastLens.emissiveIntensity).toBeGreaterThan(0.4);
    }
    const flagLamp = fleet.hero.craft.getObjectByName("mast-flag-lamp") as PointLight;
    expect(flagLamp.intensity).toBeGreaterThan(1);
  });
});
