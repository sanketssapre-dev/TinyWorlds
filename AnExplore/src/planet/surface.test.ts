import { describe, expect, it } from "vitest";
import { SITES } from "../planet/features";
import { surfaceRadius } from "../planet/height";
import { createPlanetMesh } from "../planet/mesh";
import { indexPlanetSurface } from "../planet/surface";

describe("surface seating", () => {
  it("keeps landmarks on the visible ground", () => {
    const mesh = createPlanetMesh();
    const surface = indexPlanetSurface(mesh.geometry);
    for (const id of ["castle", "tower", "village", "ancientTree", "shrine", "arch"] as const) {
      const site = SITES[id];
      const analytic = surfaceRadius(site.theta, site.phi);
      const meshR = surface.radius(site.theta, site.phi);
      expect(meshR, id).toBeGreaterThan(40);
      expect(Math.abs(analytic - meshR), id).toBeLessThan(0.2);
    }
  }, 60000);
});
