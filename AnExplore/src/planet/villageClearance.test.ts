import { Box3, Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createAutopilotPath } from "../flight/path";
import { createPlanetMesh } from "./mesh";
import { indexPlanetSurface } from "./surface";
import { createScenery, seatOnGround } from "./scenery";

/**
 * Bonfires sit inside the village, so they have to clear the cottages. This
 * measures the built scene rather than the placement formula: the cottage roofs
 * (baked into one InstancedMesh) against the bonfire footprint (measured from
 * the group's own meshes).
 */
describe("village bonfires", () => {
  function cottageRoofs(root: any): { p: Vector3; reach: number }[] {
    let roofs: any = null;
    root.traverse((n: any) => {
      if (!roofs && n.isInstancedMesh && n.name === "cottage-roofs") roofs = n;
    });
    expect(roofs).not.toBeNull();

    const m = new Matrix4();
    const out: { p: Vector3; reach: number }[] = [];
    for (let i = 0; i < roofs.count; i++) {
      roofs.getMatrixAt(i, m);
      const e = m.elements;
      const hw = Math.hypot(e[0], e[1], e[2]) / 2;
      const hd = Math.hypot(e[8], e[9], e[10]) / 2;
      out.push({ p: new Vector3(e[12], e[13], e[14]), reach: Math.hypot(hw, hd) });
    }
    return out;
  }

  function bonfires(root: any): { p: Vector3; r: number }[] {
    const out: { p: Vector3; r: number }[] = [];
    root.traverse((n: any) => {
      if (n.name !== "village-bonfire") return;
      n.updateMatrixWorld(true);
      const box = new Box3();
      n.traverse((c: any) => {
        if (!c.isMesh) return;
        c.geometry.computeBoundingBox();
        box.union(c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld));
      });
      const size = box.getSize(new Vector3());
      out.push({ p: box.getCenter(new Vector3()), r: Math.hypot(size.x, size.z) / 2 });
    });
    return out;
  }

  it("keeps every fire clear of every cottage", () => {
    const planet = createPlanetMesh();
    const surface = indexPlanetSurface(planet.geometry);
    const root = createScenery(createAutopilotPath(768, 7, 0));
    seatOnGround(root, surface);

    const cottages = cottageRoofs(root);
    const fires = bonfires(root);
    expect(fires.length).toBeGreaterThan(0);

    let worst = Infinity;
    for (const fire of fires) {
      for (const cottage of cottages) {
        const clearance = fire.p.distanceTo(cottage.p) - (cottage.reach + fire.r);
        if (clearance < worst) worst = clearance;
      }
    }
    // The cottages' reach is a circumscribed circle, so this is conservative.
    expect(worst).toBeGreaterThan(0.15);
  });
});
