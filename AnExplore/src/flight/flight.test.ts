import { Matrix4, Mesh, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { FLIGHT } from "../config";
import { createFlightPath, getSampleAt } from "./path";
import { createFlight, updateFlight } from "./biplane";

const path = createFlightPath(512);

describe("flight", () => {
  it("cruises above the terrain the whole way around", () => {
    for (const sample of path.samples) {
      expect(sample.elevation).toBeGreaterThanOrEqual(FLIGHT.minClearance - 0.05);
      expect(sample.inTunnel).toBe(false);
    }
    expect(path.samples[0].position.distanceTo(path.samples[path.samples.length - 1].position)).toBeLessThan(1e-4);
  });

  it("provides three distinct randomized route designs with safe terrain clearance", () => {
    const alternatives = [0, 1, 2].map((variant) => createFlightPath(512, 1, variant));
    for (const alternative of alternatives) {
      expect(alternative.samples[0].position.distanceTo(alternative.samples.at(-1)!.position)).toBeLessThan(
        1e-4,
      );
      for (const sample of alternative.samples) {
        expect(sample.elevation).toBeGreaterThanOrEqual(FLIGHT.minClearance - 0.05);
      }
    }
    for (let i = 0; i < alternatives.length; i++) {
      for (let j = i + 1; j < alternatives.length; j++) {
        const a = alternatives[i].samples;
        const b = alternatives[j].samples;
        const meanSeparation =
          a.slice(0, -1).reduce((sum, sample, index) => sum + sample.position.distanceTo(b[index].position), 0) /
          (a.length - 1);
        expect(meanSeparation).toBeGreaterThan(10);
      }
    }
  });

  it("advances by speed × elapsed time and wraps the circuit", () => {
    const flight = createFlight();
    flight.distance = path.totalLength - 1;
    flight.speed = 4;
    updateFlight(flight, path, 0.5);
    expect(flight.distance).toBeCloseTo(1, 5);
  });

  it("matches two half-steps to one full step", () => {
    const a = createFlight();
    const b = createFlight();
    a.distance = b.distance = 20;
    a.speed = b.speed = 3.5;
    updateFlight(a, path, 0.4);
    updateFlight(b, path, 0.1);
    updateFlight(b, path, 0.3);
    expect(a.distance).toBeCloseTo(b.distance, 5);
    expect(a.craft.position.distanceTo(b.craft.position)).toBeLessThan(1e-4);
  });

  it("flies upright, nose along the route", () => {
    const flight = createFlight();
    updateFlight(flight, path, 0.05);
    const sample = getSampleAt(path, flight.distance);
    const up = new Vector3(0, 1, 0).applyQuaternion(flight.craft.quaternion);
    const nose = new Vector3(0, 0, 1).applyQuaternion(flight.craft.quaternion);
    const span = new Vector3(1, 0, 0).applyQuaternion(flight.craft.quaternion);
    expect(up.dot(sample.normal)).toBeGreaterThan(0.98);
    expect(nose.dot(sample.tangent)).toBeGreaterThan(0.98);
    expect(Math.abs(span.dot(sample.normal))).toBeLessThan(0.05);
  });

  it("eases into a new heading instead of snapping", () => {
    const flight = createFlight();
    updateFlight(flight, path, 0.05);
    flight.distance = (flight.distance + 55) % path.totalLength;
    const noseBefore = new Vector3(0, 0, 1).applyQuaternion(flight.craft.quaternion);
    updateFlight(flight, path, 0.05);
    const noseAfter = new Vector3(0, 0, 1).applyQuaternion(flight.craft.quaternion);
    expect(noseBefore.dot(noseAfter)).toBeGreaterThan(0.97);
  });

  it("is one biplane with a spinning propeller", () => {
    const flight = createFlight();
    expect(flight.craft.name).toBe("biplane");
    expect(flight.propeller.name).toBe("propeller");
    expect(flight.propeller.parent).toBe(flight.craft);
    expect(flight.speed).toBe(FLIGHT.speed);
    const parked = flight.propeller.position.clone();
    const before = flight.propeller.rotation.z;
    updateFlight(flight, path, 0.2);
    expect(flight.propeller.rotation.z).toBeGreaterThan(before);
    expect(flight.propeller.rotation.x).toBe(0);
    expect(flight.propeller.rotation.y).toBe(0);
    expect(flight.propeller.position.distanceTo(parked)).toBe(0);
  });

  it("shows the broad searchlight only on the dark side of the planet", () => {
    const flight = createFlight();
    flight.speed = 0;
    const sun = new Vector3(90, 55, 35).normalize();
    const nightSample = path.samples.find((sample) => sample.position.clone().normalize().dot(sun) < -0.3);
    const daySample = path.samples.find((sample) => sample.position.clone().normalize().dot(sun) > 0.3);
    expect(nightSample).toBeDefined();
    expect(daySample).toBeDefined();

    flight.distance = nightSample!.s;
    updateFlight(flight, path, 5);
    expect(flight.searchLight.intensity.value).toBeGreaterThan(20);

    flight.distance = daySample!.s;
    updateFlight(flight, path, 5);
    expect(flight.searchLight.intensity.value).toBeLessThan(0.1);
  });

  it("adds a covered cockpit and paired animated wing-edge beacons", () => {
    const flight = createFlight();
    expect(flight.craft.getObjectByName("covered-cockpit")).toBeDefined();
    expect(flight.craft.getObjectByName("rounded-engine-cowling")).toBeDefined();
    expect(flight.propeller.getObjectByName("rounded-propeller-spinner")).toBeDefined();
    expect(flight.craft.getObjectByName("search-light-lens")).toBeDefined();
    expect(flight.searchLight.intensity.value).toBe(0);
    expect(flight.craft.getObjectByName("wing-edge-beacon")).toBeDefined();
    expect(flight.wingLights).toHaveLength(2);
    expect(flight.wingLights.every((light) => light.emissiveIntensity === 0)).toBe(true);
    updateFlight(flight, path, 0.05);
    expect(flight.searchLight.direction.length()).toBeCloseTo(1);
    expect(flight.wingLights.every((light) => light.emissiveIntensity > 0)).toBe(true);
  });

  it("keeps the wooden blades on the propeller shaft", () => {
    const flight = createFlight();
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
