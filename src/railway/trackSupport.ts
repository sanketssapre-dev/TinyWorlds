import { Vector3 } from "three";
import { TRACK } from "../config";
import { PathSample, RailwayPath } from "./path";

export type PierSpec = {
  top: Vector3;
  bottom: Vector3;
  height: number;
  sample: PathSample;
};

export function collectPierPositions(path: RailwayPath): PierSpec[] {
  const piers: PierSpec[] = [];
  let since = Infinity;
  for (let i = 0; i < path.samples.length - 1; i++) {
    const s = path.samples[i];
    const next = path.samples[i + 1];
    const elevated = isElevated(s) && s.elevation > 0.38;
    if (!elevated) {
      since = Infinity;
      continue;
    }
    const step = s.position.distanceTo(next.position);
    if (since !== Infinity && since + step < TRACK.pierSpacing) {
      since += step;
      continue;
    }
    const radial = s.position.clone().normalize();
    const top = s.position.clone().addScaledVector(radial, -0.1);
    const bottom = radial.clone().multiplyScalar(Math.max(PLANET_FLOOR, s.groundRadius - 0.12));
    const height = top.distanceTo(bottom);
    if (height < 0.32 || bottom.length() >= top.length() - 0.05) {
      since = 0;
      continue;
    }
    piers.push({ top, bottom, height, sample: s });
    since = 0;
  }
  return piers;
}

const PLANET_FLOOR = 40;

export function isElevated(sample: PathSample): boolean {
  return !sample.inTunnel && sample.elevation >= TRACK.elevatedThreshold;
}
