/** Swiss Alps Sail world — enlarged planet, realistic Moon spacing. */

export const PLANET = {
  /** Large enough that Alpine relief is surface detail, not the whole silhouette. */
  radius: 96,
  diameter: 192,
  atmosphereRadius: 1600,
  /** ~12% of radius — mountains up close, a round limb from orbit. */
  maxHeight: 12,
  minHeight: -1.2,
} as const;

export const ATMOSPHERE = {
  fadeStart: 100,
  fadeEnd: 220,
} as const;

export const TRAIN = {
  locomotiveLength: 3.4,
  carriageLength: 2.5,
  carriageGap: 0.16,
  /** World units per second along arc length. */
  cruiseSpeed: 0.55,
  /** Driving-wheel radius. Wheel spin uses this so the rims match the ground speed. */
  wheelRadius: 0.17,
} as const;

export const TRACK = {
  gauge: 0.34,
  railRadius: 0.05,
  sleeperSpacing: 0.24,
  sleeperWidth: 0.52,
  sleeperLength: 0.1,
  sleeperHeight: 0.04,
  ballastWidth: 1.45,
  bedOffset: 0.12,
  pierSpacing: 2.1,
  elevatedThreshold: 0.85,
  tunnelClearance: 2.4,
} as const;

export const SUN = {
  direction: [90, 55, 35] as const,
  distance: 6000,
  radius: 32,
  glowDiameter: 240,
} as const;

/** Single lunar companion — Earth-ish proportions, cinematic distance. */
export const MOON = {
  /** ~1/3.7 of planet radius (Earth ratio), readable at miniature scale. */
  radius: 26,
  /** ~4.5 planet radii — farther than the old dual-moon setup. */
  orbitDistance: PLANET.radius * 4.5,
  /** North-east of the initial framing. */
  direction: [0.62, 0.28, 0.72] as const,
} as const;

export const STARFIELD = {
  count: 2200,
  innerRadius: 1100,
  outerRadius: 1700,
} as const;

export const CAMERA = {
  fov: 58,
  near: 0.2,
  far: 8000,
  followDistance: 16,
  followHeight: 7.2,
  lookAhead: 16,
  /** Wide Free Planet Spin framing — planet disk + Moon readable. */
  /** Far enough that the full disk sits in space, not a curved wall. */
  spinDistance: 520,
  minSpinZoom: 240,
  maxSpinZoom: 980,
  damping: 2.6,
  /** Ambient Free Planet Spin rate (rad/s). ~one turn every ~3 minutes. */
  planetSpinRate: 0.035,
} as const;

export const WATER = {
  /** Alpine lake surface height above mean sphere (local basin floor sits below). */
  lakeLevelBias: 0.15,
} as const;

export const DEBUG = {
  enabled:
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("pathdebug"),
};
