import { Mesh, ShaderMaterial } from "three";
import { describe, expect, it } from "vitest";
import { LAKES } from "./features";
import { createWater } from "./water";

describe("lake water", () => {
  it("uses greater opacity at deeper points across every lake", () => {
    const water = createWater();
    const lakes = water.children.filter(
      (child): child is Mesh => child instanceof Mesh && child.name.startsWith("lake-"),
    );

    expect(lakes).toHaveLength(LAKES.length);
    for (const lake of lakes) {
      const depth = lake.geometry.getAttribute("aDepth");
      expect(depth).toBeDefined();
      expect(lake.material).toBeInstanceOf(ShaderMaterial);
      if (!(lake.material instanceof ShaderMaterial)) continue;
      expect(lake.material.fragmentShader).toContain("mix(0.14, 0.78, depth)");

      let shallowest = Infinity;
      let deepest = -Infinity;
      for (let i = 0; i < depth.count; i++) {
        shallowest = Math.min(shallowest, depth.getX(i));
        deepest = Math.max(deepest, depth.getX(i));
      }
      expect(deepest).toBeGreaterThan(shallowest);
      expect(shallowest).toBeGreaterThanOrEqual(0);
      expect(deepest).toBeLessThanOrEqual(1);
    }
  });
});
