import { Matrix4, Mesh, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { FLIGHT, PLANET } from "../config";
import { cartToSph } from "../math/sphere";
import { heightOffset } from "../planet/height";
import { createFlightPath, getSampleAt, scratchSample, traceRoute } from "./path";
import { createFlight, updateFlight } from "./biplane";
import type { FlightState } from "./biplane";

const path = createFlightPath(256);

function newFlight(): FlightState {
  return createFlight(getSampleAt(path, 0, scratchSample()));
}

const radial = (f: FlightState) => f.craft.position.clone().normalize();
const nose = (f: FlightState) => new Vector3(0, 0, 1).applyQuaternion(f.craft.quaternion);
const up = (f: FlightState) => new Vector3(0, 1, 0).applyQuaternion(f.craft.quaternion);
/** The craft's own left wing tip, which is local +x for a model facing +z. */
const span = (f: FlightState) => new Vector3(1, 0, 0).applyQuaternion(f.craft.quaternion);
/** The craft's own right-hand side, in world terms. */
const rightSide = (f: FlightState) => nose(f).clone().cross(up(f)).normalize();
/** The great circle the craft is currently flying along. */
const course = (f: FlightState) => new Vector3().crossVectors(f.dir, f.heading).normalize();

describe("flight", () => {
  it("flies straight when nothing is pressed", () => {
    const flight = newFlight();
    const axis = course(flight);
    for (let i = 0; i < 240; i++) updateFlight(flight, 1 / 60);
    expect(flight.turnRate).toBe(0);
    expect(flight.bankAngle).toBe(0);
    // The straightest line a sphere allows is a great circle: with no input the
    // craft never leaves the plane it set off in.
    expect(Math.abs(radial(flight).dot(axis))).toBeLessThan(1e-6);
  });

  it("travels at its stated speed along the sphere", () => {
    const flight = newFlight();
    for (let i = 0; i < 600; i++) updateFlight(flight, 1 / 60);
    const before = flight.craft.position.clone();
    const radius = before.length();
    updateFlight(flight, 1);
    const swept = before.normalize().angleTo(radial(flight)) * radius;
    expect(swept).toBeCloseTo(FLIGHT.speed, 1);
  });

  it("stays square: nose tangent, up radial, wings level", () => {
    const flight = newFlight();
    for (let i = 0; i < 240; i++) updateFlight(flight, 1 / 60, i % 80 < 40 ? 1 : -1);
    for (const axis of [nose(flight), up(flight), span(flight)]) {
      expect(axis.length()).toBeCloseTo(1, 9);
    }
    expect(nose(flight).dot(radial(flight))).toBeCloseTo(0, 9);
    expect(nose(flight).dot(up(flight))).toBeCloseTo(0, 9);
    expect(nose(flight).dot(span(flight))).toBeCloseTo(0, 9);
    // The nose really is pointing where the craft is heading.
    expect(nose(flight).dot(flight.heading)).toBeGreaterThan(0.999999);
  });

  it("turns right when the right key is held, and the turn persists", () => {
    const flight = newFlight();
    updateFlight(flight, 1 / 60);
    const startCourse = course(flight);
    const before = flight.heading.clone();
    const side = rightSide(flight);
    for (let i = 0; i < 90; i++) updateFlight(flight, 1 / 60, 1);
    // The nose swung toward the craft's right...
    expect(flight.heading.clone().sub(before).dot(side)).toBeGreaterThan(0.05);

    // ...and letting go does not take it back. The nose eases out over the next
    // moment, and then the craft simply holds the new line — which is not the
    // one it started on.
    for (let i = 0; i < 180; i++) updateFlight(flight, 1 / 60);
    expect(flight.turnRate).toBeCloseTo(0, 3);
    const settledCourse = course(flight);
    for (let i = 0; i < 180; i++) updateFlight(flight, 1 / 60);
    expect(Math.abs(course(flight).dot(settledCourse))).toBeGreaterThan(0.99999);
    expect(Math.abs(course(flight).dot(startCourse))).toBeLessThan(0.999);
  });

  it("turns left when the left key is held", () => {
    const flight = newFlight();
    updateFlight(flight, 1 / 60);
    const before = flight.heading.clone();
    const side = rightSide(flight);
    for (let i = 0; i < 90; i++) updateFlight(flight, 1 / 60, -1);
    expect(flight.heading.clone().sub(before).dot(side)).toBeLessThan(-0.05);
  });

  it("banks into the turn: the inside wing drops", () => {
    const flight = newFlight();
    for (let i = 0; i < 150; i++) updateFlight(flight, 1 / 60, 1);
    expect(flight.bankAngle).toBeGreaterThan(0.1);
    // A right-hand bank tips the craft's right side down toward the planet.
    expect(rightSide(flight).dot(radial(flight))).toBeLessThan(-0.05);
  });

  it("banks the other way for a left turn", () => {
    const flight = newFlight();
    for (let i = 0; i < 150; i++) updateFlight(flight, 1 / 60, -1);
    expect(flight.bankAngle).toBeLessThan(-0.1);
    expect(rightSide(flight).dot(radial(flight))).toBeGreaterThan(0.05);
  });

  it("eases into the turn instead of snapping", () => {
    const flight = newFlight();
    const before = flight.heading.clone();
    updateFlight(flight, 1 / 60, 1);
    const oneStep = Math.acos(Math.min(1, Math.max(-1, flight.heading.dot(before))));
    expect(oneStep).toBeLessThan(0.01);
    expect(flight.turnRate).toBeLessThan(0.05);
  });

  it("keeps the craft at the head of the route traced from it", () => {
    const flight = newFlight();
    for (let i = 0; i < 120; i++) updateFlight(flight, 1 / 60, i < 60 ? 1 : -1);
    const route = traceRoute(flight.dir, flight.heading, 256);
    expect(route.samples[0].position.clone().normalize().distanceTo(flight.dir)).toBeLessThan(1e-6);
    expect(route.samples[0].tangent.dot(flight.heading)).toBeGreaterThan(0.999);
  });

  it("is deterministic for the same inputs", () => {
    const a = newFlight();
    const b = newFlight();
    for (let i = 0; i < 300; i++) {
      updateFlight(a, 1 / 60, 1);
      updateFlight(b, 1 / 60, 1);
    }
    expect(a.craft.position.distanceTo(b.craft.position)).toBeLessThan(1e-9);
  });

  it("never meets the terrain and never leaves the sky", () => {
    const flight = newFlight();
    let minClearance = Infinity;
    let maxRide = -Infinity;
    for (let i = 0; i < 9000; i++) {
      const phase = i % 900;
      updateFlight(flight, 1 / 30, phase < 300 ? 1 : phase < 600 ? -1 : 0);
      const r = flight.craft.position.length();
      const sph = cartToSph(flight.craft.position);
      const ground = heightOffset(sph.theta, sph.phi);
      minClearance = Math.min(minClearance, r - (PLANET.radius + ground));
      maxRide = Math.max(maxRide, flight.ride);
    }
    // The clearance floor is a soft maximum of the ground ahead, smoothed, so
    // the craft keeps a real margin over the terrain it is actually above.
    expect(minClearance).toBeGreaterThan(2);
    expect(maxRide).toBeLessThanOrEqual(PLANET.maxHeight + FLIGHT.cruise + 1e-6);
  });

  it("rides the terrain calmly rather than jinking", () => {
    const flight = newFlight();
    let biggestStep = 0;
    let previous = flight.ride;
    for (let i = 0; i < 9000; i++) {
      updateFlight(flight, 1 / 30);
      biggestStep = Math.max(biggestStep, Math.abs(flight.ride - previous));
      previous = flight.ride;
    }
    // Even crossing the tallest ground, the ride never lurches in a frame.
    expect(biggestStep).toBeLessThan(0.1);
  });

  it("holds the terrain-following height when nothing is pressed", () => {
    const flight = newFlight();
    for (let i = 0; i < 300; i++) updateFlight(flight, 1 / 60);
    expect(flight.climb).toBe(0);
    const baseline = Math.max(flight.ground + FLIGHT.cruise, flight.ceiling + FLIGHT.minClearance);
    expect(flight.ride).toBeCloseTo(baseline, 9);
  });

  it("gains height gently while the up key is held", () => {
    const flight = newFlight();
    for (let i = 0; i < 120; i++) updateFlight(flight, 1 / 60);
    const before = flight.ride;
    let biggestClimbStep = 0;
    let previous = flight.climb;
    for (let i = 0; i < 300; i++) {
      updateFlight(flight, 1 / 60, 0, 1);
      biggestClimbStep = Math.max(biggestClimbStep, Math.abs(flight.climb - previous));
      previous = flight.climb;
    }
    expect(flight.ride).toBeGreaterThan(before + 1);
    // A gentle rise, never a jolt.
    expect(biggestClimbStep).toBeLessThan(0.02);
  });

  it("will not climb past three times the minimum clearance", () => {
    const flight = newFlight();
    for (let i = 0; i < 6000; i++) updateFlight(flight, 1 / 60, 0, 1);
    expect(flight.climb).toBeCloseTo(FLIGHT.minClearance * 3, 9);
    expect(flight.climb).toBeCloseTo(FLIGHT.maxClimb, 9);
  });

  it("gives the height back on the down key, but never below the baseline", () => {
    const flight = newFlight();
    for (let i = 0; i < 3000; i++) updateFlight(flight, 1 / 60, 0, 1);
    expect(flight.climb).toBeGreaterThan(1);
    for (let i = 0; i < 6000; i++) updateFlight(flight, 1 / 60, 0, -1);
    expect(flight.climb).toBe(0);
    const baseline = Math.max(flight.ground + FLIGHT.cruise, flight.ceiling + FLIGHT.minClearance);
    expect(flight.ride).toBeCloseTo(baseline, 9);
  });

  it("keeps the terrain-following figure as the floor while climbing", () => {
    const flight = newFlight();
    let minClearance = Infinity;
    for (let i = 0; i < 6000; i++) {
      updateFlight(flight, 1 / 30, 0, i % 1200 < 600 ? 1 : -1);
      const r = flight.craft.position.length();
      const sph = cartToSph(flight.craft.position);
      const ground = heightOffset(sph.theta, sph.phi);
      minClearance = Math.min(minClearance, r - (PLANET.radius + ground));
    }
    expect(minClearance).toBeGreaterThan(2);
  });

  it("eases the height in and out instead of stepping", () => {
    const flight = newFlight();
    for (let i = 0; i < 120; i++) updateFlight(flight, 1 / 60);
    updateFlight(flight, 1 / 60, 0, 1);
    expect(flight.climb).toBeLessThan(0.005);
    for (let i = 0; i < 240; i++) updateFlight(flight, 1 / 60, 0, 1);
    const held = flight.climb;
    // Letting go coasts to a stop rather than halting dead.
    for (let i = 0; i < 120; i++) updateFlight(flight, 1 / 60, 0, 0);
    expect(flight.climb).toBeGreaterThan(held);
    expect(Math.abs(flight.climbRate)).toBeLessThan(0.05);
  });

  it("lifts the nose into a climb and drops it into a descent", () => {
    const flight = newFlight();
    for (let i = 0; i < 120; i++) updateFlight(flight, 1 / 60);
    // Level, nose on the tangent, when the height is not being asked to change.
    expect(Math.abs(nose(flight).dot(radial(flight)))).toBeLessThan(1e-6);

    for (let i = 0; i < 300; i++) updateFlight(flight, 1 / 60, 0, 1);
    const climbing = Math.asin(nose(flight).dot(radial(flight)));
    expect(climbing).toBeGreaterThan(0.1);
    expect(climbing).toBeLessThan(0.25);

    for (let i = 0; i < 180; i++) updateFlight(flight, 1 / 60, 0, -1);
    expect(Math.asin(nose(flight).dot(radial(flight)))).toBeLessThan(-0.1);
  });

  it("levels the nose off once it has all the height it can take", () => {
    const flight = newFlight();
    for (let i = 0; i < 6000; i++) updateFlight(flight, 1 / 60, 0, 1);
    expect(flight.climb).toBeCloseTo(FLIGHT.maxClimb, 9);
    // The key is still held, but there is no height left to give, so it flies
    // level rather than holding a nose-up attitude for ever.
    expect(Math.abs(Math.asin(nose(flight).dot(radial(flight))))).toBeLessThan(0.01);
  });

  it("shows the broad searchlight only on the dark side of the planet", () => {
    const flight = newFlight();
    const sun = new Vector3(90, 55, 35).normalize();
    flight.speed = 0;

    flight.dir.copy(sun).negate().normalize();
    flight.heading.copy(new Vector3(0, 1, 0).cross(flight.dir)).normalize();
    updateFlight(flight, 5);
    expect(flight.searchLight.intensity.value).toBeGreaterThan(20);

    flight.dir.copy(sun).normalize();
    flight.heading.copy(new Vector3(0, 1, 0).cross(flight.dir)).normalize();
    updateFlight(flight, 5);
    expect(flight.searchLight.intensity.value).toBeLessThan(0.1);
  });

  it("is one biplane with a spinning propeller", () => {
    const flight = newFlight();
    expect(flight.craft.name).toBe("biplane");
    expect(flight.propeller.name).toBe("propeller");
    expect(flight.propeller.parent).toBe(flight.craft);
    expect(flight.speed).toBe(FLIGHT.speed);
    const parked = flight.propeller.position.clone();
    const before = flight.propeller.rotation.z;
    updateFlight(flight, 0.2);
    expect(flight.propeller.rotation.z).toBeGreaterThan(before);
    expect(flight.propeller.rotation.x).toBe(0);
    expect(flight.propeller.rotation.y).toBe(0);
    expect(flight.propeller.position.distanceTo(parked)).toBe(0);
  });

  it("adds a covered cockpit and paired animated wing-edge beacons", () => {
    const flight = newFlight();
    expect(flight.craft.getObjectByName("covered-cockpit")).toBeDefined();
    expect(flight.craft.getObjectByName("rounded-engine-cowling")).toBeDefined();
    expect(flight.propeller.getObjectByName("rounded-propeller-spinner")).toBeDefined();
    expect(flight.craft.getObjectByName("search-light-lens")).toBeDefined();
    expect(flight.searchLight.intensity.value).toBe(0);
    expect(flight.craft.getObjectByName("wing-edge-beacon")).toBeDefined();
    expect(flight.wingLights).toHaveLength(2);
    expect(flight.wingLights.every((light) => light.emissiveIntensity === 0)).toBe(true);
    updateFlight(flight, 0.05);
    expect(flight.searchLight.direction.length()).toBeCloseTo(1);
    expect(flight.wingLights.every((light) => light.emissiveIntensity > 0)).toBe(true);
  });

  it("keeps the wooden blades on the propeller shaft", () => {
    const flight = newFlight();
    const prop = flight.propeller;
    const inv = new Matrix4();
    const v = new Vector3();
    let maxAbsZ = 0;
    let maxR = 0;
    const bladeTipZ: number[] = [];

    prop.updateMatrixWorld(true);
    inv.copy(prop.matrixWorld).invert();
    prop.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const pos = mesh.geometry.getAttribute("position");
      let tipZ = 0;
      let tip = false;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inv);
        const r = Math.hypot(v.x, v.y);
        if (r > maxR) maxR = r;
        if (r > 0.12) {
          tip = true;
          const az = Math.abs(v.z - 0.02);
          if (az > tipZ) tipZ = az;
          if (az > maxAbsZ) maxAbsZ = az;
        }
      }
      if (tip) bladeTipZ.push(tipZ);
    });

    expect(bladeTipZ.length).toBe(2);
    expect(maxR).toBeGreaterThan(0.3);
    expect(maxAbsZ).toBeLessThan(0.04);
    expect(Math.max(...bladeTipZ) - Math.min(...bladeTipZ)).toBeLessThan(0.005);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    prop.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const pos = mesh.geometry.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix);
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
      }
    });
    expect(Math.abs(minX + maxX)).toBeLessThan(1e-4);
    expect(Math.abs(minY + maxY)).toBeLessThan(1e-4);
  });
});
