import { describe, expect, it } from "vitest";
import { angularDistance } from "../math/sphere";
import { SITES } from "./features";
import { MAIN_LAKE_ANGULAR, POOL_ANGULAR } from "./water";

describe("water features", () => {
  it("keeps the small pool separate from the main lake", () => {
    const centerDistance = angularDistance(
      SITES.lake.theta,
      SITES.lake.phi,
      SITES.pool.theta,
      SITES.pool.phi,
    );

    expect(centerDistance).toBeGreaterThan(MAIN_LAKE_ANGULAR + POOL_ANGULAR + 0.05);
  });
});
