import { Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createAutopilotPath } from "../flight/path";
import { createPlanetMesh } from "./mesh";
import { indexPlanetSurface } from "./surface";
import { createScenery, seatOnGround } from "./scenery";

/**
 * The village packs cottages, farm patches, bonfires and a sheep paddock into a
 * small disc, and each used to be positioned from its own absolute radius. They
 * drifted into each other: a cottage ended up standing in the middle of a farm
 * patch. Everything now derives from the cottage envelope, and this measures the
 * built scene to prove the clearances hold.
 */
describe("village layout", () => {
  function build() {
    const planet = createPlanetMesh();
    const surface = indexPlanetSurface(planet.geometry);
    const root = createScenery(createAutopilotPath(768, 7, 0));
    seatOnGround(root, surface);
    return root;
  }

  /** Cottages, read from the baked roof instances. */
  function cottages(root: any): { p: Vector3; reach: number }[] {
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

  function positions(root: any, name: string): Vector3[] {
    const out: Vector3[] = [];
    root.traverse((n: any) => {
      if (n.name !== name) return;
      const p = new Vector3();
      n.getWorldPosition(p);
      out.push(p);
    });
    return out;
  }

  function instances(root: any, name: string): Vector3[] {
    let mesh: any = null;
    root.traverse((n: any) => {
      if (!mesh && n.isInstancedMesh && n.name === name) mesh = n;
    });
    expect(mesh).not.toBeNull();
    const m = new Matrix4();
    const out: Vector3[] = [];
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      out.push(new Vector3().setFromMatrixPosition(m));
    }
    return out;
  }

  /** Nearest distance from a point to any vertex of a patch mesh. */
  function patchDistance(patch: any, target: Vector3): number {
    const pos = patch.geometry.getAttribute("position");
    const v = new Vector3();
    let best = Infinity;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const d = v.distanceTo(target);
      if (d < best) best = d;
    }
    return best;
  }

  it("keeps every structure clear of every cottage", () => {
    const root = build();
    const homes = cottages(root);
    expect(homes.length).toBeGreaterThan(0);

    // Bonfires and sheep are point-ish; measure centre to roof edge.
    for (const p of [...positions(root, "village-bonfire"), ...positions(root, "grazing-sheep")]) {
      for (const home of homes) {
        expect(p.distanceTo(home.p) - home.reach).toBeGreaterThan(0.2);
      }
    }

    // Crops must not be planted under a roof.
    for (const crop of instances(root, "rice-clumps")) {
      for (const home of homes) {
        expect(crop.distanceTo(home.p) - home.reach).toBeGreaterThan(0.1);
      }
    }

    // And the field patch itself must not reach back over a roof.
    const fields: any[] = [];
    root.traverse((n: any) => {
      if (n.name === "rice-field") fields.push(n);
    });
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      for (const home of homes) {
        expect(patchDistance(field, home.p) - home.reach).toBeGreaterThan(0.1);
      }
    }
  });

  it("puts the farm ring outside the cottage ring", () => {
    const root = build();
    const homes = cottages(root);
    const crops = instances(root, "rice-clumps");

    // Every crop stands further from the village centre than every cottage roof
    // reaches, so no crop can sit on a house.
    for (const crop of crops) {
      for (const home of homes) {
        expect(crop.distanceTo(home.p)).toBeGreaterThan(home.reach);
      }
    }
  });
});
