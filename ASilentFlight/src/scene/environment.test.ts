import { describe, expect, it } from "vitest";
import {
  BufferGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  Quaternion,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";
import {
  ATMOSPHERE,
  CAMERA,
  FLIGHT,
  MOON,
  PLANET,
  PLANETARY_RING,
  PLANETARY_RING_OUTER_BOUNDARY,
  STARFIELD,
  SUN,
} from "../config";
import {
  createAtmosphere,
  createEnvironment,
  createMoons,
  createStars,
  createVisibleSun,
  MOON_ORBIT_DISTANCE,
  PLANETARY_RING_DISTANCE,
  createPlanetaryRings,
  updatePlanetaryRings,
} from "./environment";

describe("celestial bodies", () => {
  it("creates three distinct gold asteroid belts around the planet's equator", () => {
    expect(PLANETARY_RING.equatorialHeightAboveSurface).toBe(80);
    expect(PLANETARY_RING.equatorialRadiusMultiplier).toBeCloseTo(
      (PLANET.radius + 80) / PLANET.radius,
    );
    expect(PLANETARY_RING_DISTANCE).toBeCloseTo(PLANET.radius + 80);
    expect(PLANETARY_RING.bandWidths).toHaveLength(3);
    expect(PLANETARY_RING.bandOffsets).toHaveLength(3);
    expect(new Set(PLANETARY_RING.bandWidths).size).toBeGreaterThan(1);
    expect(Math.max(...PLANETARY_RING.bandOffsets) - Math.min(...PLANETARY_RING.bandOffsets)).toBeLessThan(10);
    expect(PLANETARY_RING.asteroidCounts).toEqual([300, 380, 290]);
    expect(PLANETARY_RING.asteroidSizeRatioRange).toEqual([0.03, 0.08]);
    expect(STARFIELD.innerRadius).toBeGreaterThan(PLANETARY_RING_OUTER_BOUNDARY);
    const rings = createPlanetaryRings();
    expect(rings.rotation.x).toBe(0);
    expect(rings.rotation.y).toBe(0);
    expect(rings.rotation.z).toBe(0);
    expect(rings.children).toHaveLength(PLANETARY_RING.asteroidCounts.length);
    expect(
      rings.children.map((belt) =>
        belt.children.find((child) => child instanceof InstancedMesh)?.count,
      ),
    ).toEqual(
      PLANETARY_RING.asteroidCounts,
    );
    expect(rings.children.every((belt) => {
      const asteroids = belt.children.find((child) => child instanceof InstancedMesh) as InstancedMesh;
      const material = asteroids.material as MeshStandardMaterial;
      return material.emissive.getHexString() === "a87912" &&
        material.emissiveIntensity === PLANETARY_RING.asteroidGlowIntensity;
    })).toBe(true);
    expect(
      rings.children.every(
        (belt) => belt.getObjectByName("planetary-asteroid-point-lod") instanceof Points,
      ),
    ).toBe(true);

    const ringCenters = rings.children.flatMap((belt) => {
      const points = belt.getObjectByName("planetary-asteroid-point-lod") as Points;
      const positions = points.geometry.getAttribute("position");
      return Array.from({ length: positions.count }, (_, i) => [
        positions.getX(i),
        positions.getY(i),
        positions.getZ(i),
      ]);
    });
    expect(ringCenters.every(([x, y, z]) =>
      Math.hypot(x, z) > PLANET.radius && Math.abs(y) <= 0.4,
    )).toBe(true);

    const scales = rings.children.flatMap((belt) => {
      const asteroids = belt.children.find((child) => child instanceof InstancedMesh) as InstancedMesh;
      const matrix = new Matrix4();
      const position = new Vector3();
      const rotation = new Quaternion();
      const scale = new Vector3();
      const dimensions = asteroids.geometry.boundingBox!.getSize(new Vector3());
      const asteroidDiameter = Math.max(dimensions.x, dimensions.y, dimensions.z);
      const smallestMoonRadius = MOON.radius * MOON.secondScale;
      return Array.from({ length: asteroids.count }, (_, i) => {
        asteroids.getMatrixAt(i, matrix);
        matrix.decompose(position, rotation, scale);
        return (asteroidDiameter * scale.x) / (2 * smallestMoonRadius);
      });
    });
    expect(Math.min(...scales)).toBeGreaterThanOrEqual(0.03);
    expect(Math.max(...scales)).toBeLessThanOrEqual(0.08);
    expect(Math.min(...scales)).toBeLessThan(0.04);
    expect(Math.max(...scales)).toBeGreaterThan(0.07);
    expect(rings.children.every((belt) => {
      const asteroids = belt.children.find((child) => child instanceof InstancedMesh) as InstancedMesh;
      return asteroids.geometry instanceof SphereGeometry;
    })).toBe(true);
  });

  it("zooms out far enough to frame the planet, rings, and moons while preserving follow-mode zoom", () => {
    expect(CAMERA.maxOverheadZoom).toBeCloseTo(432 * 0.85);
    expect(CAMERA.far).toBeGreaterThan(SUN.distance + CAMERA.maxOverheadZoom);
    expect(CAMERA.far).toBeGreaterThan(
      CAMERA.maxOverheadZoom + PLANETARY_RING.orbitDistance + MOON.largerOrbitDistance,
    );
    expect(CAMERA.minOverheadZoom).toBeCloseTo(30.8);
    expect(CAMERA.minZoom).toBeCloseTo(8.4 * 1.2);
    expect(PLANET.atmosphereRadius).toBeGreaterThan(
      PLANET.radius + PLANET.maxHeight + FLIGHT.cruise + CAMERA.maxOverheadZoom,
    );
    expect(CAMERA.maxZoom).toBeCloseTo(48 * 0.85);
    expect(CAMERA.minZoom).toBeCloseTo(10.08);
  });

  it("places a warm visible Sun along the existing illumination direction", () => {
    const visibleSun = createVisibleSun();
    const expectedDirection = new Vector3(...SUN.direction).normalize();
    expect(visibleSun.position.length()).toBeCloseTo(SUN.distance);
    expect(visibleSun.position.clone().normalize().dot(expectedDirection)).toBeCloseTo(1);

    const discAndGlow = visibleSun.getObjectByName("sun-disc-and-glow") as Sprite;
    const material = discAndGlow.material as SpriteMaterial;
    expect(discAndGlow.scale.x).toBe(SUN.glowDiameter);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.toneMapped).toBe(false);
    expect(material.map).toBeDefined();
    const textureData = (material.map as import("three").DataTexture).image.data as Uint8Array;
    const centerPixel = (64 * 128 + 64) * 4;
    expect(textureData[centerPixel]).toBe(255);
    expect(textureData[centerPixel + 1]).toBeGreaterThan(240);
    expect(textureData[centerPixel + 2]).toBeGreaterThan(220);
    expect(visibleSun.children).toHaveLength(1);
  });

  it("fades the giant atmosphere shell away as the camera zooms out", () => {
    const atmosphere = createAtmosphere();
    const material = atmosphere.material as ShaderMaterial;
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.uniforms.uFadeStart.value).toBe(ATMOSPHERE.fadeStart);
    expect(material.uniforms.uFadeEnd.value).toBe(ATMOSPHERE.fadeEnd);
    expect(material.fragmentShader).toContain(
      "1.0 - smoothstep(uFadeStart, uFadeEnd, camLen)",
    );
  });

  it("places the smaller moon above the north pole and larger moon below the south pole", () => {
    const moons = createMoons();
    const primary = moons.getObjectByName("primary-moon");
    const secondary = moons.getObjectByName("blue-moon");
    expect(primary).toBeDefined();
    expect(secondary).toBeDefined();
    expect(primary!.position.length()).toBeCloseTo(MOON.largerOrbitDistance);
    expect(secondary!.position.length()).toBeCloseTo(MOON_ORBIT_DISTANCE);
    expect(MOON.radius).toBeCloseTo(3.2 * 1.5);
    expect(primary!.getObjectByName("moon-faint-glow")).toBeDefined();
    expect(secondary!.getObjectByName("moon-faint-glow")).toBeDefined();
    expect(primary!.position.y).toBeLessThan(-PLANET.radius);
    expect(secondary!.position.y).toBeGreaterThan(PLANET.radius);
    expect(primary!.position.x).toBe(0);
    expect(primary!.position.z).toBe(0);
    expect(secondary!.position.x).toBe(0);
    expect(secondary!.position.z).toBe(0);

    const primaryRadius = (primary as Mesh).geometry as SphereGeometry;
    const secondaryRadius = (secondary as Mesh).geometry as SphereGeometry;
    expect(primaryRadius.parameters.radius).toBeCloseTo(3.2 * 1.5);
    expect(secondaryRadius.parameters.radius).toBeCloseTo(3.2 * 0.8 * 1.5);
    expect(secondaryRadius.parameters.radius / primaryRadius.parameters.radius).toBeCloseTo(
      MOON.secondScale,
    );
  });

  it("keeps every star beyond the outer asteroid-belt boundary", () => {
    const stars = createStars();
    const positions = stars.geometry.getAttribute("position");
    expect(stars.name).toBe("star-field");
    expect(STARFIELD.innerRadius).toBe(800);
    expect(STARFIELD.outerRadius).toBe(1200);
    expect(positions.count).toBe(STARFIELD.count);
    for (let i = 0; i < positions.count; i++) {
      const radius = Math.hypot(positions.getX(i), positions.getY(i), positions.getZ(i));
      expect(radius).toBeGreaterThanOrEqual(800);
      expect(radius).toBeGreaterThan(PLANETARY_RING_OUTER_BOUNDARY);
      expect(radius).toBeLessThanOrEqual(STARFIELD.outerRadius);
    }
  });

  it("does not add clouds to the environment", () => {
    const environment = createEnvironment(new Scene());
    expect(environment.getObjectByName("clouds")).toBeUndefined();
    expect(environment.getObjectByName("visible-sun")).toBeDefined();
  });

  it("slowly moves asteroid belts within their fixed shared plane", () => {
    const group = new Group();
    group.rotation.set(0.4, 0.08, 0.18);
    const rotation = group.rotation.clone();
    const belt = new Group();
    belt.userData.flowSpeed = 0.04;
    const points = new Points(
      new BufferGeometry(),
      new PointsMaterial({ transparent: true, opacity: 0 }),
    );
    points.name = "planetary-asteroid-point-lod";
    belt.add(points);
    group.add(belt);
    const initialRotation = belt.rotation.y;

    updatePlanetaryRings(group, 0.5, PLANETARY_RING.pointLodFadeEnd);
    expect(belt.rotation.y - initialRotation).toBeCloseTo(0.02);
    expect((points.material as PointsMaterial).opacity).toBeCloseTo(PLANETARY_RING.pointLodOpacity);
    expect(group.rotation.equals(rotation)).toBe(true);

  });
});
