import { PLANET } from "../config";
import { angularDistance, sphToCart } from "../math/sphere";
import { Vector3 } from "three";

export type SphericalSite = {
  id: string;
  theta: number;
  phi: number;
  kind:
    | "village"
    | "chalet"
    | "peak"
    | "lake"
    | "pond"
    | "cliff"
    | "tunnel"
    | "meadow"
    | "waterfall";
};

/** Landmark anchors for the Alpine circuit — spaced around the globe. */
export const SITES: Record<string, SphericalSite> = {
  villageA: { id: "villageA", theta: 1.12, phi: 0.35, kind: "village" },
  villageB: { id: "villageB", theta: 1.28, phi: 2.55, kind: "village" },
  villageC: { id: "villageC", theta: 1.18, phi: 4.65, kind: "village" },
  chaletRidge: { id: "chaletRidge", theta: 0.95, phi: 1.45, kind: "chalet" },
  peakMatter: { id: "peakMatter", theta: 0.62, phi: 1.95, kind: "peak" },
  peakEiger: { id: "peakEiger", theta: 0.7, phi: 3.55, kind: "peak" },
  peakJung: { id: "peakJung", theta: 0.78, phi: 5.4, kind: "peak" },
  peakSouth: { id: "peakSouth", theta: 2.15, phi: 2.1, kind: "peak" },
  peakFar: { id: "peakFar", theta: 1.85, phi: 5.0, kind: "peak" },
  lakeGeneva: { id: "lakeGeneva", theta: 1.38, phi: 0.95, kind: "lake" },
  lakeBrienz: { id: "lakeBrienz", theta: 1.48, phi: 3.15, kind: "lake" },
  pondAlp: { id: "pondAlp", theta: 1.62, phi: 5.45, kind: "pond" },
  lakeThun: { id: "lakeThun", theta: 2.08, phi: 1.35, kind: "lake" },
  lakeLucerne: { id: "lakeLucerne", theta: 0.48, phi: 2.85, kind: "lake" },
  lakeMaggiora: { id: "lakeMaggiora", theta: 2.42, phi: 4.55, kind: "lake" },
  cliffFace: { id: "cliffFace", theta: 1.05, phi: 3.9, kind: "cliff" },
  tunnelA: { id: "tunnelA", theta: 1.02, phi: 3.95, kind: "tunnel" },
  tunnelB: { id: "tunnelB", theta: 1.35, phi: 1.7, kind: "tunnel" },
  meadowA: { id: "meadowA", theta: 1.32, phi: 0.1, kind: "meadow" },
  waterfall: { id: "waterfall", theta: 1.15, phi: 2.2, kind: "waterfall" },
};

/** World-unit radii. The two the railway crosses stay inside the bridge spans. */
export const LAKES: { site: SphericalSite; radius: number; depth: number }[] = [
  { site: SITES.lakeGeneva, radius: 19, depth: 3.4 },
  { site: SITES.lakeBrienz, radius: 15, depth: 3.0 },
  { site: SITES.pondAlp, radius: 8, depth: 2.0 },
  { site: SITES.lakeThun, radius: 20, depth: 3.6 },
  { site: SITES.lakeLucerne, radius: 16, depth: 3.2 },
  { site: SITES.lakeMaggiora, radius: 15, depth: 3.0 },
];

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
