import { PLANET, WATER_LEVEL } from "../config";
import { heightOffset as baseHeight } from "../flight/planet/height";
import { SITES } from "../flight/planet/features";
import { angularDistance } from "../flight/math/sphere";

function blob(
  theta: number,
  phi: number,
  siteTheta: number,
  sitePhi: number,
  sigma: number,
  amplitude: number,
): number {
  const d = angularDistance(theta, phi, siteTheta, sitePhi);
  return amplitude * Math.exp(-(d * d) / (2 * sigma * sigma));
}

/** Village rings from the flight world — raised into islands here. */
export const SETTLEMENT_ISLANDS = [
  { theta: SITES.village.theta, phi: SITES.village.phi, sigma: 0.18, amp: 3.4 },
  { theta: 1.36, phi: 1.82, sigma: 0.16, amp: 3.2 },
  { theta: 1.55, phi: 3.15, sigma: 0.16, amp: 3.1 },
  { theta: 1.36, phi: 4.62, sigma: 0.15, amp: 3.0 },
  { theta: 1.52, phi: 5.58, sigma: 0.16, amp: 3.2 },
] as const;

export const LANDMARK_ISLANDS = [
  { theta: SITES.castle.theta, phi: SITES.castle.phi, sigma: 0.18, amp: 2.2 },
  { theta: SITES.shrine.theta, phi: SITES.shrine.phi, sigma: 0.13, amp: 1.7 },
  { theta: SITES.tower.theta, phi: SITES.tower.phi, sigma: 0.12, amp: 1.6 },
  { theta: SITES.ancientTree.theta, phi: SITES.ancientTree.phi, sigma: 0.15, amp: 2.0 },
] as const;

export const NAV_ISLANDS = [...SETTLEMENT_ISLANDS, ...LANDMARK_ISLANDS];

const ISLAND_FLOOR = WATER_LEVEL + 1.55;

/** Same hills, flooded seas, settlements and landmarks lifted into islands. */
export function heightOffset(theta: number, phi: number): number {
  let h = baseHeight(theta, phi);
  for (const site of SETTLEMENT_ISLANDS) {
    h += blob(theta, phi, site.theta, site.phi, site.sigma, site.amp);
  }
  for (const site of LANDMARK_ISLANDS) {
    h += blob(theta, phi, site.theta, site.phi, site.sigma, site.amp);
  }

  for (const site of NAV_ISLANDS) {
    const d = angularDistance(theta, phi, site.theta, site.phi);
    if (d > site.sigma * 1.8) continue;
    const falloff = Math.exp(-(d * d) / (site.sigma * site.sigma));
    if (h < ISLAND_FLOOR) h += (ISLAND_FLOOR - h) * falloff;
  }

  return Math.max(PLANET.minHeight, Math.min(PLANET.maxHeight + 2.8, h));
}

export function surfaceRadius(theta: number, phi: number): number {
  return PLANET.radius + heightOffset(theta, phi);
}

export function isDryLand(theta: number, phi: number, margin = 0.12): boolean {
  return heightOffset(theta, phi) > WATER_LEVEL + margin;
}

export function waterSurfaceRadius(): number {
  return PLANET.radius + WATER_LEVEL;
}

export { slopeMagnitude } from "../flight/planet/height";
