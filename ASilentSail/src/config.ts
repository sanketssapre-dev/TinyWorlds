/** Central scene scale and sail world constants. */

export const PLANET = {
  radius: 45,
  diameter: 90,
  atmosphereRadius: 1150,
  maxHeight: 9.2,
  minHeight: -2.4,
} as const;

export const ATMOSPHERE = {
  fadeStart: 72,
  fadeEnd: 160,
} as const;

export const SUN = {
  direction: [90, 55, 35] as const,
  distance: 5000,
  radius: 27,
  glowDiameter: 210,
} as const;

export const MOON = {
  radius: 4.8,
  secondScale: 0.8,
  smallerOrbitDistance: PLANET.diameter,
  largerOrbitDistance: PLANET.diameter * 1.5,
} as const;

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
  minZoom: 10.08,
  maxZoom: 40.8,
  maxOverheadZoom: 367.2,
  minOverheadZoom: 30.8,
  damping: 2.4,
} as const;

export const DEBUG = {
  enabled:
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("pathdebug"),
};

/** Height offset (same units as terrain) for the risen ocean. */
export const WATER_LEVEL = 3.05;

export const SAIL = {
  /** Hull origin sits this far above the flood plane so swell stays on the topsides. */
  draft: 0.1,
  /** Guest cruise. Hero runs at speed * heroMul. */
  speed: 0.84,
  heroMul: 1.5,
  minSpeed: 0.4,
  maxSpeed: 1.32,
  yieldDistance: 5.6,
  hullClear: 3.5,
  lookAhead: 7.5,
  islandClearance: 1.2,
  passRange: 7.8,
  passOffset: 3.4,
  passClear: 3.2,
  passHoldAstern: 7.6,
} as const;
