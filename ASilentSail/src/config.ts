/** Swiss Alps railway — enlarged planet, realistic Moon spacing. */

export const PLANET = {
  /** Broad enough for layered valleys and massifs around the miniature railway. */
  radius: 144,
  diameter: 288,
  atmosphereRadius: 2200,
  /** Alpine relief remains prominent without overwhelming the globe silhouette. */
  maxHeight: 22,
  minHeight: -2,
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
  cruiseSpeed: 1.32,
  /** Driving-wheel radius. Wheel spin uses this so the rims match the ground speed. */
  wheelRadius: 0.17,
} as const;

export const TRACK = {
  gauge: 0.42,
  railRadius: 0.028,
  sleeperSpacing: 0.24,
  /** Broad ties carry the rails and read clearly at miniature scale. */
  sleeperWidth: 1,
  sleeperLength: 0.16,
  sleeperHeight: 0.04,
  /** Centerline-to-centerline spacing between the autonomous railway lines. */
  trackSpacing: 4.8,
  bedOffset: 0.12,
  pierSpacing: 2.1,
  elevatedThreshold: 4.5,
} as const;

export const SUN = {
  direction: [90, 55, 35] as const,
  distance: 6000,
  radius: 32,
  glowDiameter: 240,
} as const;

/** Single lunar companion — Earth-ish proportions, cinematic distance. */
export const MOON = {
  /** Retain the companion's readable miniature-world proportion. */
  radius: 39,
  /** Four and a half planet radii keeps the Moon clearly beyond the Alpine horizon. */
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
  fov: 62,
  near: 0.2,
  far: 8000,
  /** Driver's window. A little wider than the chase, and near enough to keep the frame. */
  cabFov: 66,
  cabNear: 0.04,
  followDistance: 18,
  followHeight: 5.2,
  lookAhead: 24,
  /** Wide Free Planet Spin framing — planet disk + Moon readable. */
  /** Far enough that the full disk sits in space, not a curved wall. */
  spinDistance: 720,
  minSpinZoom: 420,
  maxSpinZoom: 1500,
  damping: 2.6,
  /** Ambient Free Planet Spin rate (rad/s). ~one turn every ~3 minutes. */
  planetSpinRate: 0.035,
} as const;

export const WATER = {
  /** Alpine lake surface height above mean sphere (local basin floor sits below). */
  lakeLevelBias: 0.15,
} as const;
