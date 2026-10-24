import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { FLIGHT, PLANET } from "../config";
import { cartToSph } from "../math/sphere";
import { heightOffset } from "../planet/height";
import { createFlight, enterAutopilot, exitAutopilot, updateAutopilot, updateFlight } from "./biplane";
import type { FlightState } from "./biplane";
import { createAutopilotPath, getSampleAt, nearestSampleDistance, scratchSample } from "./path";
import type { FlightPath } from "./path";

const radial = (f: FlightState) => f.craft.position.clone().normalize();

function groundUnder(f: FlightState): number {
  const sph = cartToSph(radial(f));
  return heightOffset(sph.theta, sph.phi);
}

/** Shortest distance from the craft to any point of the route. */
function distanceToRoute(f: FlightState, route: FlightPath): number {
  let nearest = Infinity;
  for (const sample of route.samples) {
    nearest = Math.min(nearest, sample.position.distanceTo(f.craft.position));
  }
  return nearest;
}

/** Fly the craft on autopilot for `seconds`. */
function fly(f: FlightState, route: FlightPath, seconds: number): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) updateAutopilot(f, route, 1 / 60);
}

/** A craft that has flown away from the route under manual control. */
function wandering(variant: number, seed: number): { f: FlightState; route: FlightPath } {
  const route = createAutopilotPath(256, seed, variant);
  const f = createFlight(getSampleAt(route, 0, scratchSample()));
  for (let i = 0; i < 600; i++) updateFlight(f, 1 / 60, 0, 0);
  return { f, route };
}

describe("autopilot route", () => {
  it("is a closed loop", () => {
    for (const variant of [0, 1, 2]) {
      const route = createAutopilotPath(256, 7, variant);
      const first = route.samples[0];
      const last = route.samples[route.samples.length - 1];
      expect(route.totalLength).toBeGreaterThan(0);
      expect(last.position.distanceTo(first.position)).toBeLessThan(1e-6);
      expect(last.s).toBeCloseTo(route.totalLength, 6);
    }
  });

  it("gives three genuinely different routes", () => {
    const routes = [0, 1, 2].map((variant) => createAutopilotPath(256, 42, variant));
    for (let i = 0; i < routes.length; i++) {
      for (let j = i + 1; j < routes.length; j++) {
        let widest = 0;
        for (let k = 0; k < routes[i].samples.length; k++) {
          widest = Math.max(
            widest,
            routes[i].samples[k].position.distanceTo(routes[j].samples[k].position),
          );
        }
        expect(widest).toBeGreaterThan(5);
      }
    }
  });

  it("is deterministic for the same seed, and shifts with a new one", () => {
    const a = createAutopilotPath(256, 1234, 0);
    const b = createAutopilotPath(256, 1234, 0);
    const c = createAutopilotPath(256, 1235, 0);
    expect(a.samples[100].position.distanceTo(b.samples[100].position)).toBeLessThan(1e-9);
    expect(a.samples[100].position.distanceTo(c.samples[100].position)).toBeGreaterThan(1e-3);
  });

  it("never sits below the terrain it crosses", () => {
    for (const variant of [0, 1, 2]) {
      const route = createAutopilotPath(256, 3, variant);
      for (const sample of route.samples) {
        expect(sample.elevation).toBeGreaterThanOrEqual(FLIGHT.minClearance - 1e-6);
      }
    }
  });
});

describe("autopilot", () => {
  it("steers the craft back onto the route when it has wandered off", () => {
    const { f, route } = wandering(1, 7);
    const before = distanceToRoute(f, route);
    expect(before).toBeGreaterThan(2);

    enterAutopilot(f);
    fly(f, route, 90);

    const after = distanceToRoute(f, route);
    expect(after).toBeLessThan(before);
    expect(after).toBeLessThan(2.5);
  });

  it("rejoins the route from far away, from any direction", () => {
    // 60 units of arc from the route's start, swung round four axes. This is the
    // case that used to fail: a turn input pinned at full deflection flies a
    // circle, and a circle never arrives anywhere.
    const axes = [
      new Vector3(0, 1, 0),
      new Vector3(1, 0, 0),
      new Vector3(0, 0, 1),
      new Vector3(1, 1, 1).normalize(),
    ];
    for (const variant of [0, 1, 2]) {
      const route = createAutopilotPath(256, 7, variant);
      const here = getSampleAt(route, 0, scratchSample());
      for (let k = 0; k < 8; k++) {
        const dir = here.position
          .clone()
          .normalize()
          .applyAxisAngle(axes[k % axes.length], 60 / PLANET.radius)
          .normalize();

        const f = createFlight(getSampleAt(route, 0, scratchSample()));
        f.craft.position.copy(dir).multiplyScalar(PLANET.radius + here.elevation);
        f.dir.copy(dir);
        f.heading.copy(here.tangent).addScaledVector(dir, -here.tangent.dot(dir)).normalize();

        expect(distanceToRoute(f, route)).toBeGreaterThan(2);

        enterAutopilot(f);
        fly(f, route, 90);
        expect(distanceToRoute(f, route)).toBeLessThan(3);
      }
    }
  });

  it("holds close to the route once it has settled", () => {
    for (const variant of [0, 1, 2]) {
      const { f, route } = wandering(variant, 7);
      enterAutopilot(f);
      fly(f, route, 30);

      let total = 0;
      const steps = 3600;
      for (let i = 0; i < steps; i++) {
        updateAutopilot(f, route, 1 / 60);
        total += distanceToRoute(f, route);
      }
      expect(total / steps).toBeLessThan(1.5);
    }
  });

  it("takes over without disturbing the craft's flight", () => {
    const { f, route } = wandering(2, 7);
    const position = f.craft.position.clone();
    const heading = f.heading.clone();

    enterAutopilot(f);
    updateAutopilot(f, route, 1 / 60);

    // Nothing is moved or snapped: the craft carries on from where it was and
    // is steered onto the course from there.
    expect(f.craft.position.distanceTo(position)).toBeLessThan(0.1);
    expect(f.heading.dot(heading)).toBeGreaterThan(0.999);
  });

  it("points the nose along the route it is flying", () => {
    const { f, route } = wandering(2, 9);
    enterAutopilot(f);
    fly(f, route, 60);

    for (let i = 0; i < 300; i++) {
      updateAutopilot(f, route, 1 / 60);
      const here = getSampleAt(route, nearestSampleDistance(route, f.craft.position), scratchSample());
      expect(f.heading.dot(here.tangent)).toBeGreaterThan(0.95);
    }
  });

  it("banks toward the route when it is standing off to one side", () => {
    const route = createAutopilotPath(256, 5, 0);
    const f = createFlight(getSampleAt(route, 0, scratchSample()));
    const here = getSampleAt(route, 0, scratchSample());

    // Step off to the left of the route: binormal is the route's own right.
    f.craft.position.addScaledVector(here.binormal, -6);
    f.craft.position.setLength(PLANET.radius + f.ride);
    f.dir.copy(f.craft.position).normalize();

    enterAutopilot(f);
    fly(f, route, 0.5);

    // It leans right, toward the route...
    expect(f.bankAngle).toBeGreaterThan(0);

    // ...and then starts closing the gap.
    fly(f, route, 20);
    expect(distanceToRoute(f, route)).toBeLessThan(4);
  });

  it("makes progress along the route", () => {
    const { f, route } = wandering(1, 8);
    enterAutopilot(f);
    fly(f, route, 30);

    const before = nearestSampleDistance(route, f.craft.position);
    fly(f, route, 30);
    const after = nearestSampleDistance(route, f.craft.position);

    expect(after).toBeGreaterThan(before + 10);
  });

  it("never meets the terrain over a whole circuit", () => {
    const route = createAutopilotPath(256, 11, 2);
    const f = createFlight(getSampleAt(route, 0, scratchSample()));
    enterAutopilot(f);

    // Long enough to go all the way round, with room to spare.
    const steps = Math.ceil((route.totalLength / FLIGHT.speed) * 60 * 1.15);
    let travelled = 0;
    for (let i = 0; i < steps; i++) {
      const before = f.distance;
      updateAutopilot(f, route, 1 / 60);
      travelled += Math.max(0, f.distance - before);
      expect(f.ride).toBeGreaterThanOrEqual(groundUnder(f) + FLIGHT.minClearance - 1e-6);
    }
    expect(travelled).toBeGreaterThan(route.totalLength);
  });

  it("hands back without moving the craft", () => {
    const { f, route } = wandering(0, 5);
    enterAutopilot(f);
    fly(f, route, 30);

    const position = f.craft.position.clone();
    const dir = f.dir.clone();
    const heading = f.heading.clone();

    exitAutopilot(f);

    expect(f.mode).toBe("manual");
    expect(f.craft.position.distanceTo(position)).toBe(0);
    expect(f.dir.distanceTo(dir)).toBe(0);
    expect(f.heading.distanceTo(heading)).toBe(0);
  });

  it("leaves autopilot still flying the way it was going", () => {
    const { f, route } = wandering(1, 6);
    enterAutopilot(f);
    fly(f, route, 30);
    exitAutopilot(f);

    for (let i = 0; i < 120; i++) updateFlight(f, 1 / 60, 0, 0);

    expect(distanceToRoute(f, route)).toBeLessThan(3);
  });
});
