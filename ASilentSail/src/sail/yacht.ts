import { Group, Matrix4, MeshStandardMaterial, PointLight, Quaternion, Vector3 } from "three";
import { SAIL, WATER_LEVEL } from "../config";
import { cartToSph, wrap01 } from "../flight/math/sphere";
import {
  getSampleAt,
  PathSample,
  RailwayPath,
  scratchSample,
} from "../flight/railway/path";
import { setYachtLamps, waterTime, waveHeightAt } from "../planet/water";
import { createSailPath, FLEET_ROUTES } from "./path";
import { buildGuestYacht, buildHeroYacht } from "./yachtMesh";
import { heightOffset } from "../planet/height";

const basis = new Matrix4();
const right = new Vector3();
const targetQuat = new Quaternion();
const localBank = new Quaternion();
const bankAxis = new Vector3(0, 0, 1);
const currentFwd = new Vector3();
const turnAxis = new Vector3();
const worldPos = new Vector3();
const otherPos = new Vector3();
const lookAhead = freshSample();
const passSample = freshSample();
const probe = new Vector3();
const rel = new Vector3();
const hereOff = new Vector3();
const aheadOff = new Vector3();
const steer = new Vector3();
const push = new Vector3();
const radial = new Vector3();

const TURN = 0.34;
const LOOK_AHEAD = 9.2;
const LANE_OMEGA = 0.5;
const LANE_ZETA = 1.2;
const HEADING_ALIGN = 0.62;
const otherFwd = new Vector3();
const LAMP_MAX = 10;
const lampPositions = Array.from({ length: LAMP_MAX }, () => new Vector3());
const lampIntensities = new Array<number>(LAMP_MAX).fill(0);

const GUEST_NAMES = [
  "Quiet Harbor",
  "Lilac Wake",
  "Red Meridian",
  "Amber Reach",
  "Blue Orchard",
  "Copper Sound",
  "Gilded Jetty",
  "North Lantern",
  "Far Quay",
] as const;

function freshSample(): PathSample {
  return {
    position: new Vector3(),
    tangent: new Vector3(),
    normal: new Vector3(),
    binormal: new Vector3(),
    s: 0,
    trackRadius: 0,
    groundRadius: 0,
    elevation: 0,
    inTunnel: false,
    inCutting: false,
  };
}

export type YachtRole = "hero" | "guest";

export type YachtState = {
  name: string;
  role: YachtRole;
  distance: number;
  speed: number;
  /** Speed this yacht uses when it is not the selected hero. */
  cruise: number;
  baseSpeed: number;
  paths: RailwayPath[];
  pathIndex: number;
  craft: Group;
  posed: boolean;
  mastLight: PointLight;
  mastLens: MeshStandardMaterial;
  mastIntensity: number;
  lane: number;
  laneVel: number;
  laneTarget: number;
  passSide: number;
  id: number;
};

export type Fleet = {
  hero: YachtState;
  guests: YachtState[];
  order: YachtState[];
  root: Group;
  debugPaths: RailwayPath[];
};

export function createFleet(): Fleet {
  const order: YachtState[] = [];
  const debugPaths: RailwayPath[] = [];
  const names = ["Evening Tiger", ...GUEST_NAMES];
  for (let i = 0; i < FLEET_ROUTES.length; i++) {
    const path = createSailPath(768, FLEET_ROUTES[i]);
    debugPaths.push(path);
    const cruise = SAIL.speed * (0.62 + i * 0.03);
    const craft = i === 0 ? buildHeroYacht() : buildGuestYacht(i - 1);
    order.push(makeYacht(names[i], i === 0 ? "hero" : "guest", [path], (i * 0.37) % 1, craft, cruise, i));
  }
  const fleet: Fleet = {
    hero: order[0],
    guests: order.slice(1),
    order,
    root: new Group(),
    debugPaths,
  };
  grantHero(fleet, order[0]);
  fleet.root.name = "yacht-fleet";
  fleet.root.renderOrder = 12;
  fleet.root.add(...order.map((y) => y.craft));
  for (const craft of fleet.root.children) craft.renderOrder = 12;
  return fleet;
}

/** The next yacht in the fleet becomes the hero: camera subject and hero speed. */
export function focusNextYacht(fleet: Fleet): YachtState {
  const i = Math.max(0, fleet.order.indexOf(fleet.hero));
  const next = fleet.order[(i + 1) % fleet.order.length];
  grantHero(fleet, next);
  return next;
}

function grantHero(fleet: Fleet, next: YachtState): void {
  for (const y of fleet.order) {
    const hero = y === next;
    y.role = hero ? "hero" : "guest";
    y.baseSpeed = hero ? SAIL.speed * SAIL.heroMul : y.cruise;
    y.speed = y.baseSpeed;
  }
  fleet.hero = next;
  fleet.guests = fleet.order.filter((y) => y !== next);
}

function makeYacht(
  name: string,
  role: YachtRole,
  paths: RailwayPath[],
  startFrac: number,
  craft: Group,
  cruise: number,
  id: number,
): YachtState {
  craft.name = "sailboat";
  const visual = craft.getObjectByName("yacht-visual") as Group;
  const start = startFrac * paths[0].totalLength;
  const hero = role === "hero";
  return {
    name,
    role,
    distance: start,
    speed: hero ? SAIL.speed * SAIL.heroMul : cruise,
    cruise,
    baseSpeed: hero ? SAIL.speed * SAIL.heroMul : cruise,
    paths,
    pathIndex: 0,
    craft,
    posed: false,
    mastLight: craft.getObjectByName("masthead-lamp") as PointLight,
    mastLens: visual.userData.mastLens as MeshStandardMaterial,
    mastIntensity: visual.userData.mastIntensity as number,
    lane: 0,
    laneVel: 0,
    laneTarget: 0,
    passSide: 0,
    id,
  };
}

export function updateFleet(hero: YachtState, guests: YachtState[], dt: number): void {
  const all = [hero, ...guests];
  for (const y of all) {
    applyYield(y, all, dt);
    const path = activePath(y);
    y.distance = wrap01(y.distance + y.speed * dt, path.totalLength);
    pose(y, dt);
    updateMasthead(y);
  }
  separateHulls(all);
  for (let i = 0; i < LAMP_MAX; i++) {
    if (all[i]) {
      all[i].mastLight.getWorldPosition(lampPositions[i]);
      lampIntensities[i] = all[i].mastLight.intensity;
    } else {
      lampPositions[i].set(0, 0, 0);
      lampIntensities[i] = 0;
    }
  }
  setYachtLamps(lampPositions, lampIntensities);
}

export function collectYachtPositions(hero: YachtState, guests: YachtState[]): Vector3[] {
  return [hero, ...guests].map((y) => {
    y.craft.getWorldPosition(worldPos);
    return worldPos.clone();
  });
}

function activePath(y: YachtState): RailwayPath {
  return y.paths[Math.min(y.pathIndex, y.paths.length - 1)];
}

function laneOpen(path: RailwayPath, s: number, offset: number): boolean {
  for (const ds of [0, 2.8, 5.6, 8.4]) {
    getSampleAt(path, s + ds, passSample);
    probe.copy(passSample.position).addScaledVector(passSample.binormal, offset);
    const sph = cartToSph(probe);
    if (WATER_LEVEL - heightOffset(sph.theta, sph.phi) < SAIL.islandClearance) return false;
  }
  return true;
}

function applyYield(y: YachtState, fleet: YachtState[], dt: number): void {
  const path = activePath(y);
  const here = getSampleAt(path, y.distance, scratchSample());
  y.craft.getWorldPosition(worldPos);

  let landThreat = 0;
  const aheadS = y.distance + SAIL.lookAhead;
  getSampleAt(path, aheadS, lookAhead);
  const sph = cartToSph(lookAhead.position);
  const depth = WATER_LEVEL - heightOffset(sph.theta, sph.phi);
  if (depth < SAIL.islandClearance) {
    landThreat = Math.max(landThreat, 1 - Math.max(0, depth) / SAIL.islandClearance);
  }

  let traffic = 0;
  let holdPass = false;
  let spottedSide = 0;

  currentFwd.set(0, 0, 1).applyQuaternion(y.craft.quaternion);

  for (const other of fleet) {
    if (other === y) continue;
    other.craft.getWorldPosition(otherPos);
    const dist = worldPos.distanceTo(otherPos);
    rel.copy(otherPos).sub(worldPos);
    const ahead = rel.dot(here.tangent);
    const side = rel.dot(here.binormal);
    otherFwd.set(0, 0, 1).applyQuaternion(other.craft.quaternion);
    const aligned = y.posed && other.posed ? currentFwd.dot(otherFwd) > HEADING_ALIGN : true;
    const stillNear = dist < SAIL.passRange + 1.4;
    const notYetClear = ahead > -SAIL.passHoldAstern;
    const wouldCutIn = dist < SAIL.passClear + 1.6 && Math.abs(side) < SAIL.passOffset * 0.92;
    const faster = y.baseSpeed > other.baseSpeed * 1.06;
    const sameCourse = aligned && stillNear && notYetClear && ahead > 0.4;

    if (dist < SAIL.hullClear) {
      const rear = ahead > -0.2 || (Math.abs(ahead) <= 0.2 && y.id > other.id);
      if (rear) traffic = Math.max(traffic, 1 - dist / SAIL.hullClear);
      const away = Math.abs(side) < 0.08 ? (y.id > other.id ? 1 : -1) : -Math.sign(side);
      holdPass = true;
      if (spottedSide === 0) spottedSide = away;
    } else if (sameCourse && faster) {
      holdPass = true;
      if (spottedSide === 0) spottedSide = side >= 0 ? -1 : 1;
    } else if (ahead > 0.25 && dist < SAIL.yieldDistance) {
      traffic = Math.max(traffic, 1 - dist / SAIL.yieldDistance);
    }
    if (wouldCutIn && aligned && faster) holdPass = true;
    if (y.passSide !== 0 && aligned && stillNear && notYetClear) holdPass = true;
  }

  let targetLane = 0;
  if (holdPass) {
    if (y.passSide === 0) y.passSide = spottedSide || (y.lane >= 0 ? 1 : -1);
    const wide = y.passSide * SAIL.passOffset;
    if (laneOpen(path, y.distance, wide)) targetLane = wide;
    else traffic = Math.max(traffic, 0.75);
  } else if (Math.abs(y.lane) < 0.12 && Math.abs(y.laneVel) < 0.08) {
    y.passSide = 0;
    targetLane = 0;
  } else {
    targetLane = 0;
  }

  y.laneTarget = targetLane;
  const accel = -2 * LANE_ZETA * LANE_OMEGA * y.laneVel - LANE_OMEGA * LANE_OMEGA * (y.lane - targetLane);
  y.laneVel += accel * dt;
  y.laneVel = Math.max(-0.85, Math.min(0.85, y.laneVel));
  y.lane += y.laneVel * dt;
  if (targetLane === 0 && Math.abs(y.lane) < 0.04 && Math.abs(y.laneVel) < 0.05) {
    y.lane = 0;
    y.laneVel = 0;
    y.passSide = 0;
  }

  const slow = y.passSide !== 0 ? 0.16 : 0.62;
  const target = y.baseSpeed * (1 - landThreat * 0.62 - traffic * slow);
  const k = 1 - Math.exp(-2.6 * dt);
  y.speed += (target - y.speed) * k;
  y.speed = Math.max(SAIL.minSpeed, Math.min(y.baseSpeed * 1.04, y.speed));
}

function pose(y: YachtState, dt: number): void {
  const path = activePath(y);
  const f = getSampleAt(path, y.distance, scratchSample());
  const ahead = getSampleAt(path, y.distance + LOOK_AHEAD, lookAhead);
  const bob = waveHeightAt(f.normal, waterTime.value);
  const lookLane = y.lane + (y.laneTarget - y.lane) * 0.35;
  hereOff.copy(f.position).addScaledVector(f.binormal, y.lane);
  aheadOff.copy(ahead.position).addScaledVector(ahead.binormal, lookLane);
  y.craft.position.copy(hereOff).addScaledVector(f.normal, bob);

  steer.copy(aheadOff).sub(hereOff);
  if (steer.lengthSq() < 1e-6) steer.copy(ahead.tangent);
  else steer.normalize();

  right.crossVectors(f.normal, steer);
  if (right.lengthSq() < 1e-8) right.copy(f.binormal).negate();
  else right.normalize();
  basis.makeBasis(right, f.normal, steer);
  targetQuat.setFromRotationMatrix(basis);

  if (!y.posed) {
    y.craft.quaternion.copy(targetQuat);
    y.posed = true;
    return;
  }

  currentFwd.set(0, 0, 1).applyQuaternion(y.craft.quaternion);
  turnAxis.crossVectors(currentFwd, steer);
  const turn = Math.max(-0.22, Math.min(0.22, turnAxis.dot(f.normal)));
  const bank = -turn * 0.55 - Math.sign(y.laneTarget - y.lane) * Math.min(0.18, Math.abs(y.laneTarget - y.lane) * 0.08);
  localBank.setFromAxisAngle(bankAxis, bank);
  targetQuat.multiply(localBank);
  const k = 1 - Math.exp(-TURN * dt);
  y.craft.quaternion.slerp(targetQuat, k);
}

function separateHulls(fleet: YachtState[]): void {
  const minDist = SAIL.hullClear;
  for (let i = 0; i < fleet.length; i++) {
    fleet[i].craft.getWorldPosition(worldPos);
    for (let j = i + 1; j < fleet.length; j++) {
      fleet[j].craft.getWorldPosition(otherPos);
      const dist = worldPos.distanceTo(otherPos);
      if (dist >= minDist || dist < 1e-5) continue;
      push.copy(worldPos).sub(otherPos);
      radial.copy(worldPos).normalize();
      push.addScaledVector(radial, -push.dot(radial));
      if (push.lengthSq() < 1e-8) {
        push.copy(fleet[i].craft.getWorldDirection(currentFwd));
        push.cross(radial);
      }
      push.normalize();
      const need = (minDist - dist) * 0.52;
      fleet[i].craft.position.addScaledVector(push, need);
      fleet[j].craft.position.addScaledVector(push, -need);
      worldPos.copy(fleet[i].craft.position);
    }
  }
}

function updateMasthead(y: YachtState): void {
  y.mastLight.intensity = y.mastIntensity;
  y.mastLens.emissiveIntensity = 1.11;
}
