import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { PLANET, WATER } from "../config";
import { sphToCart, wrapPhi } from "../math/sphere";
import { heightOffset } from "./height";
import { LAKES, SITES } from "./features";

let time = 0;
const waterMats: ShaderMaterial[] = [];

export function createWater(): Group {
  const root = new Group();
  root.name = "alpine-water";

  for (const lake of LAKES) {
    const floor = heightOffset(lake.site.theta, lake.site.phi);
    const surfaceH = floor + 0.22 + WATER.lakeLevelBias;
    const geo = lakeCap(lake.site.theta, lake.site.phi, lake.radius, PLANET.radius + surfaceH);
    const mat = new ShaderMaterial({
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color("#2f7f96") },
        uDeep: { value: new Color("#0e3c52") },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform vec3 uDeep;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          float wave = sin((p.x * 18.0 + uTime * 1.2)) * 0.04
                     + sin((p.y * 14.0 - uTime * 0.9)) * 0.03;
          float alpha = smoothstep(1.02, 0.84, r) * 0.94;
          vec3 col = mix(uDeep, uColor, 0.55 + wave);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    waterMats.push(mat);
    const mesh = new Mesh(geo, mat);
    mesh.name = `lake-${lake.site.id}`;
    root.add(mesh);

    // Simple waterfall ribbon near waterfall site for one lake
    if (lake.site.id === "lakeGeneva") {
      const fall = createWaterfall();
      root.add(fall);
    }
  }

  return root;
}

function createWaterfall(): Group {
  const fall = new Group();
  fall.name = "waterfall";
  const h = heightOffset(SITES.waterfall.theta, SITES.waterfall.phi);
  const base = sphToCart(PLANET.radius + h + 0.05, SITES.waterfall.theta, SITES.waterfall.phi);
  const normal = base.clone().normalize();
  const side = new Vector3(0, 1, 0).cross(normal);
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  side.normalize();
  const down = new Vector3().crossVectors(normal, side).normalize();

  const mat = new MeshStandardMaterial({
    color: "#e7f6f8",
    transparent: true,
    opacity: 0.78,
    roughness: 0.12,
    metalness: 0.02,
    side: DoubleSide,
    depthWrite: false,
  });
  for (let i = 0; i < 5; i++) {
    const sheet = new Mesh(new PlaneGeometry(0.16 + (i % 3) * 0.07, 2.15 - (i % 2) * 0.25), mat);
    const pos = base
      .clone()
      .addScaledVector(normal, 0.12 + i * 0.015)
      .addScaledVector(side, (i - 2) * 0.14)
      .addScaledVector(down, 0.15);
    const basis = new Matrix4().makeBasis(side, down, normal);
    basis.setPosition(pos);
    sheet.matrixAutoUpdate = false;
    sheet.matrix.copy(basis);
    fall.add(sheet);
  }

  const rock = new MeshStandardMaterial({ color: "#8d8a84", roughness: 0.94 });
  const lip = new Mesh(new IcosahedronGeometry(0.48, 1), rock);
  const lipPos = base.clone().addScaledVector(normal, 0.28).addScaledVector(down, -0.85);
  const lipM = new Matrix4().makeBasis(side, normal, down);
  lipM.scale(new Vector3(1.5, 0.45, 0.85));
  lipM.setPosition(lipPos);
  lip.matrixAutoUpdate = false;
  lip.matrix.copy(lipM);
  lip.castShadow = true;
  fall.add(lip);

  const spray = new Mesh(
    new SphereGeometry(0.42, 10, 8),
    new MeshStandardMaterial({
      color: "#e7f4f6",
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      roughness: 1,
    }),
  );
  spray.position.copy(base).addScaledVector(down, 1.05).addScaledVector(normal, 0.12);
  spray.scale.set(1.3, 0.45, 0.8);
  fall.add(spray);
  return fall;
}

/** Spherical cap so a wide lake follows the planet instead of sagging at the rim. */
function lakeCap(theta: number, phi: number, worldRadius: number, radial: number): BufferGeometry {
  const angular = worldRadius / PLANET.radius;
  const rings = 6;
  const segs = 36;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const center = sphToCart(radial, theta, phi);
  positions.push(center.x, center.y, center.z);
  uvs.push(0.5, 0.5);
  const ringStart: number[] = [0];
  const sinT = Math.max(0.28, Math.sin(theta));
  for (let ring = 1; ring <= rings; ring++) {
    ringStart.push(positions.length / 3);
    const a = (angular * ring) / rings;
    const uvR = (0.5 * ring) / rings;
    for (let s = 0; s < segs; s++) {
      const t = (s / segs) * Math.PI * 2;
      const p = sphToCart(radial, theta + Math.cos(t) * a, wrapPhi(phi + (Math.sin(t) * a) / sinT));
      positions.push(p.x, p.y, p.z);
      uvs.push(0.5 + Math.cos(t) * uvR, 0.5 + Math.sin(t) * uvR);
    }
  }
  const inner = ringStart[1];
  for (let s = 0; s < segs; s++) {
    indices.push(0, inner + s, inner + ((s + 1) % segs));
  }
  for (let ring = 1; ring < rings; ring++) {
    const a0 = ringStart[ring];
    const b0 = ringStart[ring + 1];
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      indices.push(a0 + s, b0 + s, b0 + s1, a0 + s, b0 + s1, a0 + s1);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function updateWater(dt: number): void {
  time += dt;
  for (const mat of waterMats) mat.uniforms.uTime.value = time;
}
