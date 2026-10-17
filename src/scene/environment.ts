import {
  AmbientLight,
  BackSide,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  CanvasTexture,
  Vector3,
} from "three";
import { PLANET } from "../config";
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

  const sun = new DirectionalLight("#f0e2c4", 1.85);
  sun.position.set(90, 55, 35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 220;
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.bias = -0.00015;
  group.add(sun);

  const fill = new DirectionalLight("#6b8a9a", 0.42);
  fill.position.set(-40, -30, -60);
  group.add(fill);

  group.add(createStars());
  group.add(createAtmosphere());
  group.add(createClouds());
  group.add(createMotes());
  group.add(createMoon());
  return group;
}

function createStars(): Points {
  const count = 1800;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 220 + Math.random() * 160;
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
  return new Points(geo, mat);
}

function createAtmosphere(): Mesh {
  const geo = new SphereGeometry(PLANET.atmosphereRadius, 64, 48);
  const mat = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      uLimb: { value: PLANET.radius + 4 },
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
        vec3 horizon = vec3(0.58, 0.92, 0.82);
        vec3 zenith = vec3(0.02, 0.04, 0.09);
        gl_FragColor = vec4(mix(horizon, zenith, t), 1.0);
      }
    `,
  });
  const mesh = new Mesh(geo, mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

function cloudTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new CanvasTexture(canvas);
  const fade = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
  fade.addColorStop(0, "rgba(255,255,255,0.9)");
  fade.addColorStop(0.4, "rgba(248,250,252,0.45)");
  fade.addColorStop(1, "rgba(248,250,252,0)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createClouds(): Group {
  const g = new Group();
  g.name = "clouds";
  const mat = new SpriteMaterial({
    map: cloudTexture(),
    color: "#f6f4ef",
    transparent: true,
    depthWrite: false,
    fog: false,
    opacity: 0.92,
  });

  // Separate banks. Each one is a filled clump, so the sky does not grow a ring.
  const banks: Array<[number, number, number]> = [
    [1.45, 0.55, 0.9],
    [0.72, 1.85, 1.15],
    [1.55, 2.7, 0.8],
    [0.95, 3.65, 1.2],
    [1.7, 4.5, 0.9],
    [1.15, 5.6, 1.05],
  ];
  const blobs: Array<[number, number, number]> = [
    [0, 0, 5.4],
    [2.1, 0.7, 4.2],
    [-1.7, 1.3, 3.7],
    [0.5, -2.0, 4.5],
    [-2.2, -0.9, 3.3],
    [1.5, 1.9, 2.9],
  ];
  const radial = new Vector3();
  const tangent = new Vector3();
  const bitangent = new Vector3();

  banks.forEach(([theta, phi, scale], bank) => {
    const center = sphToCart(PLANET.radius + 16 + scale, theta, phi);
    radial.copy(center).normalize();
    tangent.set(-radial.z, 0, radial.x);
    if (tangent.lengthSq() < 1e-4) tangent.set(1, 0, 0);
    tangent.normalize();
    bitangent.crossVectors(radial, tangent);
    const spin = bank * 0.85;
    const cs = Math.cos(spin);
    const sn = Math.sin(spin);
    for (const [ox, oy, size] of blobs) {
      if (scale < 1 && size < 3.2) continue;
      const x = ox * cs - oy * sn;
      const y = ox * sn + oy * cs;
      const sprite = new Sprite(mat);
      sprite.position
        .copy(center)
        .addScaledVector(tangent, x * scale)
        .addScaledVector(bitangent, y * scale);
      const w = size * scale;
      sprite.scale.set(w, w * 0.7, 1);
      g.add(sprite);
    }
  });
  return g;
}

function createMoon(): Mesh {
  const mesh = new Mesh(
    new SphereGeometry(3.2, 16, 16),
    new ShaderMaterial({
      uniforms: { uColor: { value: new Color("#cfc6b4") } },
      vertexShader: `varying vec3 vN; void main(){ vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vN; uniform vec3 uColor; void main(){ float l = 0.35 + 0.65 * max(0.0, dot(normalize(vN), vec3(0.4,0.6,0.3))); gl_FragColor = vec4(uColor * l, 1.0); }`,
    }),
  );
  mesh.position.set(-70, 38, -90);
  return mesh;
}

function createMotes(): Group {
  const g = new Group();
  g.name = "motes";
  const geo = new SphereGeometry(0.045, 5, 4);
  const mat = new MeshStandardMaterial({
    color: "#f6e7b8",
    emissive: "#f0d48a",
    emissiveIntensity: 1.3,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  for (let i = 0; i < 36; i++) {
    const mote = new Mesh(geo, mat);
    const theta = 0.45 + ((i * 0.37) % 2.1);
    const phi = i * 1.7;
    mote.position.copy(sphToCart(PLANET.radius + 5 + (i % 5) * 1.4, theta, phi));
    g.add(mote);
  }
  return g;
}

export function updateClouds(group: Group, dt: number): void {
  const clouds = group.getObjectByName("clouds");
  if (clouds) clouds.rotateY(dt * 0.012);
  const motes = group.getObjectByName("motes");
  if (motes) motes.rotateY(dt * 0.018);
}
