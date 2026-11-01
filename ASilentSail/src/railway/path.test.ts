import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { createPlanetMesh } from "../planet/mesh";
import { indexPlanetSurface } from "../planet/surface";
import { PLANET, TRACK } from "../config";
import { createRailwayPath, getSampleAt, scratchSample } from "./path";
import { cutRailwayShelf } from "./shelf";

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
    let maxStep = 0;
    let minClear = Infinity;
    for (let i = 0; i < path.samples.length; i++) {
      const sample = path.samples[i];
      const r = sample.position.length();
      expect(r).toBeGreaterThan(PLANET.radius - 8);
      expect(r).toBeLessThan(PLANET.radius + PLANET.maxHeight + 6);
      const next = path.samples[(i + 1) % path.samples.length];
      maxStep = Math.max(maxStep, Math.abs(sample.trackRadius - next.trackRadius));
      minClear = Math.min(minClear, sample.trackRadius - sample.groundRadius);
    }
    expect(maxStep).toBeLessThan(0.28);
    expect(minClear).toBeGreaterThan(-0.12);
    const bridgeSpans = path.samples.filter((s) => s.bridge && s.elevated).length;
    expect(bridgeSpans).toBeGreaterThan(8);
  });

  it("keeps both roads on the formation instead of the side slope", () => {
    const planet = createPlanetMesh();
    const raw = indexPlanetSurface(planet.geometry);
    const path = createRailwayPath(raw, 360);
    cutRailwayShelf(planet.geometry, path);
    const cut = indexPlanetSurface(planet.geometry);
    const n = path.samples.length;
    const at = new Vector3();
    let buried = 0;
    let checked = 0;
    let maxGap = 0;
    let maxBurial = 0;
    for (let i = 0; i < n; i++) {
      const s = path.samples[i];
      if (s.inTunnel || s.elevated) continue;
      for (const lateral of [-TRACK.trackSpacing * 0.5, TRACK.trackSpacing * 0.5]) {
        at.copy(s.position).addScaledVector(s.binormal, lateral);
        const len = at.length() || 1;
        const theta = Math.acos(Math.min(1, Math.max(-1, at.y / len)));
        const phi = Math.atan2(at.z, at.x);
        const ground = cut.radius(theta, phi);
        checked++;
        if (ground > 1) {
          maxGap = Math.max(maxGap, s.trackRadius - ground);
          maxBurial = Math.max(maxBurial, ground - s.trackRadius);
        }
        if (ground > 1 && ground > s.trackRadius + 0.45) buried++;
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(buried / checked).toBeLessThan(0.06);
    expect(maxGap).toBeLessThan(0.5);
    expect(maxBurial).toBeLessThan(0.12);

    // The shoulder beside the outer road stays down, so the second track
    // is not running up the slope.
    let walled = 0;
    let shoulder = 0;
    for (let i = 0; i < n; i++) {
      const s = path.samples[i];
      if (s.inTunnel || s.elevated) continue;
      for (const lateral of [-3.2, 3.2]) {
        at.copy(s.position).addScaledVector(s.binormal, lateral);
        const len = at.length() || 1;
        const theta = Math.acos(Math.min(1, Math.max(-1, at.y / len)));
        const phi = Math.atan2(at.z, at.x);
        const ground = cut.radius(theta, phi);
        shoulder++;
        if (ground > 1 && ground > s.trackRadius + 0.7) walled++;
      }
    }
    expect(shoulder).toBeGreaterThan(100);
    expect(walled / shoulder).toBeLessThan(0.08);
  });
});
