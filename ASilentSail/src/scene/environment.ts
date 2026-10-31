import {
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  Color,
  DataTexture,
  DirectionalLight,
  Float32BufferAttribute,
  FogExp2,
  Group,
  HemisphereLight,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  RGBAFormat,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  Vector3,
} from "three";
import { MOON, STARFIELD, SUN } from "../config";
import { alpineMaps } from "../render/materials";
import { fbm3, valueNoise3 } from "../math/noise";
import { sphToCart } from "../math/sphere";

/** Cosmic backdrop + lights + single cratered Moon. Not parented under the planet. */
export function createEnvironment(scene: Scene): Group {
  scene.background = new Color("#04050a");
  scene.fog = new FogExp2("#0a1218", 0.00035);

  const group = new Group();
  group.name = "environment";

  const hemi = new HemisphereLight("#e4dfd4", "#3e4636", 0.72);
  group.add(hemi);
  const ambient = new AmbientLight("#a39e92", 0.32);
  group.add(ambient);

  const sunlight = new DirectionalLight("#f2e6c8", 2.15);
  sunlight.position.set(...SUN.direction);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  sunlight.shadow.camera.near = 40;
  sunlight.shadow.camera.far = 320;
  sunlight.shadow.camera.left = -110;
  sunlight.shadow.camera.right = 110;
  sunlight.shadow.camera.top = 110;
  sunlight.shadow.camera.bottom = -110;
  sunlight.shadow.bias = -0.00012;
  group.add(sunlight);
  group.add(createVisibleSun());

  const fill = new DirectionalLight("#9a907e", 0.2);
  fill.position.set(-50, -40, -70);
  group.add(fill);

  group.add(createStars());
  group.add(createMoon());
  return group;
}

export function createVisibleSun(): Group {
  const sun = new Group();
  sun.name = "visible-sun";
  const direction = new Vector3(...SUN.direction).normalize();
  sun.position.copy(direction).multiplyScalar(SUN.distance);

  const discAndGlow = new Sprite(
    new SpriteMaterial({
      map: createSunGlowTexture(),
      transparent: true,
      blending: AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
  discAndGlow.name = "sun-disc-and-glow";
  discAndGlow.scale.setScalar(SUN.glowDiameter);
  sun.add(discAndGlow);
  return sun;
}

function createSunGlowTexture(): DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = (x + 0.5 - size / 2) / (size / 2);
      const dy = (y + 0.5 - size / 2) / (size / 2);
      const radius = Math.sqrt(dx * dx + dy * dy);
      const disc = radius <= 0.25;
      const halo = Math.exp(-radius * 4.8) * (1 - smoothstep(0.25, 1, radius));
      data[i] = 255;
      data[i + 1] = disc ? 245 : 220;
      data[i + 2] = disc ? 200 : 160;
      data[i + 3] = Math.min(255, Math.floor((disc ? 255 : 0) + halo * 210));
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.needsUpdate = true;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function createStars(): Points {
  const count = STARFIELD.count;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = Math.acos(2 * u - 1);
    const phi = v * Math.PI * 2;
    const r =
      STARFIELD.innerRadius +
      Math.random() * (STARFIELD.outerRadius - STARFIELD.innerRadius);
    const p = sphToCart(r, theta, phi);
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  const mat = new PointsMaterial({
    color: "#dce6f2",
    size: 1.35,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    fog: false,
  });
  const stars = new Points(geo, mat);
  stars.name = "starfield";
  return stars;
}

/** Realistic grey-white cratered Moon — independent of planet spin. */
export function createMoon(): Mesh {
  const geo = new SphereGeometry(MOON.radius, 96, 72);
  const pos = geo.attributes.position;
  const v = new Vector3();
  const colors = new Float32Array(pos.count * 3);
  const color = new Color();
  const highland = new Color("#c8c4bc");
  const mare = new Color("#7a7872");
  const craterFloor = new Color("#5c5a56");
  const rim = new Color("#d2cec6");

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    let h = 0;
    h += fbm3(n.x * 3.2, n.y * 3.2, n.z * 3.2, 4, 2.1, 0.5, 5) * 0.55;
    h += Math.abs(fbm3(n.x * 8, n.y * 8, n.z * 8, 3, 2.2, 0.45, 21)) * 0.35;

    // Large maria basins
    const mareA = Math.exp(-((n.x - 0.35) ** 2 + (n.y + 0.1) ** 2) * 4.5);
    const mareB = Math.exp(-((n.x + 0.4) ** 2 + (n.z - 0.25) ** 2) * 5.5);
    h -= mareA * 0.7 + mareB * 0.55;

    // Crater field
    for (let c = 0; c < 28; c++) {
      const cx = valueNoise3(c * 1.7, 2.3, 4.1, 90) * 2 - 1;
      const cy = valueNoise3(c * 2.1, 5.5, 1.2, 91) * 2 - 1;
      const cz = valueNoise3(c * 0.9, 7.7, 3.3, 92) * 2 - 1;
      const center = new Vector3(cx, cy, cz).normalize();
      const d = 1 - n.dot(center);
      const radius = 0.02 + valueNoise3(c, 0, 0, 93) * 0.09;
      if (d < radius) {
        const t = d / radius;
        const bowl = (1 - t) * (1 - t);
        h -= bowl * (0.35 + valueNoise3(c, 1, 0, 94) * 0.45);
        if (t > 0.72 && t < 0.98) h += (1 - Math.abs(t - 0.85) / 0.13) * 0.22;
      }
    }

    v.setLength(MOON.radius * (1 + h * 0.045));
    pos.setXYZ(i, v.x, v.y, v.z);

    color.copy(highland);
    color.lerp(mare, Math.min(1, mareA * 1.4 + mareB * 1.2));
    const speck = valueNoise3(n.x * 12, n.y * 12, n.z * 12, 55);
    color.lerp(rim, speck * 0.15);
    if (h < -0.35) color.lerp(craterFloor, Math.min(1, -h * 0.8));
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  pos.needsUpdate = true;
  geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new MeshStandardMaterial({
    map: alpineMaps().moon,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.0,
  });
  const moon = new Mesh(geo, mat);
  moon.name = "primary-moon";
  moon.castShadow = true;
  moon.receiveShadow = true;

  const dir = new Vector3(...MOON.direction).normalize();
  moon.position.copy(dir.multiplyScalar(MOON.orbitDistance));
  return moon;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
