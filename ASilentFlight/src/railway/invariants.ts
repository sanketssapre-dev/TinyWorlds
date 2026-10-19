import { TRACK, planetToLocoRatio } from "../config";
import { sphToCart } from "../math/sphere";
import { SITES } from "../planet/features";
import { RailwayPath, getSampleAt } from "./path";
import { PierSpec } from "./trackSupport";

export type CheckResult = { name: string; ok: boolean; detail: string };

export function checkClosedLoop(path: RailwayPath): CheckResult {
  const first = path.samples[0].position;
  const lastCopy = path.samples[path.samples.length - 1].position;
  const lastUnique = path.samples[path.samples.length - 2].position;
  const duplicateGap = first.distanceTo(lastCopy);
  const step = lastUnique.distanceTo(first);
  const expected = path.totalLength / (path.samples.length - 1);
  return {
    name: "closed-loop position continuity",
    ok: duplicateGap < 1e-4 && step < expected * 2.5,
    detail: `duplicate seam ${duplicateGap.toExponential(3)}, unique step ${step.toFixed(4)} (expected ~${expected.toFixed(4)})`,
  };
}

export function checkTangentContinuity(path: RailwayPath): CheckResult {
  const a = path.samples[0].tangent;
  const b = path.samples[path.samples.length - 2].tangent;
  const ang = Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
  return {
    name: "tangent continuity at seam",
    ok: ang < 0.12,
    detail: `seam tangent angle ${ang.toFixed(4)} rad`,
  };
}

export function checkFinite(path: RailwayPath): CheckResult {
  for (const s of path.samples) {
    const vals = [
      s.position.x,
      s.position.y,
      s.position.z,
      s.tangent.x,
      s.normal.x,
      s.binormal.x,
    ];
    if (vals.some((v) => !Number.isFinite(v))) {
      return { name: "finite path coordinates", ok: false, detail: "non-finite value" };
    }
  }
  return { name: "finite path coordinates", ok: true, detail: `${path.samples.length} samples` };
}

export function checkScaleRatio(): CheckResult {
  const r = planetToLocoRatio();
  return {
    name: "planet-to-locomotive scale ratio",
    ok: Math.abs(r - 60) < 1e-9,
    detail: `ratio ${r}:1`,
  };
}

export function checkSeamTraversal(path: RailwayPath): CheckResult {
  const before = getSampleAt(path, path.totalLength - 0.05);
  const at = getSampleAt(path, 0);
  const after = getSampleAt(path, 0.05);
  const step1 = before.position.distanceTo(at.position);
  const step2 = at.position.distanceTo(after.position);
  const ok = step1 < 0.2 && step2 < 0.2 && Number.isFinite(step1);
  return {
    name: "stable traversal across loop seam",
    ok,
    detail: `steps ${step1.toFixed(4)}, ${step2.toFixed(4)}`,
  };
}

export function checkTrackSeated(path: RailwayPath): CheckResult {
  let buried = 0;
  let tunnels = 0;
  let cuttings = 0;
  let min = Infinity;
  for (const s of path.samples) {
    if (s.inTunnel) tunnels++;
    if (s.inCutting) cuttings++;
    if (!s.inTunnel && !s.inCutting && s.elevation < -0.08) buried++;
    if (s.elevation < min) min = s.elevation;
  }
  return {
    name: "track seated, cut, or tunnelled",
    ok: buried === 0,
    detail: `buried ${buried}, cuttings ${cuttings}, tunnel samples ${tunnels}, min elev ${min.toFixed(3)}`,
  };
}

export function checkOutwardFrames(path: RailwayPath): CheckResult {
  let worst = 1;
  for (const s of path.samples) {
    const align = s.normal.dot(s.position.clone().normalize());
    if (align < worst) worst = align;
  }
  return {
    name: "track up-axis stays outward",
    ok: worst > 0.35,
    detail: `min normal·radial ${worst.toFixed(3)}`,
  };
}

export function checkFrameSteps(path: RailwayPath): CheckResult {
  let maxTangent = 0;
  let maxNormal = 0;
  for (let i = 1; i < path.samples.length; i++) {
    const a = path.samples[i - 1];
    const b = path.samples[i];
    const ta = Math.acos(Math.min(1, Math.max(-1, a.tangent.dot(b.tangent))));
    const na = Math.acos(Math.min(1, Math.max(-1, a.normal.dot(b.normal))));
    if (ta > maxTangent) maxTangent = ta;
    if (na > maxNormal) maxNormal = na;
  }
  return {
    name: "frame continuity between samples",
    ok: maxTangent < 0.45 && maxNormal < 0.45,
    detail: `max tangent step ${maxTangent.toFixed(3)} rad, normal ${maxNormal.toFixed(3)} rad`,
  };
}

export function checkRouteVisits(path: RailwayPath): CheckResult {
  const goals: [string, number][] = [
    ["village", 9],
    ["lake", 6],
    ["lake2", 7],
    ["castle", 14],
    ["ancientTree", 9],
    ["tower", 11],
    ["shrine", 11],
    ["cliff", 14],
    ["arch", 8],
    ["peakWest", 8],
  ];
  const missed: string[] = [];
  for (const [name, limit] of goals) {
    const site = SITES[name];
    let best = Infinity;
    for (let i = 0; i < path.samples.length - 1; i += 3) {
      const atSite = sphToCart(path.samples[i].position.length(), site.theta, site.phi);
      best = Math.min(best, path.samples[i].position.distanceTo(atSite));
    }
    if (best > limit) missed.push(`${name} ${best.toFixed(1)}>${limit}`);
  }
  return {
    name: "route visits landmarks",
    ok: missed.length === 0,
    detail: missed.length ? missed.join("; ") : "landmarks lie along the circuit",
  };
}

export function checkPierReach(path: RailwayPath, piers: PierSpec[]): CheckResult {
  let unsupported = 0;
  const elevated = path.samples.filter(
    (s) => !s.inTunnel && !s.inCutting && s.elevation >= TRACK.elevatedThreshold,
  );
  for (const s of elevated) {
    let near = false;
    for (const pier of piers) {
      if (pier.top.distanceTo(s.position) <= TRACK.pierSpacing * 1.4) {
        near = true;
        break;
      }
    }
    if (!near) unsupported++;
  }
  const grounded = piers.every((p) => p.bottom.length() < p.top.length() - 0.05 && p.height > 0.3);
  return {
    name: "piers reach elevated track and the ground",
    ok: (elevated.length === 0 || (piers.length > 0 && unsupported === 0)) && grounded,
    detail: `${elevated.length} elevated samples, ${piers.length} piers, unsupported ${unsupported}`,
  };
}

export function checkGauge(): CheckResult {
  return {
    name: "consistent track gauge",
    ok: TRACK.gauge > 0.15 && TRACK.gauge < 0.5,
    detail: `gauge ${TRACK.gauge}`,
  };
}

export function checkElevatedSupport(path: RailwayPath, pierCount: number): CheckResult {
  const elevated = path.samples.filter((s) => s.elevation >= TRACK.elevatedThreshold);
  const ok = elevated.length === 0 || pierCount > 0;
  return {
    name: "supported elevated railway sections",
    ok,
    detail: `${elevated.length} elevated samples, ${pierCount} piers`,
  };
}

export function runPathChecks(path: RailwayPath, piers: PierSpec[]): CheckResult[] {
  return [
    checkScaleRatio(),
    checkClosedLoop(path),
    checkTangentContinuity(path),
    checkFinite(path),
    checkSeamTraversal(path),
    checkGauge(),
    checkElevatedSupport(path, piers.length),
    checkTrackSeated(path),
    checkOutwardFrames(path),
    checkFrameSteps(path),
    checkRouteVisits(path),
    checkPierReach(path, piers),
  ];
}
