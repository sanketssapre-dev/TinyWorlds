import { PLANET, WATER_LEVEL } from "../config";
import { fbm3 } from "../math/noise";
import { angularDistance, sphToCart } from "../math/sphere";
import { SITES } from "./features";

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

function baseTerrainHeight(theta: number, phi: number): number {
  const p = sphToCart(1, theta, phi);
  const continents = fbm3(p.x * 1.6, p.y * 1.6, p.z * 1.6, 5, 2.05, 0.52, 11);
  const ridges = Math.abs(fbm3(p.x * 2.4, p.y * 2.4, p.z * 2.4, 4, 2.1, 0.48, 41));
  const detail = fbm3(p.x * 6.2, p.y * 6.2, p.z * 6.2, 3, 2.2, 0.5, 73);
  const roll = fbm3(p.x * 3.3, p.y * 3.3, p.z * 3.3, 3, 2.1, 0.5, 19);

  let h = 0.85 + continents * 2.05 + ridges * 0.75 + roll * 0.7 + detail * 0.32;

  h += blob(theta, phi, SITES.peakNorth.theta, SITES.peakNorth.phi, 0.28, 6.8);
  h += blob(theta, phi, SITES.peakWest.theta, SITES.peakWest.phi, 0.22, 5.4);
  h += blob(theta, phi, SITES.peakEast.theta, SITES.peakEast.phi, 0.2, 4.6);
  h += blob(theta, phi, SITES.cliff.theta, SITES.cliff.phi, 0.18, 3.2);
  h += blob(theta, phi, SITES.castle.theta, SITES.castle.phi, 0.12, 1.6);

  h -= blob(theta, phi, SITES.lake.theta, SITES.lake.phi, 0.25, 5.0);
  h -= blob(theta, phi, SITES.lake2.theta, SITES.lake2.phi, 0.16, 3.6);
  h -= blob(theta, phi, SITES.pool.theta, SITES.pool.phi, 0.1, 2.4);

  h += blob(theta, phi, SITES.village.theta, SITES.village.phi, 0.16, 0.85);
  h += blob(theta, phi, SITES.ancientTree.theta, SITES.ancientTree.phi, 0.14, 0.7);

  return Math.max(PLANET.minHeight, Math.min(PLANET.maxHeight, h));
}

/** Village rings from the original globe — raised into islands here. */
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

/** Flooded globe: settlements and landmarks lifted into islands. */
export function heightOffset(theta: number, phi: number): number {
  let h = baseTerrainHeight(theta, phi);
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

export function slopeMagnitude(theta: number, phi: number): number {
  const eps = 0.012;
  const h = heightOffset(theta, phi);
  const dTheta = (heightOffset(theta + eps, phi) - h) / eps;
  const dPhi = (heightOffset(theta, phi + eps) - h) / (eps * Math.max(0.2, Math.sin(theta)));
  return Math.hypot(dTheta, dPhi);
}
