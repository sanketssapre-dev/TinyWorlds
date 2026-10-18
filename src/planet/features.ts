import { PLANET } from "../config";
import { angularDistance, sphToCart } from "../math/sphere";
import { Vector3 } from "three";

export type SphericalSite = {
  id: string;
  theta: number;
  phi: number;
  kind:
    | "village"
    | "castle"
    | "tower"
    | "shrine"
    | "ancientTree"
    | "arch"
    | "lake"
    | "pool"
    | "peak"
    | "cliff";
};

export const SITES: Record<string, SphericalSite> = {
  village: { id: "village", theta: 1.18, phi: 0.22, kind: "village" },
  castle: { id: "castle", theta: 0.72, phi: 2.35, kind: "castle" },
  tower: { id: "tower", theta: 0.98, phi: 5.72, kind: "tower" },
  shrine: { id: "shrine", theta: 1.08, phi: 5.18, kind: "shrine" },
  ancientTree: { id: "ancientTree", theta: 1.22, phi: 3.55, kind: "ancientTree" },
  arch: { id: "arch", theta: 1.32, phi: 0.86, kind: "arch" },
  lake: { id: "lake", theta: 1.42, phi: 1.18, kind: "lake" },
  lake2: { id: "lake2", theta: 1.68, phi: 4.05, kind: "lake" },
  pool: { id: "pool", theta: 1.55, phi: 1.65, kind: "pool" },
  peakNorth: { id: "peakNorth", theta: 0.68, phi: 2.32, kind: "peak" },
  peakWest: { id: "peakWest", theta: 1.05, phi: 3.9, kind: "peak" },
  peakEast: { id: "peakEast", theta: 1.12, phi: 6.05, kind: "peak" },
  cliff: { id: "cliff", theta: 1.95, phi: 2.8, kind: "cliff" },
  tunnel: { id: "tunnel", theta: 1.05, phi: 3.92, kind: "peak" },
};

export function sitePosition(site: SphericalSite, radius = PLANET.radius): Vector3 {
  return sphToCart(radius, site.theta, site.phi);
}

export function nearSite(
  theta: number,
  phi: number,
  site: SphericalSite,
  radius: number,
): number {
  const d = angularDistance(theta, phi, site.theta, site.phi);
  return Math.exp(-(d * d) / (radius * radius));
}
