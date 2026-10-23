import { PLANET } from "../config";
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

/** Extra radius relative to PLANET.radius. */
export function heightOffset(theta: number, phi: number): number {
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

export function surfaceRadius(theta: number, phi: number): number {
  return PLANET.radius + heightOffset(theta, phi);
}

export function slopeMagnitude(theta: number, phi: number): number {
  const eps = 0.012;
  const h = heightOffset(theta, phi);
  const dTheta = (heightOffset(theta + eps, phi) - h) / eps;
  const dPhi = (heightOffset(theta, phi + eps) - h) / (eps * Math.max(0.2, Math.sin(theta)));
  return Math.hypot(dTheta, dPhi);
}

export const WATER_LEVEL_LAKE = PLANET.radius - 0.85;
export const WATER_LEVEL_LAKE2 = PLANET.radius - 0.55;
