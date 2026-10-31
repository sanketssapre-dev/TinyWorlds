import {
  BufferAttribute,
  BufferGeometry,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PLANET } from "../config";
import { cartToSph } from "../math/sphere";
import { heightOffset } from "./height";
import { createAlpinePlanetMaterial } from "../render/materials";

export function createPlanetMesh(): Mesh {
  const source = new IcosahedronGeometry(PLANET.radius, 60);
  source.deleteAttribute("normal");
  source.deleteAttribute("uv");
  const geo: BufferGeometry = mergeVertices(source, 1e-3);
  source.dispose();

  const pos = geo.attributes.position as BufferAttribute;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const sph = cartToSph(v);
    v.setLength(PLANET.radius + heightOffset(sph.theta, sph.phi));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mat =
    typeof document === "undefined"
      ? new MeshStandardMaterial({ color: "#4d6244", roughness: 0.92 })
      : createAlpinePlanetMaterial();
  const mesh = new Mesh(geo, mat);
  mesh.name = "planet";
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}
