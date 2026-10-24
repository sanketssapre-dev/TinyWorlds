import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  SphereGeometry,
  Uniform,
  Vector3,
} from "three";
import { FLIGHT, PLANET, SEARCH_LIGHT } from "../config";
import { cartToSph, wrap01 } from "../math/sphere";
import { heightOffset } from "../planet/height";
import { mergeRigidMeshes } from "../render/mergeRigid";
import { getSampleAt, nearestSampleDistance, scratchSample } from "./path";
import type { FlightPath, PathSample } from "./path";

const basis = new Matrix4();
const targetQuat = new Quaternion();
const sunDirection = new Vector3(90, 55, 35).normalize();
const groundNormal = new Vector3();

/** How briskly the nose comes round. Slow enough to feel deliberate. */
const MAX_TURN_RATE = 0.32; // rad/s
/** How far the wings lean into a turn — about 24 degrees. */
const MAX_BANK = 0.42; // rad
const STEER_SMOOTHING = 2.6; // 1/s
const BANK_SMOOTHING = 2.2; // 1/s
/** How quickly the calm cruise reference settles onto new terrain. */
const GROUND_SMOOTHING = 0.2; // 1/s
/** How quickly the clearance envelope follows the ground ahead. */
const CEILING_SMOOTHING = 4; // 1/s
/** Terrain is sampled this far ahead of the nose, so the climb starts early. */
const CLIMB_LOOKAHEAD = 9;
const CLIMB_SAMPLES = 10;
/** How loosely the soft maximum blends those samples, in world units. */
const CLIMB_SOFTNESS = 6;
/** How fast the pilot's height request takes effect. Deliberately slow. */
const CLIMB_RATE = 0.8; // units/s
/** How gently the height request eases in and out. */
const CLIMB_SMOOTHING = 2.2; // 1/s
/** How far the nose lifts at a full-rate climb — about 10 degrees. */
const MAX_PITCH = 0.18; // rad
/** Over how much remaining height the nose levels off near a limit. */
const PITCH_FADE = 1; // units
/** How hard the autopilot answers a heading error. */
const HEADING_GAIN = 1.6;
/** How hard it answers standing off the route to one side, once close. */
const LATERAL_GAIN = 0.12;
/** How far ahead of the craft it aims while tracking the route. */
const TRACK_LOOKAHEAD = 4;
/** Beyond this distance from the route, joining it matters more than tracking it. */
const JOIN_RANGE = 25;
/** How far ahead the route's bend is read, to turn into it rather than after it. */
const BEND_LOOKAHEAD = 8;
/** How far a height difference may build before it is corrected. */
const CLIMB_GAIN = 2;

/** Who is flying the craft: the route, or the pilot. */
export type FlightMode = "autopilot" | "manual";

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/** Project a vector onto the tangent plane at `radial`, as a unit vector. */
function tangentPlane(v: Vector3, radial: Vector3): Vector3 {
  const out = v.clone();
  out.addScaledVector(radial, -out.dot(radial));
  if (out.lengthSq() < 1e-12) out.copy(new Vector3(0, 1, 0).cross(radial));
  out.normalize();
  return out;
}

const cream = new MeshStandardMaterial({ color: "#e6d3ae", roughness: 0.55 });
const wing = new MeshStandardMaterial({ color: "#7a3030", roughness: 0.5 });
const wood = new MeshStandardMaterial({ color: "#3a2a20", roughness: 0.78 });
const brass = new MeshStandardMaterial({ color: "#c6a15a", roughness: 0.38, metalness: 0.45 });
const dark = new MeshStandardMaterial({ color: "#221c16", roughness: 0.65 });
const leather = new MeshStandardMaterial({ color: "#4a3024", roughness: 0.7 });
const canopyGlass = new MeshPhysicalMaterial({
  color: "#9fd0d8",
  roughness: 0.12,
  metalness: 0.02,
  transparent: true,
  opacity: 0.38,
  clearcoat: 0.9,
  clearcoatRoughness: 0.08,
  depthWrite: false,
  side: DoubleSide,
});
const searchLightLens = new MeshStandardMaterial({
  color: "#fff0ce",
  emissive: "#ffcf78",
  emissiveIntensity: 0.65,
  roughness: 0.22,
});
const propWood = makePropellerWood();

export type FlightState = {
  /** Unit vector from the planet centre to the craft: where it is on the sphere. */
  dir: Vector3;
  /** Unit tangent at `dir`: the direction the nose points. */
  heading: Vector3;
  /** Smoothed yaw rate. Positive means steering right. */
  turnRate: number;
  /** Smoothed roll. Positive means banking right. */
  bankAngle: number;
  /** Ride height above PLANET.radius, following terrain within graceful bounds. */
  ride: number;
  /** Slowly-tracked terrain height beneath the craft: the calm cruise reference. */
  ground: number;
  /** Smoothed upper bound on the ground ahead: the clearance reference. */
  ceiling: number;
  /** Smoothed rate of the pilot's height request. */
  climbRate: number;
  /** Height the pilot has added on top of the terrain-following baseline. */
  climb: number;
  speed: number;
  distance: number;
  craft: Group;
  propeller: Group;
  searchLight: GroundSearchLight;
  wingLights: MeshStandardMaterial[];
  spin: number;
  posed: boolean;
  /** Who is flying: the route, or the pilot. */
  mode: FlightMode;
};

export type GroundSearchLight = {
  position: Vector3;
  direction: Vector3;
  intensity: Uniform<number>;
};

const searchLightLocalPosition = new Vector3(0, -0.2, -0.12);
const searchLightLocalDirection = new Vector3(0, -11.8, 1.62).normalize();

export function createFlight(start: PathSample): FlightState {
  const craft = buildBiplane();
  const propeller = craft.getObjectByName("propeller") as Group;
  const wingLights = craft.userData.wingLights as MeshStandardMaterial[];

  const dir = start.position.clone().normalize();
  const heading = start.tangent.clone();
  heading.addScaledVector(dir, -heading.dot(dir));
  if (heading.lengthSq() < 1e-12) heading.copy(new Vector3(0, 1, 0).cross(dir));
  heading.normalize();

  // Start already settled on the ground beneath and the ground ahead, so there
  // is no first-frame lurch in altitude.
  const ground = groundAt(dir);
  const ceiling = highestGroundAhead(dir, heading);

  const state: FlightState = {
    dir,
    heading,
    turnRate: 0,
    bankAngle: 0,
    ride: Math.max(ground + FLIGHT.cruise, ceiling + FLIGHT.minClearance),
    ground,
    ceiling,
    climbRate: 0,
    climb: 0,
    speed: FLIGHT.speed,
    distance: 0,
    craft,
    propeller,
    searchLight: {
      position: new Vector3(),
      direction: new Vector3(),
      intensity: new Uniform(0),
    },
    wingLights,
    spin: 0,
    posed: false,
    mode: "autopilot",
  };

  applyPose(state, 0);
  return state;
}

/**
 * Fly the craft for one step.
 *
 * `turnInput` is -1 for left, +1 for right. `climbInput` is +1 for up, -1 for
 * down, and only ever adds height on top of the terrain-following baseline.
 *
 * The craft's own heading is the only thing steering touches: the route is
 * traced from it afterwards, so the nose always leads and the path follows.
 */
export function updateFlight(
  state: FlightState,
  dt: number,
  turnInput = 0,
  climbInput = 0,
): void {
  const radial = state.dir;

  // Ease the yaw rate toward what the keys ask for, so the nose swings over
  // rather than snapping.
  const targetTurnRate = turnInput * MAX_TURN_RATE;
  state.turnRate += (targetTurnRate - state.turnRate) * (1 - Math.exp(-STEER_SMOOTHING * dt));

  // A positive rotation about the local up axis swings the nose to the LEFT,
  // so steering right is a negative rotation.
  state.heading.applyAxisAngle(radial, -state.turnRate * dt);

  // Lean the wings into the turn. A positive roll about the nose line drops the
  // right wing, so banking right takes a positive angle.
  const targetBank = turnInput * MAX_BANK;
  state.bankAngle += (targetBank - state.bankAngle) * (1 - Math.exp(-BANK_SMOOTHING * dt));

  // Fly forward along the heading. Turning both the position and the heading
  // about the same axis keeps them exactly square, so nothing drifts.
  const travel = new Vector3().crossVectors(radial, state.heading).normalize();
  const step = (state.speed * dt) / (PLANET.radius + state.ride);
  radial.applyAxisAngle(travel, step);
  state.heading.applyAxisAngle(travel, step);

  // Ride the terrain, between two smoothed references: a calm cruise above the
  // ground underfoot, and a clearance floor above the highest ground ahead.
  // Both are smoothed, and the floor uses a soft maximum, so the ride never
  // steps when the tallest thing ahead changes.
  const under = groundAt(radial);
  state.ground += (under - state.ground) * (1 - Math.exp(-GROUND_SMOOTHING * dt));
  const envelope = highestGroundAhead(radial, state.heading);
  state.ceiling += (envelope - state.ceiling) * (1 - Math.exp(-CEILING_SMOOTHING * dt));

  // The pilot's own height request, layered on top of that baseline. It eases
  // in and out so a tap or a release never jolts the craft, and it can only
  // ever add height — the terrain-following figure stays the floor.
  const wantedRate = climbInput * CLIMB_RATE;
  state.climbRate += (wantedRate - state.climbRate) * (1 - Math.exp(-CLIMB_SMOOTHING * dt));
  state.climb = Math.min(FLIGHT.maxClimb, Math.max(0, state.climb + state.climbRate * dt));

  state.ride =
    Math.max(state.ground + FLIGHT.cruise, state.ceiling + FLIGHT.minClearance) + state.climb;

  state.distance += state.speed * dt;
  state.spin += dt * 22;
  applyPose(state, dt);
  state.propeller.rotation.z = state.spin;
  updateWingLights(state.wingLights, state.spin / 22);
}

/** Terrain height, in world units above PLANET.radius, at a unit direction. */
function groundAt(dir: Vector3): number {
  const sph = cartToSph(dir);
  return heightOffset(sph.theta, sph.phi);
}

/**
 * A smooth upper bound on the ground between here and CLIMB_LOOKAHEAD units
 * along the heading.
 *
 * This is a *soft* maximum: a hard one steps whenever the tallest sample
 * changes, and that step is what makes an altitude profile jink. The soft form
 * is always at or above the true maximum, so it is still a safe clearance
 * reference — it just arrives smoothly.
 */
function highestGroundAhead(dir: Vector3, heading: Vector3): number {
  const axis = new Vector3().crossVectors(dir, heading).normalize();
  const probe = new Vector3();
  const perUnit = 1 / (PLANET.radius + PLANET.maxHeight + FLIGHT.cruise);

  const samples: number[] = [groundAt(dir)];
  for (let i = 1; i <= CLIMB_SAMPLES; i++) {
    const arc = (i / CLIMB_SAMPLES) * CLIMB_LOOKAHEAD;
    probe.copy(dir).applyAxisAngle(axis, arc * perUnit);
    samples.push(groundAt(probe));
  }

  const peak = Math.max(...samples);
  let sum = 0;
  for (const ground of samples) sum += Math.exp(CLIMB_SOFTNESS * (ground - peak));
  return peak + Math.log(sum) / CLIMB_SOFTNESS;
}

/** 0 at a limit, 1 once there is room to spare. Smooth, so nothing snaps. */
function roomFactor(room: number): number {
  const t = Math.max(0, Math.min(1, room));
  return t * t * (3 - 2 * t);
}

/**
 * Hand the craft to the route.
 *
 * Nothing is reset: the craft keeps its position, heading and height, and the
 * autopilot steers it onto the course from there. That is what makes the
 * handover feel like the craft flying rather than being carried.
 */
export function enterAutopilot(state: FlightState): void {
  state.mode = "autopilot";
}

/**
 * Fly the craft along the route by steering it, the way a pilot would.
 *
 * The craft is never placed on the route. A heading error and a cross-track
 * error become the same `turnInput` the arrow keys produce, and the ordinary
 * flight step does the rest — so the rudder is visibly working, the craft leans
 * into its own turns, and the camera follows the craft rather than a curve.
 */
export function updateAutopilot(state: FlightState, path: FlightPath, dt: number): void {
  const nearest = nearestSampleDistance(path, state.craft.position);
  const here = getSampleAt(path, nearest, scratchSample());

  // How far off the route the craft is. Far away, the only thing that matters
  // is getting back to it; close in, it is worth hugging the line. Aiming at
  // the route's nearest point is what stops a distant craft from turning in
  // circles — a turn input pinned at full deflection flies a circle, and a
  // circle never arrives anywhere.
  const distance = state.craft.position.distanceTo(here.position);
  const tracking = clamp(1 - distance / JOIN_RANGE, 0, 1);

  const ahead = getSampleAt(path, nearest + TRACK_LOOKAHEAD * tracking, scratchSample());
  const wanted = tangentPlane(
    new Vector3().subVectors(ahead.position, state.craft.position),
    state.dir,
  );

  // Positive when the route lies to the craft's right — the same sign a
  // positive turnInput steers.
  const side = new Vector3().crossVectors(state.dir, state.heading).normalize();
  const headingError = -new Vector3().subVectors(wanted, state.heading).dot(side);

  // Standing off to one side. Scaled by `tracking` so it only acts once the
  // craft is close: at a distance the join above has to be free to use the
  // whole turn budget, and a saturated lateral term is what made a distant
  // craft circle instead of arriving.
  const lateral = new Vector3().subVectors(state.craft.position, here.position).dot(here.binormal);

  // Feedforward: the route's own bend, read a little way ahead, so the craft
  // turns into a curve instead of discovering it and cutting the corner.
  const bendSample = getSampleAt(path, nearest + BEND_LOOKAHEAD, scratchSample());
  const bendCross = new Vector3().crossVectors(here.tangent, bendSample.tangent);
  const bend = Math.atan2(bendCross.dot(here.normal), here.tangent.dot(bendSample.tangent));
  const bendInput = clamp(-(bend * state.speed) / (BEND_LOOKAHEAD * MAX_TURN_RATE), -1, 1);

  const turnInput = clamp(
    headingError * HEADING_GAIN - lateral * LATERAL_GAIN * tracking + bendInput * tracking,
    -1,
    1,
  );
  const climbInput = clamp((here.elevation - state.ride) / CLIMB_GAIN, -1, 1);

  updateFlight(state, dt, turnInput, climbInput);
  state.distance = wrap01(state.distance, path.totalLength);
}

/**
 * Take the craft back from the route.
 *
 * Nothing to undo: the craft was flying under its own power the whole time, so
 * handing it back changes only who is steering.
 */
export function exitAutopilot(state: FlightState): void {
  state.mode = "manual";
}

/**
 * Put the craft where its own state says it is.
 *
 * Nothing here consults a pre-computed route: the craft is the source of truth
 * and the route is traced from it, so the nose is never overruled by a curve.
 */
function applyPose(state: FlightState, dt: number): void {
  const forward = state.heading.clone().normalize();
  const up = state.dir.clone();

  // Pitch: lift the nose into a climb and drop it into a descent, so a change
  // of height actually reads. Rotating both the nose and the roof about the
  // wing line keeps the frame square. The angle is a fraction of the true
  // flight-path angle — enough to see, not enough to look like a stunt.
  //
  // It also levels off as the craft runs out of height to give, so holding the
  // key at the ceiling does not leave it nose-up for ever.
  const wanted = state.climbRate / CLIMB_RATE;
  const room = wanted > 0 ? FLIGHT.maxClimb - state.climb : state.climb;
  const lift = wanted * roomFactor(room / PITCH_FADE) * MAX_PITCH;
  if (lift !== 0) {
    const wing = new Vector3().crossVectors(forward, up).normalize();
    forward.applyAxisAngle(wing, lift);
    up.applyAxisAngle(wing, lift);
  }

  // Roll about the nose line.
  up.applyAxisAngle(forward, state.bankAngle).normalize();

  // Right-handed basis: for a model whose nose is +z and up is +y, the third
  // axis is up x forward. (forward x up would be left-handed, and would hand
  // setFromRotationMatrix a mirror instead of a rotation.)
  const side = new Vector3().crossVectors(up, forward).normalize();

  basis.makeBasis(side, up, forward);
  targetQuat.setFromRotationMatrix(basis);
  state.craft.quaternion.copy(targetQuat);
  state.posed = true;

  state.craft.position.copy(state.dir).multiplyScalar(PLANET.radius + state.ride);
  updateSearchLight(state, dt);
}

function buildBiplane(): Group {
  const g = new Group();
  g.name = "biplane";
  const hold = new Group();

  const body = new CylinderGeometry(0.16, 0.15, 1.25, 12);
  body.rotateX(Math.PI / 2);
  addGeo(hold, body, cream, 0, 0.28, -0.02);

  const nose = new CylinderGeometry(0.16, 0.155, 0.2, 16);
  nose.rotateX(Math.PI / 2);
  addGeo(hold, nose, brass, 0, 0.28, 0.69);
  const noseCap = new Mesh(new SphereGeometry(1, 16, 10), brass);
  noseCap.name = "rounded-engine-cowling";
  noseCap.position.set(0, 0.28, 0.77);
  noseCap.scale.set(0.155, 0.14, 0.1);
  noseCap.castShadow = true;
  hold.add(noseCap);

  add(hold, new BoxGeometry(0.22, 0.08, 0.2), leather, 0, 0.4, 0.12);
  addGeo(hold, new SphereGeometry(0.055, 8, 6), dark, 0, 0.44, 0.1);
  addCockpitCanopy(hold);
  addSearchLightFixture(hold);

  add(hold, new BoxGeometry(2.25, 0.035, 0.52), wing, 0, 0.16, 0.05);
  add(hold, new BoxGeometry(2.7, 0.03, 0.46), wing, 0, 0.62, 0.0);
  add(hold, new BoxGeometry(0.08, 0.04, 0.52), wood, -1.1, 0.16, 0.05);
  add(hold, new BoxGeometry(0.08, 0.04, 0.52), wood, 1.1, 0.16, 0.05);
  add(hold, new BoxGeometry(0.08, 0.035, 0.46), wood, -1.32, 0.62, 0);
  add(hold, new BoxGeometry(0.08, 0.035, 0.46), wood, 1.32, 0.62, 0);

  for (const x of [-0.55, 0.55]) {
    add(hold, new BoxGeometry(0.03, 0.46, 0.03), wood, x, 0.39, 0.16);
    add(hold, new BoxGeometry(0.025, 0.46, 0.025), wood, x, 0.39, -0.08);
  }
  add(hold, new BoxGeometry(0.02, 0.46, 0.02), wood, -0.16, 0.39, 0.02);
  add(hold, new BoxGeometry(0.02, 0.46, 0.02), wood, 0.16, 0.39, 0.02);

  add(hold, new BoxGeometry(0.78, 0.03, 0.26), wing, 0, 0.34, -0.7);
  add(hold, new BoxGeometry(0.035, 0.32, 0.3), wing, 0, 0.5, -0.74);
  add(hold, new BoxGeometry(0.02, 0.16, 0.12), cream, 0, 0.62, -0.86);

  for (const x of [-0.18, 0.18]) {
    add(hold, new BoxGeometry(0.025, 0.2, 0.025), wood, x, 0.1, 0.22);
    const wheel = new Mesh(new CylinderGeometry(0.075, 0.075, 0.035, 12), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.02, 0.22);
    wheel.castShadow = true;
    hold.add(wheel);
    const hub = new CylinderGeometry(0.028, 0.028, 0.05, 8);
    hub.rotateZ(Math.PI / 2);
    addGeo(hold, hub, brass, x, 0.02, 0.22);
  }
  add(hold, new BoxGeometry(0.4, 0.02, 0.02), wood, 0, 0.02, 0.22);
  add(hold, new BoxGeometry(0.02, 0.08, 0.12), wood, 0, 0.08, -0.78);

  for (const x of [-0.12, 0.12]) {
    const pipe = new CylinderGeometry(0.015, 0.015, 0.16, 6);
    pipe.rotateX(Math.PI / 2);
    addGeo(hold, pipe, dark, x, 0.36, 0.48);
  }

  const rigid = [...hold.children].filter((mesh) => mesh !== noseCap) as Mesh[];
  hold.remove(noseCap);
  hold.clear();
  mergeRigidMeshes(g, rigid);
  g.add(noseCap);

  g.add(buildPropeller());
  addWingScript(g);
  g.userData.wingLights = addWingLights(g);

  return g;
}

function addCockpitCanopy(parent: Group): void {
  const canopy = new Mesh(new SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), canopyGlass);
  canopy.name = "covered-cockpit";
  canopy.position.set(0, 0.4, 0.04);
  canopy.scale.set(0.17, 0.18, 0.3);
  canopy.castShadow = false;
  parent.add(canopy);
}

function addSearchLightFixture(parent: Group): void {
  const housing = new CylinderGeometry(0.075, 0.095, 0.12, 10);
  addGeo(parent, housing, dark, 0, 0.1, -0.12);
  const lens = new Mesh(new SphereGeometry(0.065, 10, 8), searchLightLens);
  lens.name = "search-light-lens";
  lens.position.set(0, 0.025, -0.12);
  parent.add(lens);
}

function addWingLights(parent: Group): MeshStandardMaterial[] {
  const lights: MeshStandardMaterial[] = [];
  for (const x of [-1.34, 1.34]) {
    const material = new MeshStandardMaterial({
      color: "#e8fbff",
      emissive: "#75e5ff",
      emissiveIntensity: 0,
      roughness: 0.25,
    });
    const beacon = new Mesh(new SphereGeometry(0.045, 8, 6), material);
    beacon.name = "wing-edge-beacon";
    beacon.position.set(x, 0.655, 0);
    beacon.castShadow = false;
    parent.add(beacon);
    lights.push(material);
  }
  return lights;
}

function updateWingLights(lights: MeshStandardMaterial[], time: number): void {
  const phase = time % 1.5;
  const pulse = (start: number): number => {
    const t = phase - start;
    if (t < 0 || t > 0.14) return 0;
    return Math.min(1, t / 0.025, (0.14 - t) / 0.035);
  };
  const intensity = Math.max(pulse(0), pulse(0.22)) * 2.8;
  for (const light of lights) light.emissiveIntensity = intensity;
}

function updateSearchLight(state: FlightState, dt: number): void {
  groundNormal.copy(state.craft.position).normalize();
  const night = groundNormal.dot(sunDirection) < -0.12;
  const targetIntensity = night ? SEARCH_LIGHT.intensity : 0;
  state.searchLight.intensity.value +=
    (targetIntensity - state.searchLight.intensity.value) * (1 - Math.exp(-3 * dt));
  state.searchLight.position
    .copy(searchLightLocalPosition)
    .applyQuaternion(state.craft.quaternion)
    .add(state.craft.position);
  state.searchLight.direction
    .copy(searchLightLocalDirection)
    .applyQuaternion(state.craft.quaternion)
    .normalize();
}

/** Wooden blades and hub. Pitch is baked into the blade geometry so each mesh only turns around the shaft. */
function buildPropeller(): Group {
  const prop = new Group();
  prop.name = "propeller";
  prop.position.set(0, 0.28, 0.9);

  const hubGeo = new CylinderGeometry(0.055, 0.055, 0.09, 12);
  hubGeo.rotateX(Math.PI / 2);
  const hub = new Mesh(hubGeo, propWood);
  hub.castShadow = true;
  prop.add(hub);

  const cap = new Mesh(new SphereGeometry(0.055, 12, 10), propWood);
  cap.name = "rounded-propeller-spinner";
  cap.position.set(0, 0, 0.075);
  cap.scale.set(1, 1, 1.25);
  cap.castShadow = true;
  prop.add(cap);

  // Twist the plank around its span (Y) while it is still centered, then slide it out along that ray.
  const bladeGeo = new BoxGeometry(0.072, 0.34, 0.02);
  bladeGeo.rotateY(0.38);
  bladeGeo.translate(0, 0.22, 0.02);
  for (let i = 0; i < 2; i++) {
    const blade = new Mesh(bladeGeo, propWood);
    blade.rotation.z = i * Math.PI;
    blade.castShadow = true;
    prop.add(blade);
  }

  return prop;
}

/** Crisp, narrow "Flying Rhino" print on the upper wing, readable from above. */
function addWingScript(parent: Group): void {
  const map = paintWingScript();
  if (!map) return;

  const plate = new Mesh(new PlaneGeometry(2.0, 0.3), wingScriptMaterial(map));
  plate.name = "wing-script";
  // Plane starts facing +Z with text upright. Tip it onto the wing, then mirror X/Y so
  // the line runs left-to-right on screen and the letter tops point toward the nose.
  plate.rotation.x = -Math.PI / 2;
  plate.scale.set(-1, -1, 1);
  plate.position.set(0, 0.643, 0);
  plate.castShadow = false;
  parent.add(plate);
}

function wingScriptMaterial(map: CanvasTexture): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    map,
    color: "#fff8e4",
    emissive: "#ffbf45",
    emissiveMap: map,
    emissiveIntensity: 0.48,
    metalness: 0.12,
    roughness: 0.42,
    clearcoat: 0.25,
    clearcoatRoughness: 0.3,
    transparent: true,
    alphaTest: 0.05,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: DoubleSide,
  });
}

function paintWingScript(): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 240;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const label = "Flying Rhino";
  const family = '"Arial Narrow", Arial, sans-serif';
  let size = 190;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${size}px ${family}`;
  const fit = (canvas.width * 0.92) / ctx.measureText(label).width;
  if (fit < 1) {
    size = Math.floor(size * fit);
    ctx.font = `700 ${size}px ${family}`;
  }

  const x = canvas.width / 2;
  const y = canvas.height / 2 + size * 0.04;

  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, size * 0.025);
  ctx.strokeStyle = "#3f1920";
  ctx.strokeText(label, x, y);

  ctx.save();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff2cc";
  ctx.fillText(label, x, y);
  ctx.restore();

  ctx.fillStyle = "#fff2cc";
  ctx.fillText(label, x, y);

  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  map.needsUpdate = true;
  return map;
}

function makePropellerWood(): MeshStandardMaterial {
  const w = 64;
  const h = 128;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const wave = Math.sin(v * Math.PI * 16 + Math.sin(u * 11) * 0.85);
      const pore = Math.sin(v * Math.PI * 42 + u * 4);
      const knot = Math.exp(-((u - 0.32) ** 2) * 26 - ((v - 0.7) ** 2) * 70);
      const t = Math.min(1, Math.max(0, 0.58 + wave * 0.2 + pore * 0.05 - knot * 0.38));
      const i = (y * w + x) * 4;
      data[i] = Math.round(96 + t * 136);
      data[i + 1] = Math.round(52 + t * 112);
      data[i + 2] = Math.round(24 + t * 70);
      data[i + 3] = 255;
    }
  }
  const map = new DataTexture(data, w, h);
  map.wrapS = RepeatWrapping;
  map.wrapT = RepeatWrapping;
  map.magFilter = LinearFilter;
  map.minFilter = LinearFilter;
  map.colorSpace = SRGBColorSpace;
  map.needsUpdate = true;
  return new MeshStandardMaterial({ map, roughness: 0.82, metalness: 0 });
}

function add(
  parent: Group,
  geo: BoxGeometry,
  mat: MeshStandardMaterial,
  x: number,
  y: number,
  z: number,
): Mesh {
  return addGeo(parent, geo, mat, x, y, z);
}

function addGeo(
  parent: Group,
  geo: BufferGeometry,
  mat: MeshStandardMaterial,
  x: number,
  y: number,
  z: number,
): Mesh {
  const mesh = new Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
