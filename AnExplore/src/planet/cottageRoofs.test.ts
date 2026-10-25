import { Box3, Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createAutopilotPath } from "../flight/path";
import { createPlanetMesh } from "./mesh";
import { indexPlanetSurface } from "./surface";
import { createScenery, seatOnGround } from "./scenery";

/**
 * The cottages are the one place where a hand-built geometry meets an instanced
 * bake, and both halves have failed silently: the roof triangles were once
 * degenerate (zero area, so nothing rendered) and the bake swapped the roof for
 * a unit cone. These tests measure the built scene rather than the source.
 */
describe("cottage roofs", () => {
  function buildRoofs() {
    const planet = createPlanetMesh();
    const surface = indexPlanetSurface(planet.geometry);
    const root = createScenery(createAutopilotPath(768, 7, 0));
    seatOnGround(root, surface);

    let roofs: any = null;
    root.traverse((n: any) => {
      if (!roofs && n.isInstancedMesh && /cottage-roof/.test(n.name ?? "")) roofs = n;
    });
    return roofs;
  }

  /** The roof's four eave corners in world space; the local footprint is unit. */
  function roofQuad(inst: any, i: number): Vector3[] {
    const m = new Matrix4();
    inst.getMatrixAt(i, m);
    const local = [
      [-0.5, 0, -0.5],
      [0.5, 0, -0.5],
      [0.5, 0, 0.5],
      [-0.5, 0, 0.5],
    ];
    return local.map(([x, y, z]) => new Vector3(x, y, z).applyMatrix4(m));
  }

  function quadArea(quad: Vector3[]): number {
    let total = 0;
    for (let i = 1; i < quad.length - 1; i++) {
      const a = quad[0];
      const b = quad[i];
      const c = quad[i + 1];
      const ab = b.clone().sub(a);
      const ac = c.clone().sub(a);
      total += ab.cross(ac).length() / 2;
    }
    return total;
  }

  /** Separating-axis test for two convex quads projected onto a plane. */
  function quadsOverlap(a: number[][], b: number[][]): boolean {
    const axes: number[][] = [];
    for (const quad of [a, b]) {
      for (let i = 0; i < quad.length; i++) {
        const p = quad[i];
        const q = quad[(i + 1) % quad.length];
        const ex = q[0] - p[0];
        const ey = q[1] - p[1];
        const len = Math.hypot(ex, ey) || 1;
        axes.push([-ey / len, ex / len]);
      }
    }
    for (const [ax, ay] of axes) {
      let minA = Infinity;
      let maxA = -Infinity;
      let minB = Infinity;
      let maxB = -Infinity;
      for (const [x, y] of a) {
        const t = x * ax + y * ay;
        if (t < minA) minA = t;
        if (t > maxA) maxA = t;
      }
      for (const [x, y] of b) {
        const t = x * ax + y * ay;
        if (t < minB) minB = t;
        if (t > maxB) maxB = t;
      }
      if (maxA < minB - 1e-6 || maxB < minA - 1e-6) return false;
    }
    return true;
  }

  it("builds a roof with real surface area, not a degenerate one", () => {
    const roofs = buildRoofs();
    expect(roofs).not.toBeNull();

    const pos = roofs.geometry.getAttribute("position");
    const idx = roofs.geometry.getIndex();
    expect(pos.count).toBeGreaterThan(4);
    expect(idx).not.toBeNull();
    expect(idx.count / 3).toBeGreaterThanOrEqual(4);

    // A degenerate index list repeats a vertex inside a triangle, which is what
    // made the roof invisible: the area summed to exactly zero.
    const box = new Box3().setFromBufferAttribute(pos);
    const size = box.getSize(new Vector3());
    expect(size.x).toBeGreaterThan(0.9);
    expect(size.y).toBeGreaterThan(0.9);
    expect(size.z).toBeGreaterThan(0.9);

    const quad = roofQuad(roofs, 0);
    expect(quadArea(quad)).toBeGreaterThan(0.5);
  });

  it("keeps every roof clear of its neighbours", () => {
    const roofs = buildRoofs();
    const quads: Vector3[][] = [];
    for (let i = 0; i < roofs.count; i++) quads.push(roofQuad(roofs, i));

    for (let i = 0; i < quads.length; i++) {
      for (let j = i + 1; j < quads.length; j++) {
        const origin = quads[i][0].clone().add(quads[j][0]).multiplyScalar(0.5);
        const normal = origin.clone().normalize();
        const ref = Math.abs(normal.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
        const u = new Vector3().crossVectors(normal, ref).normalize();
        const v = new Vector3().crossVectors(normal, u).normalize();
        const project = (quad: Vector3[]) =>
          quad.map((p) => {
            const d = p.clone().sub(origin);
            return [d.dot(u), d.dot(v)];
          });
        expect(quadsOverlap(project(quads[i]), project(quads[j])), `roofs ${i} and ${j} overlap`).toBe(false);
      }
    }
  });
});
