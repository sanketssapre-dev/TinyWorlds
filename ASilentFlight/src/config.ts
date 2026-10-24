/** Central scene scale and flight constants. */

export const PLANET = {
  radius: 45,
  diameter: 90,
  /**
   * Inside-out sky shell. Must sit beyond the farthest overhead eye:
   * flight radius (about radius + maxHeight + cruise) + maxOverheadZoom, plus margin.
   */
  atmosphereRadius: 1150,
  maxHeight: 9.2,
  minHeight: -2.4,
} as const;

export const ATMOSPHERE = {
  fadeStart: 72,
  fadeEnd: 160,
} as const;

export const FLIGHT = {
  /** Height above the smoothed hills, in world units. */
  cruise: 6.4,
  minClearance: 3.4,
  /** A calm cruise. One circuit takes a few quiet minutes. */
  speed: 1.8,
} as const;

export const SUN = {
  direction: [90, 55, 35] as const,
  distance: 5000,
  radius: 27,
  glowDiameter: 210,
} as const;

export const SEARCH_LIGHT = {
  intensity: 32,
  distance: 26,
  angle: 1.25,
  innerAngle: 0.125,
  minimumFalloffDistance: 4,
} as const;

export const MOON = {
  radius: 4.8,
  secondScale: 0.8,
  smallerOrbitDistance: PLANET.diameter,
  largerOrbitDistance: PLANET.diameter * 1.5,
} as const;

export const PLANETARY_RING = {
  equatorialHeightAboveSurface: 80,
  equatorialRadiusMultiplier: (PLANET.radius + 80) / PLANET.radius,
  orbitDistance: PLANET.radius + 80,
  bandOffsets: [-3, 0, 3],
  bandWidths: [4, 5, 4],
  asteroidCounts: [300, 380, 290],
  asteroidSizeRatioRange: [0.03, 0.08] as const,
  asteroidGlowIntensity: 0.44,
  pointLodSize: 1.5,
  pointLodOpacity: 0.92,
  pointLodFadeStart: 220,
  pointLodFadeEnd: 420,
  orientation: [0, 0, 0] as const,
  visibleByDefault: true,
} as const;

export const PLANETARY_RING_OUTER_BOUNDARY =
  PLANETARY_RING.orbitDistance +
  Math.max(...PLANETARY_RING.bandOffsets.map(Math.abs)) +
  Math.max(...PLANETARY_RING.bandWidths) / 2 +
  MOON.radius * PLANETARY_RING.asteroidSizeRatioRange[1] * 2;

export const STARFIELD = {
  count: 1800,
  innerRadius: 800,
  outerRadius: 1200,
} as const;

export const CAMERA = {
  fov: 42,
  near: 0.15,
  far: 6000,
  followDistance: 8.4,
  followHeight: 3.6,
  lookAhead: 4.8,
  overheadDistance: 40,
  minZoom: 8.064,
  /** Chase / behind view. Stays a close follow, never an orbital pull-back. */
  maxZoom: 40.8,
  /** Above view only. Far enough for the planet disk to sit inside a 42° frame. */
  maxOverheadZoom: 367.2,
  /** Above view only. Stops at the close framing requested for the world view. */
  minOverheadZoom: 30.8,
  damping: 2.4,
} as const;

export const DEBUG = {
  enabled:
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("pathdebug"),
};
