import { describe, expect, it } from "vitest";
import { createFlightPath } from "../flight/path";
import { planTreeSites } from "./scenery";
import { CROWDING, countCrowdedPairs, thinCrowdedTrees, treeFootprint } from "./treeSpacing";

describe("tree spacing", () => {
  it("sizes a footprint from the geometry each kind is planted with", () => {
    // Broadleaf crowns are widest, pines narrowest, birches between.
    expect(treeFootprint(0, 1)).toBeGreaterThan(treeFootprint(2, 1));
    expect(treeFootprint(2, 1)).toBeGreaterThan(treeFootprint(1, 1));
    expect(treeFootprint(0, 2)).toBeCloseTo(treeFootprint(0, 1) * 2, 12);
  });

  it("drops the tree that is almost on top of another, keeping the first", () => {
    const sites = [
      { theta: 1, phi: 1, kind: 0, scale: 1.5 },
      { theta: 1.001, phi: 1, kind: 0, scale: 1.5 },
    ];
    const kept = thinCrowdedTrees(sites);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toBe(sites[0]);
  });

  it("leaves a well-spaced wood completely alone", () => {
    const sites = [
      { theta: 1, phi: 1, kind: 0, scale: 1.0 },
      { theta: 1.4, phi: 1, kind: 0, scale: 1.0 },
      { theta: 2.2, phi: 3.1, kind: 1, scale: 1.0 },
      { theta: 0.7, phi: 5.4, kind: 2, scale: 1.0 },
    ];
    const kept = thinCrowdedTrees(sites);
    expect(kept).toHaveLength(4);
    // Identical objects, not copies: nothing was rewritten.
    for (let i = 0; i < sites.length; i++) expect(kept[i]).toBe(sites[i]);
  });

  it("keeps every survivor exactly where it was planned", () => {
    const sites = planTreeSites(createFlightPath(256));
    const before = new Map(sites.map((site) => [site, { theta: site.theta, phi: site.phi }]));

    const kept = thinCrowdedTrees(sites);

    for (const site of kept) {
      const was = before.get(site)!;
      expect(site.theta).toBe(was.theta);
      expect(site.phi).toBe(was.phi);
    }
  });

  it("clears every crowded pair out of the real planting", () => {
    const sites = planTreeSites(createFlightPath(256));
    const crowdedBefore = countCrowdedPairs(sites);
    const kept = thinCrowdedTrees(sites);
    const crowdedAfter = countCrowdedPairs(kept);

    console.log(
      `planned=${sites.length}  kept=${kept.length} (${((kept.length / sites.length) * 100).toFixed(1)}%)  ` +
        `crowded pairs ${crowdedBefore} -> ${crowdedAfter}`,
    );

    expect(crowdedBefore).toBeGreaterThan(0);
    expect(crowdedAfter).toBe(0);
    // Thinning should trim the clumps, not clear the woods.
    expect(kept.length).toBeGreaterThan(sites.length * 0.6);
  }, 120_000);

  it("trims more as the crowding threshold rises", () => {
    const sites = planTreeSites(createFlightPath(256));
    const thresholds = [0.2, 0.25, CROWDING, 0.35, 0.4];
    const kept = thresholds.map((crowding) => thinCrowdedTrees(sites, crowding).length);
    console.log(
      `trees kept: ${thresholds.map((c, i) => `${c}->${kept[i]}`).join("  ")}`,
    );
    for (let i = 1; i < kept.length; i++) expect(kept[i]).toBeLessThanOrEqual(kept[i - 1]);
    expect(kept[0]).toBeGreaterThan(kept[kept.length - 1]);
  }, 120_000);
});
