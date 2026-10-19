import { describe, expect, it } from "vitest";
import { angularDistance, cartToSph, wrapPhi } from "../flight/math/sphere";
import { PLANET, WATER_LEVEL } from "../config";
import { heightOffset } from "../planet/height";
import { createSailPath, FLEET_ROUTES, isCruiseBlocked } from "./path";

describe("sail routes", () => {
  it("stay in open water and skip narrow straits", () => {
    for (const route of FLEET_ROUTES) {
      const path = createSailPath(768, route);
      let blocked = 0;
      let grounded = 0;
      for (let i = 0; i < path.samples.length - 1; i++) {
        const sph = cartToSph(path.samples[i].position);
        if (heightOffset(sph.theta, sph.phi) > WATER_LEVEL - 0.35) grounded++;
        if (route.kind === "basin") continue;
        if (isCruiseBlocked(sph.theta, sph.phi)) blocked++;
        const nxt = cartToSph(path.samples[i + 1].position);
        const midTheta = (sph.theta + nxt.theta) * 0.5;
        let dPhi = wrapPhi(nxt.phi) - wrapPhi(sph.phi);
        if (dPhi > Math.PI) dPhi -= Math.PI * 2;
        if (dPhi < -Math.PI) dPhi += Math.PI * 2;
        const midPhi = wrapPhi(wrapPhi(sph.phi) + dPhi * 0.5);
        if (isCruiseBlocked(midTheta, midPhi)) blocked++;
      }
      expect(blocked, `seed ${route.seed} ${route.kind} threaded a closed strait`).toBe(0);
      expect(grounded, `seed ${route.seed} ${route.kind} climbed land`).toBe(0);
      let reach = 0;
      const step = 10;
      for (let i = 0; i < path.samples.length; i += step) {
        const a = cartToSph(path.samples[i].position);
        for (let j = i + step; j < path.samples.length; j += step) {
          const b = cartToSph(path.samples[j].position);
          reach = Math.max(reach, angularDistance(a.theta, a.phi, b.theta, b.phi));
        }
      }
      const span = reach * PLANET.radius;
      expect(span, `seed ${route.seed} reach`).toBeGreaterThanOrEqual(PLANET.diameter * 0.4);
      expect(span, `seed ${route.seed} reach`).toBeLessThanOrEqual(PLANET.diameter * 1.2);
      let sharp = 0;
      for (let i = 1; i < path.samples.length - 1; i++) {
        const prev = path.samples[i - 1].position;
        const curr = path.samples[i].position;
        const next = path.samples[i + 1].position;
        const ab = next.clone().sub(curr);
        const leg = curr.clone().sub(prev);
        const ds = leg.length();
        if (ds > 0.05 && ab.length() > 0.05 && leg.angleTo(ab) / ds > 0.14) sharp++;
      }
      expect(sharp, `seed ${route.seed} kinked`).toBe(0);
    }
  });
});
