import { AdditiveBlending, InstancedMesh, Matrix4, MeshBasicMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { PLANET, WATER_LEVEL } from "../config";
import { createSailPath, FLEET_ROUTES } from "../sail/path";
import { createSailPathMarkers } from "./pathMarkers";

describe("sail path debug", () => {
  it("draws a glowing ribbon above the water for every yacht", () => {
    const paths = FLEET_ROUTES.map((route) => createSailPath(768, route));
    const root = createSailPathMarkers(paths);
    expect(root.children).toHaveLength(FLEET_ROUTES.length);
    const mat = new Matrix4();
    const pos = new Vector3();
    const floor = PLANET.radius + WATER_LEVEL + 1.5;
    for (const route of root.children) {
      expect(route.children).toHaveLength(4);
      for (const child of route.children) {
        const mesh = child as InstancedMesh;
        const material = mesh.material as MeshBasicMaterial;
        expect(material.blending).toBe(AdditiveBlending);
        expect(material.toneMapped).toBe(false);
        expect(mesh.count).toBeGreaterThan(4);
        mesh.getMatrixAt(0, mat);
        pos.setFromMatrixPosition(mat);
        expect(pos.length()).toBeGreaterThan(floor);
        mesh.getMatrixAt(mesh.count - 1, mat);
        pos.setFromMatrixPosition(mat);
        expect(pos.length()).toBeGreaterThan(floor);
      }
    }
  });
});
