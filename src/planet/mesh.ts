import {
  BufferAttribute,
  BufferGeometry,
  Color,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PLANET } from "../config";
import { cartToSph, angularDistance } from "../math/sphere";
import { heightOffset } from "./height";
import { SITES } from "./features";

const grassA = new Color("#3f5c3a");
const grassB = new Color("#5a7044");
const meadow = new Color("#6b7d48");
const forest = new Color("#2c4a34");
const rock = new Color("#6e665c");
const cliff = new Color("#8a7d6d");
const sand = new Color("#c2b08a");
const snow = new Color("#f4f7f8");

export function createPlanetMesh(): Mesh {
  const source = new IcosahedronGeometry(PLANET.radius, 72);
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
  geo.boundingBox = null;
  geo.boundingSphere = null;
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal as BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const n = new Vector3();
  const color = new Color();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nrm, i);
    const sph = cartToSph(v);
    const h = v.length() - PLANET.radius;
    const radial = v.clone().normalize();
    const slope = 1 - Math.max(0, n.dot(radial));

    const mix = (Math.sin(sph.theta * 3.2 + sph.phi * 2.1) + 1) * 0.5;
    const speckle = (Math.sin(sph.theta * 9.5 + sph.phi * 6.4) + 1) * 0.5;
    color.lerpColors(grassA, grassB, mix);
    color.lerp(meadow, speckle * 0.16);
    if (h > 2.4) color.lerp(forest, Math.min(0.22, (h - 2.4) * 0.06));

    if (slope > 0.36) color.lerp(cliff, Math.min(1, (slope - 0.36) / 0.22));
    else if (slope > 0.2) color.lerp(rock, ((slope - 0.2) / 0.16) * 0.4);

    if (h > 5.7) color.lerp(snow, Math.min(1, (h - 5.7) / 1.15));

    const lakeShore = angularDistance(sph.theta, sph.phi, SITES.lake.theta, SITES.lake.phi);
    const otherShore = Math.min(
      angularDistance(sph.theta, sph.phi, SITES.lake2.theta, SITES.lake2.phi),
      angularDistance(sph.theta, sph.phi, SITES.pool.theta, SITES.pool.phi),
    );
    if (lakeShore < 0.11) {
      const t = 1 - lakeShore / 0.11;
      color.lerp(sand, t * t * 0.55);
    } else if (otherShore < 0.07) {
      const t = 1 - otherShore / 0.07;
      color.lerp(sand, t * t * 0.55);
    }

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geo.setAttribute("color", new BufferAttribute(colors, 3));
  geo.computeBoundingSphere();

  const mat = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.02,
    flatShading: false,
  });

  const mesh = new Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = "planet";
  return mesh;
}
