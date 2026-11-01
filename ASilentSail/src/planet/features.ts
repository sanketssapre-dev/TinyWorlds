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
export const LAKES: { site: SphericalSite; radius: number; depth: number; shorePhase: number }[] = [
  { site: SITES.lakeGeneva, radius: 28.5, depth: 5.1, shorePhase: 0.3 },
  { site: SITES.lakeBrienz, radius: 22.5, depth: 4.5, shorePhase: 1.8 },
  { site: SITES.pondAlp, radius: 12, depth: 3, shorePhase: 3.2 },
  { site: SITES.lakeThun, radius: 30, depth: 5.4, shorePhase: 4.4 },
  { site: SITES.lakeLucerne, radius: 24, depth: 4.8, shorePhase: 2.5 },
  { site: SITES.lakeMaggiora, radius: 22.5, depth: 4.5, shorePhase: 5.3 },
];

/** Subtle, repeatable coves and headlands; shared by the basin and water edge. */
export function lakeShoreScale(
  lake: (typeof LAKES)[number],
  bearing: number,
): number {
  return (
    1 +
    0.095 * Math.cos(bearing * 2 + lake.shorePhase) +
    0.045 * Math.sin(bearing * 3 - lake.shorePhase * 0.7) +
    0.02 * Math.cos(bearing * 5 + lake.shorePhase * 1.3)
  );
}

export function lakeBearing(theta: number, phi: number, lake: (typeof LAKES)[number]): number {
  const deltaPhi = phi - lake.site.phi;
  const east = Math.sin(deltaPhi) * Math.cos(theta);
  const north =
    Math.cos(lake.site.theta) * Math.sin(theta) -
    Math.sin(lake.site.theta) * Math.cos(theta) * Math.cos(deltaPhi);
  return Math.atan2(east, north);
}

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
