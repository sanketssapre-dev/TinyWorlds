import { PLANET } from "../config";
import { fbm3 } from "../math/noise";
import { angularDistance, sphToCart } from "../math/sphere";
import { lakeBearing, lakeShoreScale, LAKES, SITES } from "./features";

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

/** A peak broken into couloirs so the skyline is not a smooth dome. */
function jagged(
  theta: number,
  phi: number,
  siteTheta: number,
  sitePhi: number,
  sigma: number,
  amplitude: number,
): number {
  const d = angularDistance(theta, phi, siteTheta, sitePhi);
  const mask = Math.exp(-(d * d) / (2 * sigma * sigma));
  if (mask < 0.015) return 0;
  const p = sphToCart(1, theta, phi);
  const jag = Math.pow(Math.abs(fbm3(p.x * 14.0, p.y * 14.0, p.z * 14.0, 3, 2.1, 0.55, 17)), 0.55);
  return mask * amplitude * (0.42 + jag);
}

function massif(
  theta: number,
  phi: number,
  siteTheta: number,
  sitePhi: number,
  sigma: number,
  amplitude: number,
): number {
  return (
    blob(theta, phi, siteTheta, sitePhi, sigma * 1.25, amplitude * 0.36) +
    jagged(theta, phi, siteTheta, sitePhi, sigma * 0.72, amplitude)
  );
}

const RIDGE_PEAKS = [
  [0.78, 0.12, 0.09, 8.5],
  [1.48, 0.18, 0.08, 7.5],
  [0.92, 0.2, 0.08, 9],
  [1.34, 0.22, 0.07, 7.5],
  [1.02, 0.2, 0.11, 8],
] as const;

const VALLEY_MASSIFS = [
  [0.75, 0.2, 0.13, 14],
  [1.65, 0.22, 0.12, 12.5],
  [0.75, 0.78, 0.12, 13],
  [1.65, 0.82, 0.14, 14],
  [0.75, 1.48, 0.14, 15],
  [1.65, 1.54, 0.12, 13],
  [0.75, 2.45, 0.14, 13],
  [1.65, 2.5, 0.13, 14],
  [0.75, 3.55, 0.12, 14],
  [1.65, 3.62, 0.14, 13],
  [0.75, 4.65, 0.13, 14],
  [1.65, 4.72, 0.13, 12.5],
  [0.75, 5.55, 0.14, 13],
  [1.65, 5.62, 0.12, 14],
] as const;

const SECONDARY_MASSIFS = [
  [0.7, 0.75, 0.22, 2.8, 0.14, 6.7],
  [1.68, 0.85, 0.2, 2.5, 0.13, 5.9],
  [0.68, 1.45, 0.21, 2.7, 0.13, 6.2],
  [1.7, 1.5, 0.19, 2.4, 0.12, 5.3],
] as const;

export const MOUNTAIN_SUMMIT_CENTERS = [
  ...Object.values(SITES)
    .filter((site) => site.kind === "peak")
    .map(({ theta, phi }) => ({ theta, phi })),
  ...RIDGE_PEAKS.map(([theta, phi]) => ({ theta, phi })),
  ...VALLEY_MASSIFS.map(([theta, phi]) => ({ theta, phi })),
  ...SECONDARY_MASSIFS.map(([theta, phi]) => ({ theta, phi })),
];

/** Alpine elevation on the sphere — peaks, valleys, lakes, meadows. */
export function heightOffset(theta: number, phi: number): number {
  const p = sphToCart(1, theta, phi);
  const continents = fbm3(p.x * 1.35, p.y * 1.35, p.z * 1.35, 5, 2.05, 0.52, 11);
  const ridgeRaw = Math.abs(fbm3(p.x * 2.8, p.y * 2.8, p.z * 2.8, 5, 2.15, 0.5, 41));
  const ridges = Math.pow(ridgeRaw, 0.62);
  const detail = fbm3(p.x * 7.5, p.y * 7.5, p.z * 7.5, 3, 2.2, 0.5, 73);
  const roll = fbm3(p.x * 3.1, p.y * 3.1, p.z * 3.1, 3, 2.1, 0.5, 19);

  let h = 0.35 + continents * 0.85 + ridges * 1.05 + roll * 0.28 + detail * 0.16;

  h += massif(theta, phi, SITES.peakMatter.theta, SITES.peakMatter.phi, 0.32, 5.2);
  h += massif(theta, phi, SITES.peakEiger.theta, SITES.peakEiger.phi, 0.28, 4.6);
  h += massif(theta, phi, SITES.peakJung.theta, SITES.peakJung.phi, 0.26, 4.2);
  h += massif(theta, phi, SITES.peakSouth.theta, SITES.peakSouth.phi, 0.3, 3.8);
  h += massif(theta, phi, SITES.peakFar.theta, SITES.peakFar.phi, 0.24, 3.4);
  h += blob(theta, phi, SITES.cliffFace.theta, SITES.cliffFace.phi, 0.18, 2.2);

  for (const lake of LAKES) {
    const bearing = lakeBearing(theta, phi, lake);
    const sigma = (lake.radius * lakeShoreScale(lake, bearing)) / PLANET.radius;
    const d = angularDistance(theta, phi, lake.site.theta, lake.site.phi);
    h -= (lake.depth * 2) / 3 * Math.exp(-(d * d) / (2 * sigma * sigma));
  }

  h += blob(theta, phi, SITES.villageA.theta, SITES.villageA.phi, 0.14, 1.1);
  h += blob(theta, phi, SITES.villageB.theta, SITES.villageB.phi, 0.14, 1.0);
  h += blob(theta, phi, SITES.villageC.theta, SITES.villageC.phi, 0.13, 0.95);
  h += blob(theta, phi, SITES.meadowA.theta, SITES.meadowA.phi, 0.2, 0.55);

  // Peaks stand off the rails. Amplitudes stay under the height cap so the
  // ridge noise is not sliced into a plateau.
  for (const [peakTheta, peakPhi, sigma, amplitude] of RIDGE_PEAKS) {
    h += jagged(theta, phi, peakTheta, peakPhi, sigma, amplitude);
  }
  for (const [peakTheta, peakPhi, sigma, amplitude] of VALLEY_MASSIFS) {
    h += massif(theta, phi, peakTheta, peakPhi, sigma, amplitude);
  }
  for (const [peakTheta, peakPhi, blobSigma, blobAmplitude, ridgeSigma, ridgeAmplitude] of SECONDARY_MASSIFS) {
    h += blob(theta, phi, peakTheta, peakPhi, blobSigma, blobAmplitude);
    h += jagged(theta, phi, peakTheta, peakPhi, ridgeSigma, ridgeAmplitude);
  }

  // Narrow grass floor under the circuit so the train sits in a valley.
  const route: Array<[number, number]> = [
    [1.18, 0.0], [1.12, 0.35], [1.22, 0.72], [1.36, 0.95], [1.42, 1.2],
    [1.28, 1.55], [1.1, 1.85], [0.98, 2.15], [1.08, 2.45], [1.26, 2.7],
    [1.38, 3.05], [1.3, 3.4], [1.05, 3.75], [0.95, 4.05], [1.15, 4.4],
    [1.28, 4.75], [1.2, 5.15], [1.1, 5.5], [1.22, 5.85], [1.3, 6.1],
  ];
  let carve = 0;
  for (let i = 0; i < route.length; i++) {
    const aT = route[i][0];
    const aP = route[i][1];
    const b = route[(i + 1) % route.length];
    let bP = b[1] <= aP ? b[1] + Math.PI * 2 : b[1];
    const span = bP - aP;
    const steps = Math.max(1, Math.round(span / 0.05));
    for (let s = 0; s < steps; s++) {
      const u = s / steps;
      let p = aP + span * u;
      if (p > Math.PI * 2) p -= Math.PI * 2;
      const d = angularDistance(theta, phi, aT + (b[0] - aT) * u, p);
      if (d > 0.24) continue;
      carve = Math.max(carve, Math.exp(-(d * d) / (2 * 0.085 * 0.085)));
    }
  }
  h -= carve * 3.6;

  // Grain the mesh can actually resolve — pebbles and turf, not a new mountain.
  const grain = fbm3(p.x * 36.0, p.y * 36.0, p.z * 36.0, 2, 2.05, 0.5, 101);
  h += grain * 0.14;

  return shapeHeight(h * 1.65);
}

function shapeHeight(h: number): number {
  const cap = PLANET.maxHeight;
  const knee = cap * 0.82;
  if (h <= knee) return Math.max(PLANET.minHeight, h);
  const extra = cap - knee;
  return knee + extra * (1 - Math.exp(-(h - knee) / extra));
}

/** Soft snow-line factor 0..1 from elevation and latitude-ish theta. */
export function snowFactor(theta: number, height: number): number {
  const altitude = (height - 8.5) / 11.5;
  const polar = 1 - Math.sin(theta);
  return Math.max(0, Math.min(1, altitude * 0.85 + polar * 0.25));
}
