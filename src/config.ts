/** Central scene scale. Planet diameter : locomotive length = 60 : 1. */

export const PLANET = {
  radius: 45,
  diameter: 90,
  /**
   * Inside-out sky shell. Must sit beyond the farthest overhead eye:
   * flight radius (about radius + maxHeight + cruise) + maxOverheadZoom, plus margin.
   */
  atmosphereRadius: 270,
  maxHeight: 9.2,
  minHeight: -2.4,
} as const;

export const TRAIN = {
  locomotiveLength: 1.5,
  /** World units per second. A lap takes a long, quiet while. */
  defaultSpeed: 0.42,
  minSpeed: 0.16,
  maxSpeed: 1.2,
  wheelRadius: 0.09,
} as const;

export const TRACK = {
  gauge: 0.28,
  railRadius: 0.018,
  sleeperSpacing: 0.2,
  sleeperWidth: 0.42,
  sleeperLength: 0.08,
  sleeperHeight: 0.035,
  ballastWidth: 0.72,
  bedOffset: 0.1,
  pierSpacing: 1.65,
  elevatedThreshold: 0.72,
  tunnelClearance: 2.15,
} as const;

export const FLIGHT = {
  /** Height above the smoothed hills, in world units. */
  cruise: 6.4,
  minClearance: 3.4,
  /** A calm cruise. One circuit takes a few quiet minutes. */
  speed: 1.8,
} as const;

export const CAMERA = {
  fov: 42,
  near: 0.15,
  far: 600,
  followDistance: 8.4,
  followHeight: 3.6,
  lookAhead: 4.8,
  overheadDistance: 40,
  minZoom: 7,
  /** Chase / behind view. Stays a close follow, never an orbital pull-back. */
  maxZoom: 48,
  /** Above view only. Far enough for the planet disk to sit inside a 42° frame. */
  maxOverheadZoom: 125,
  damping: 2.4,
} as const;

export const DEBUG = {
  enabled:
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("pathdebug"),
};

export function planetToLocoRatio(): number {
  return PLANET.diameter / TRAIN.locomotiveLength;
}
