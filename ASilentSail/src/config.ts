export { PLANET, CAMERA, DEBUG, SUN, planetToLocoRatio } from "./flight/config";

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
