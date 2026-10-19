import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferGeometry,
  Color,
  DataTexture,
  DirectionalLight,
  Float32BufferAttribute,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  Vector3,
} from "three";
import { ATMOSPHERE, MOON, PLANET, PLANETARY_RING, STARFIELD, SUN } from "../config";
import { sphToCart } from "../math/sphere";

export function createEnvironment(scene: Scene): Group {
  scene.background = new Color("#05060d");
  scene.fog = new FogExp2("#1a4c56", 0.0011);

  const group = new Group();
  group.name = "environment";

  const hemi = new HemisphereLight("#9fd8d0", "#3d5a42", 1.05);
  group.add(hemi);
  const ambient = new AmbientLight("#7ea8a4", 0.38);
  group.add(ambient);

  const sunlight = new DirectionalLight("#f0e2c4", 1.85);
  sunlight.position.set(...SUN.direction);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  sunlight.shadow.camera.near = 20;
  sunlight.shadow.camera.far = 220;
  sunlight.shadow.camera.left = -70;
  sunlight.shadow.camera.right = 70;
  sunlight.shadow.camera.top = 70;
  sunlight.shadow.camera.bottom = -70;
  sunlight.shadow.bias = -0.00015;
  group.add(sunlight);
  group.add(createVisibleSun());

  const fill = new DirectionalLight("#6b8a9a", 0.42);
  fill.position.set(-40, -30, -60);
  group.add(fill);

  group.add(createStars());
  group.add(createAtmosphere());
  group.add(createMoons());
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
      data[i + 1] = disc ? 250 : 190;
      data[i + 2] = disc ? 232 : 72;
      data[i + 3] = disc ? 255 : Math.round(halo * 150);
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createStars(): Points {
  const count = STARFIELD.count;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = STARFIELD.innerRadius + Math.random() * (STARFIELD.outerRadius - STARFIELD.innerRadius);
    const theta = Math.acos(2 * Math.random() - 1);
    const phi = Math.random() * Math.PI * 2;
    const p = sphToCart(r, theta, phi);
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  const mat = new PointsMaterial({
    color: "#dce6ff",
    size: 0.55,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    fog: false,
  });
  const stars = new Points(geo, mat);
  stars.name = "star-field";
  return stars;
}

export function createAtmosphere(): Mesh {
  const geo = new SphereGeometry(PLANET.atmosphereRadius, 64, 48);
  const mat = new ShaderMaterial({
    side: BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uLimb: { value: PLANET.radius + 4 },
      uFadeStart: { value: ATMOSPHERE.fadeStart },
      uFadeEnd: { value: ATMOSPHERE.fadeEnd },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      uniform float uLimb;
      uniform float uFadeStart;
      uniform float uFadeEnd;
      void main() {
        vec3 viewDir = normalize(vWorld - cameraPosition);
        float camLen = length(cameraPosition);
        vec3 radial = cameraPosition / max(camLen, 0.001);
        float elev = dot(viewDir, radial);
        // Chase view, near the ground: dark star field, teal only along the horizon.
        float tNear = smoothstep(-0.68, -0.50, elev);
        // Overhead pull-back: keep that teal as a rim on the planet limb, not the whole frame.
        float s = clamp(uLimb / camLen, 0.0, 0.98);
        float limb = -sqrt(max(1.0 - s * s, 0.0));
        float tFar = smoothstep(limb - 0.02, limb + 0.03, elev);
        float alt = smoothstep(100.0, 145.0, camLen);
        float t = mix(tNear, tFar, alt);
        float shellAlpha = 1.0 - smoothstep(uFadeStart, uFadeEnd, camLen);
        vec3 horizon = vec3(0.58, 0.92, 0.82);
        vec3 zenith = vec3(0.02, 0.04, 0.09);
        gl_FragColor = vec4(mix(horizon, zenith, t), shellAlpha);
      }
    `,
  });
  const mesh = new Mesh(geo, mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

export const MOON_ORBIT_DISTANCE = MOON.smallerOrbitDistance;
export const PLANETARY_RING_DISTANCE = PLANETARY_RING.orbitDistance;

export function createMoons(): Group {
  const moons = new Group();
  moons.name = "natural-moons";
  const smallerRadius = MOON.radius * MOON.secondScale;
  const smallerMoon = new Mesh(
    new SphereGeometry(smallerRadius, 24, 20),
    moonMaterial("#9bbfe8"),
  );
  smallerMoon.name = "blue-moon";
  smallerMoon.position.set(0, MOON.smallerOrbitDistance, 0);
  smallerMoon.add(createMoonGlow("#8fc8ff", smallerRadius));

  const largerMoon = new Mesh(
    new SphereGeometry(MOON.radius, 24, 20),
    moonMaterial("#cfc6b4"),
  );
  largerMoon.name = "primary-moon";
  largerMoon.position.set(0, -MOON.largerOrbitDistance, 0);
  largerMoon.add(createMoonGlow("#e6cda2", MOON.radius));
  moons.add(smallerMoon, largerMoon);
  return moons;
}

function createMoonGlow(color: string, radius: number): Mesh {
  const glow = new Mesh(
    new SphereGeometry(radius, 24, 20),
    new ShaderMaterial({
      uniforms: { uGlow: { value: new Color(color) } },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-viewPosition.xyz);
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uGlow;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 2.6);
          float alpha = rim * 0.16;
          gl_FragColor = vec4(uGlow, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: BackSide,
      toneMapped: false,
    }),
  );
  glow.name = "moon-faint-glow";
  glow.scale.setScalar(1.16);
  return glow;
}

function moonMaterial(color: string): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) } },
    vertexShader: `varying vec3 vN; void main(){ vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vN; uniform vec3 uColor; void main(){ float l = 0.35 + 0.65 * max(0.0, dot(normalize(vN), vec3(0.4,0.6,0.3))); gl_FragColor = vec4(uColor * l, 1.0); }`,
  });
}

const RING_SOIL_COLORS = ["#d2a832", "#c69524", "#dfb747"];
const RING_BAND_SPEEDS = [0.0001, -0.00013, 0.00016];

export function createPlanetaryRings(): Group {
  const rings = new Group();
  rings.name = "planetary-soil-rings";
  rings.rotation.set(...PLANETARY_RING.orientation);
  rings.visible = PLANETARY_RING.visibleByDefault;

  const geometry = createAsteroidGeometry();
  for (let i = 0; i < PLANETARY_RING.asteroidCounts.length; i++) {
    const count = PLANETARY_RING.asteroidCounts[i];
    const material = new MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.64,
      metalness: 0.24,
      flatShading: true,
      emissive: "#a87912",
      emissiveIntensity: PLANETARY_RING.asteroidGlowIntensity,
      fog: false,
    });
    const belt = new InstancedMesh(geometry, material, count);
    belt.name = `planetary-asteroid-belt-${i + 1}`;
    belt.frustumCulled = false;
    const centers = scatterAsteroids(
      belt,
      i,
      PLANETARY_RING.bandOffsets[i],
      PLANETARY_RING.bandWidths[i],
    );
    const lodGeometry = new BufferGeometry();
    lodGeometry.setAttribute("position", new Float32BufferAttribute(centers, 3));
    const lod = new Points(
      lodGeometry,
      new PointsMaterial({
        color: RING_SOIL_COLORS[i],
        size: PLANETARY_RING.pointLodSize,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
      }),
    );
    lod.name = "planetary-asteroid-point-lod";
    lod.frustumCulled = false;

    const beltGroup = new Group();
    beltGroup.name = `planetary-asteroid-belt-${i + 1}`;
    beltGroup.userData.flowSpeed = RING_BAND_SPEEDS[i];
    beltGroup.add(belt, lod);
    rings.add(beltGroup);
  }
  return rings;
}

export function updatePlanetaryRings(group: Group, dt: number, cameraRadius = 0): void {
  if (!group.visible) return;
  const pointLodFade = smoothstep(
    PLANETARY_RING.pointLodFadeStart,
    PLANETARY_RING.pointLodFadeEnd,
    cameraRadius,
  );
  for (const belt of group.children) {
    belt.rotateY((belt.userData.flowSpeed as number) * dt);
    const lod = belt.getObjectByName("planetary-asteroid-point-lod") as Points | undefined;
    if (lod) {
      (lod.material as PointsMaterial).opacity = pointLodFade * PLANETARY_RING.pointLodOpacity;
    }
  }
}

function createAsteroidGeometry(): BufferGeometry {
  const geometry = new SphereGeometry(1, 10, 8);
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const seed = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    const roughness = 0.88 + (seed - Math.floor(seed)) * 0.24;
    positions.setXYZ(i, x * roughness, y * roughness, z * roughness);
  }
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const maxDimension = Math.max(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  );
  geometry.scale(2 / maxDimension, 2 / maxDimension, 2 / maxDimension);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function scatterAsteroids(
  belt: InstancedMesh,
  index: number,
  offset: number,
  width: number,
): Float32Array {
  let seed = 0x9e3779b9 ^ (index + 1) * 0x85ebca6b;
  const random = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const quaternion = new Quaternion();
  const color = new Color();
  const axis = new Vector3();
  const radius = PLANETARY_RING_DISTANCE + offset;
  const centers = new Float32Array(belt.count * 3);

  for (let i = 0; i < belt.count; i++) {
    const angle = random() * Math.PI * 2;
    const radialOffset = (random() - 0.5) * width;
    const orbitalRadius = radius + radialOffset;
    position.set(Math.cos(angle) * orbitalRadius, (random() - 0.5) * 0.8, Math.sin(angle) * orbitalRadius);
    centers.set([position.x, position.y, position.z], i * 3);
    axis.set(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
    quaternion.setFromAxisAngle(axis, random() * Math.PI * 2);
    const [minSizeRatio, maxSizeRatio] = PLANETARY_RING.asteroidSizeRatioRange;
    const size =
      MOON.radius *
      MOON.secondScale *
      (minSizeRatio + random() * (maxSizeRatio - minSizeRatio));
    scale.setScalar(size);
    matrix.compose(position, quaternion, scale);
    belt.setMatrixAt(i, matrix);

    const shade = 0.78 + random() * 0.36;
    color.set(RING_SOIL_COLORS[index]).multiplyScalar(shade);
    belt.setColorAt(i, color);
  }

  belt.instanceMatrix.needsUpdate = true;
  if (belt.instanceColor) belt.instanceColor.needsUpdate = true;
  return centers;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
