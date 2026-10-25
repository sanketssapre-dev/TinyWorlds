import { Box3, Color, InstancedMesh } from "three";
import { describe, expect, it } from "vitest";
import { createAutopilotPath } from "../flight/path";
import { createTrees } from "./scenery";

/** Every per-instance tint across every tinted tree mesh. */
function tints(): number[] {
  const out: number[] = [];
  createTrees(createAutopilotPath(256, 7, 0)).traverse((node) => {
    const mesh = node as InstancedMesh;
    if (!mesh.instanceColor) return;
    const tint = new Color();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getColorAt(i, tint);
      out.push(tint.r, tint.g, tint.b);
    }
  });
  return out;
}

describe("tree tinting", () => {
  it("varies each tree slightly, without moving the shared palette", () => {
    const values = tints();
    expect(values.length).toBeGreaterThan(1000);

    // The average tint has to sit on 1, or the whole wood would drift lighter
    // or darker than it was designed to be.
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeCloseTo(1, 2);

    // And there has to be real spread, or the grove still reads as one stamped
    // tree repeated.
    const spread = values.map((v) => Math.abs(v - 1));
    expect(Math.max(...spread)).toBeGreaterThan(0.05);
  });

  it("gives the same tree the same tint", () => {
    const first = tints();
    const second = tints();
    expect(first.length).toBe(second.length);
    expect(first).toEqual(second);
  });
});

describe("tree geometry", () => {
  /** The distinct geometries the trees are built from. */
  function geometries(): Box3[] {
    const seen = new Set<string>();
    const boxes: Box3[] = [];
    createTrees(createAutopilotPath(256, 7, 0)).traverse((node) => {
      const mesh = node as InstancedMesh;
      if (!mesh.isInstancedMesh || seen.has(mesh.geometry.uuid)) return;
      seen.add(mesh.geometry.uuid);
      mesh.geometry.computeBoundingBox();
      boxes.push(mesh.geometry.boundingBox!.clone());
    });
    return boxes;
  }

  it("keeps the envelope the planting was designed against", () => {
    // broadleaf trunk, conifer trunk, birch trunk, broadleaf crown, conifer, snow cap
    const boxes = geometries();
    expect(boxes.length).toBe(6);

    // Nothing may reach past the envelope the old primitives occupied, or the
    // planting, the ride heights and the clearance would no longer line up.
    for (const box of boxes) {
      expect(box.max.x).toBeLessThanOrEqual(0.5);
      expect(box.min.y).toBeGreaterThanOrEqual(-0.6);
      expect(box.max.y).toBeLessThanOrEqual(1.0);
    }
  });

  it("branches the broadleaf trunks and leaves the pine trunk bare", () => {
    // Trunks are the geometries that sit on the ground and reach up past the
    // crown's base; crowns and conifers are centred instead.
    const trunks = geometries().filter((box) => box.min.y >= -1e-6 && box.max.y > 0.5);
    expect(trunks.length).toBe(3); // broadleaf, birch, conifer

    const branched = trunks.filter((box) => box.max.x - box.min.x > 0.35);
    const smooth = trunks.filter((box) => box.max.x - box.min.x <= 0.35);

    // Broadleaf and birch carry a flare and branches.
    expect(branched.length).toBe(2);
    // A pine carries its branches in its tiers, so its trunk stays a clean
    // taper — anything sprouting from it reads as a mislabelled broadleaf.
    expect(smooth.length).toBe(1);
    expect(smooth[0].max.x).toBeLessThan(0.15);
  });

  it("still plants the same number of trees", () => {
    // A merged tree must still cost exactly one instance, or the draw count
    // and the planting would drift.
    const trees = createTrees(createAutopilotPath(256, 7, 0));
    let tinted = 0;
    let total = 0;
    trees.traverse((node) => {
      const mesh = node as InstancedMesh;
      if (!mesh.isInstancedMesh) return;
      total += mesh.count;
      if (mesh.instanceColor) tinted += mesh.count;
    });

    expect(tinted).toBe(2929);
    expect(total).toBeGreaterThanOrEqual(tinted);
  });
});
