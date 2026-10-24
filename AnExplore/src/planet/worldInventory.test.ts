import { Group, Scene } from "three";
import { describe, expect, it } from "vitest";
import { createAutopilotPath } from "../flight/path";
import { createEnvironment, createPlanetaryRings } from "../scene/environment";
import { createPlanetMesh } from "../planet/mesh";
import { createBoats } from "../planet/boats";
import { createWater } from "../planet/water";
import { createFireflies, createScenery } from "../planet/scenery";

/**
 * The world's contents, counted from the built scene rather than read from
 * constants. Guards against anything being added, dropped or silently culled.
 */
describe("world inventory", () => {
  function build(): Group {
    const scene = new Scene();
    const root = new Group();
    root.add(createEnvironment(scene));
    root.add(createPlanetMesh());
    root.add(createScenery(createAutopilotPath(768, 7, 0)));
    root.add(createWater());
    root.add(createBoats());
    root.add(createFireflies());
    root.add(createPlanetaryRings());
    return root;
  }

  /** Instanced meshes grouped by material colour, which identifies the kind. */
  function byColour(root: Group): Map<string, number> {
    const counts = new Map<string, number>();
    root.traverse((node: any) => {
      if (!node.isInstancedMesh) return;
      const key = node.material?.color?.getHexString?.() ?? "?";
      counts.set(key, (counts.get(key) ?? 0) + node.count);
    });
    return counts;
  }

  it("plants the same stand of trees", () => {
    const c = byColour(build());
    // 781 conifers, 375 broadleaf, 167 birch.
    expect(c.get("234a36")).toBe(781);
    expect(c.get("8aa86e")).toBe(167);
    expect((c.get("2f5a38") ?? 0) + (c.get("3f6b3c") ?? 0) + (c.get("5a7040") ?? 0)).toBe(375);
    // One trunk per tree.
    expect((c.get("4a3428") ?? 0) + (c.get("cbb89a") ?? 0)).toBe(1323);
    // One darker underlayer per broadleaf crown.
    expect(c.get("2a4e36")).toBe(375);
  });

  it("keeps the ground cover and fencing", () => {
    const root = build();
    const c = byColour(root);
    expect(c.get("6b6358")).toBe(196); // rocks
    expect(c.get("4e6a3d")).toBe(265); // grass tufts

    const named = new Map<string, number>();
    root.traverse((node: any) => {
      if (node.isInstancedMesh && node.name) named.set(node.name, (named.get(node.name) ?? 0) + node.count);
    });
    expect(named.get("fence-posts")).toBe(125);
    expect(named.get("fence-rails")).toBe(238);
    expect(named.get("wheat-stalks")).toBe(1496);
    expect(named.get("wheat-heads")).toBe(1496);
  });

  it("has one of each landmark", () => {
    const names: string[] = [];
    build().traverse((node: any) => {
      if (node.name) names.push(node.name);
    });
    for (const expected of [
      "planet",
      "star-field",
      "visible-sun",
      "natural-moons",
      "scenery",
      "villages",
      "wheat-field",
      "grazing-sheep",
      "windmill",
      "landing-strip",
      "windsock",
      "airstrip-terminal",
      "airstrip-control-tower",
      "castle",
      "ancient-crown",
      "fireflies",
      "planetary-soil-rings",
    ]) {
      expect(names).toContain(expected);
    }
  });
});
