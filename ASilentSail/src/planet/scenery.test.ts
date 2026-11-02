import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { PLANET } from "../config";
import type { PathSample, RailwayPath } from "../railway/path";
import { MOUNTAIN_SUMMIT_CENTERS } from "./height";
import {
  createTrackProximity,
  MAX_ALPINE_TREES,
  nearMountainSummit,
  TREE_TRACK_CLEARANCE,
} from "./scenery";

function routeAt(theta: number, phi: number): RailwayPath {
  const sample: PathSample = {
    position: new Vector3(
      PLANET.radius * Math.sin(theta) * Math.cos(phi),
      PLANET.radius * Math.cos(theta),
      PLANET.radius * Math.sin(theta) * Math.sin(phi),
    ),
    tangent: new Vector3(1, 0, 0),
    normal: new Vector3(0, 1, 0),
    binormal: new Vector3(0, 0, 1),
    s: 0,
    trackRadius: PLANET.radius,
    groundRadius: PLANET.radius,
    elevation: 0,
    bridge: false,
    elevated: false,
  };
  return { samples: [sample], totalLength: 0 };
}

describe("alpine tree placement", () => {
  it("raises the planting budget to three times the previous limit", () => {
    expect(MAX_ALPINE_TREES).toBe(3 * 7_000);
  });

  it("leaves a buffer around the route", () => {
    const isNearTrack = createTrackProximity(routeAt(1, 1));

    expect(isNearTrack(1, 1, TREE_TRACK_CLEARANCE)).toBe(true);
    expect(isNearTrack(1, 1.2, TREE_TRACK_CLEARANCE)).toBe(false);
  });

  it("keeps all modeled summit centers clear of trees", () => {
    expect(MOUNTAIN_SUMMIT_CENTERS.length).toBeGreaterThan(20);
    for (const center of MOUNTAIN_SUMMIT_CENTERS) {
      expect(nearMountainSummit(center.theta, center.phi)).toBe(true);
    }
  });
});
