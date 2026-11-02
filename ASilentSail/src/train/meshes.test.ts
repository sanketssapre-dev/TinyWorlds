import { PointLight } from "three";
import { describe, expect, it } from "vitest";
import { TRACK } from "../config";
import { createTrainMeshes } from "./meshes";

describe("locomotive headlight", () => {
  it("sits above the smokebox base at the front of the locomotive", () => {
    const { loco, wheels } = createTrainMeshes();
    let headlight: PointLight | undefined;
    loco.traverse((object) => {
      if (object instanceof PointLight) headlight = object;
    });

    expect(headlight).toBeDefined();
    if (!headlight) throw new Error("Locomotive headlight was not created");
    expect(headlight.position.y).toBeGreaterThan(1.1);
    expect(headlight.position.z).toBeGreaterThan(1.4);
    for (const wheel of wheels) {
      expect(Math.abs(wheel.position.x)).toBeCloseTo(TRACK.gauge * 0.5);
    }
  });
});
