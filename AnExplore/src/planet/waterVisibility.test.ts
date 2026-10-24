import { describe, expect, it } from "vitest";
import { PLANET } from "../config";
import { SITES } from "./features";
import { heightOffset } from "./height";
import { MAIN_LAKE_ANGULAR, POOL_ANGULAR } from "./water";

/**
 * Every body of water must actually show water.
 *
 * The level is derived from the lowest point on the cap's rim, and the terrain
 * is floored by PLANET.minHeight. In a basin that has already been clamped flat,
 * that rule puts the surface *below* the ground and the water is never seen —
 * which is what happened to the pond. A cap alone proves nothing.
 */
function levelFor(theta: number, phi: number, angular: number, minAboveCenter = 0): number {
  const center = heightOffset(theta, phi);
  let shore = Infinity;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    shore = Math.min(
      shore,
      heightOffset(theta + Math.cos(a) * angular, phi + (Math.sin(a) * angular) / Math.max(0.3, Math.sin(theta))),
    );
  }
  const filled = center + Math.max(0.12, (shore - center) * 0.58);
  let level = Math.min(shore - 0.06, filled, 0.4);
  if (minAboveCenter > 0) level = Math.max(level, Math.min(center + minAboveCenter, 0.35));
  return level;
}

/** Radius out to which the terrain is under water in at least half the directions. */
function visibleRadius(theta: number, phi: number, level: number, max = 0.4): number {
  let r = 0;
  for (let i = 1; i <= 200; i++) {
    const d = (i / 200) * max;
    let under = 0;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      if (heightOffset(theta + Math.cos(a) * d, phi + (Math.sin(a) * d) / Math.max(0.3, Math.sin(theta))) < level) under++;
    }
    if (under >= 8) r = d;
  }
  return r;
}

const BODIES = [
  { name: "main lake", site: SITES.lake, angular: MAIN_LAKE_ANGULAR, minAbove: 0.16, minWidth: 15 },
  { name: "second lake", site: SITES.lake2, angular: 0.125, minAbove: 0, minWidth: 6 },
  { name: "pond", site: SITES.pool, angular: POOL_ANGULAR, minAbove: 0.4, minWidth: 10 },
] as const;

describe("water visibility", () => {
  for (const body of BODIES) {
    it(`shows the ${body.name}`, () => {
      const level = levelFor(body.site.theta, body.site.phi, body.angular, body.minAbove);
      const centre = heightOffset(body.site.theta, body.site.phi);

      // The surface must be above the ground it sits in, or it is buried.
      expect(level - centre).toBeGreaterThan(0.1);

      const width = Math.min(visibleRadius(body.site.theta, body.site.phi, level), body.angular) * 2 * PLANET.radius;
      expect(width).toBeGreaterThan(body.minWidth);
    });
  }

  it("keeps the pond smaller than the main lake", () => {
    const width = (b: (typeof BODIES)[number]) => {
      const level = levelFor(b.site.theta, b.site.phi, b.angular, b.minAbove);
      return Math.min(visibleRadius(b.site.theta, b.site.phi, level), b.angular) * 2 * PLANET.radius;
    };
    // The pond is the small one; it must stay clearly under the main lake or
    // the hierarchy of the world stops reading.
    expect(width(BODIES[2])).toBeLessThan(width(BODIES[0]) * 0.75);
  });
});
