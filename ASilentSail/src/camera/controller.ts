import { Group, Object3D, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { CAMERA, PLANET } from "../config";
import { heightOffset } from "../planet/height";
import type { PathSample } from "../railway/path";

export type CameraMode = "trainFollow" | "freePlanetSpin" | "cab";

const CYCLE: CameraMode[] = ["trainFollow", "freePlanetSpin", "cab"];

const MODE_LABEL: Record<CameraMode, string> = {
  trainFollow: "Train Follow",
  freePlanetSpin: "Free Planet Spin",
  cab: "Driver's view",
};

export type CameraRig = {
  camera: PerspectiveCamera;
  mode: CameraMode;
  /** Mode whose pose is already applied. A change snaps instead of drifting. */
  posedMode: CameraMode;
  /** Zoom distance used only in Free Planet Spin. */
  spinZoom: number;
  planetGroup: Group;
  spinAngle: number;
};

const desiredPos = new Vector3();
const desiredLook = new Vector3();
const desiredUp = new Vector3();
const dampedPos = new Vector3();
const dampedLook = new Vector3();
const dampedUp = new Vector3(0, 1, 0);
const prevQuat = new Quaternion();
const targetQuat = new Quaternion();
const radial = new Vector3();
const worldSamplePos = new Vector3();
const worldTangent = new Vector3();
const worldNormal = new Vector3();
const worldBinormal = new Vector3();
/** Eye in locomotive space, above the boiler crown and back from the front glass. */
const cabEye = new Vector3(0, 1.48, -0.64);
/** Down the line, just over the barrel, so the mountain fills the glass. */
const cabLook = new Vector3(0, 1.34, 18);
const cabUp = new Vector3(0, 1, 0);

export function createCamera(aspect: number, planetGroup: Group): CameraRig {
  const camera = new PerspectiveCamera(CAMERA.fov, aspect, CAMERA.near, CAMERA.far);
  return {
    camera,
    mode: "trainFollow",
    posedMode: "trainFollow",
    spinZoom: CAMERA.spinDistance,
    planetGroup,
    spinAngle: 0,
  };
}

export function toggleCameraMode(rig: CameraRig): void {
  const index = CYCLE.indexOf(rig.mode);
  const next = CYCLE[(index + 1) % CYCLE.length];
  rig.mode = next;
  if (next === "freePlanetSpin") rig.spinZoom = CAMERA.spinDistance;
}

export function modeButtonLabel(rig: CameraRig): string {
  const index = CYCLE.indexOf(rig.mode);
  return MODE_LABEL[CYCLE[(index + 1) % CYCLE.length]];
}

export function adjustSpinZoom(rig: CameraRig, delta: number): void {
  if (rig.mode !== "freePlanetSpin") return;
  rig.spinZoom = clamp(rig.spinZoom + delta, CAMERA.minSpinZoom, CAMERA.maxSpinZoom);
}

export function snapCamera(rig: CameraRig, sample: PathSample, loco: Object3D): void {
  applyLens(rig);
  place(rig, sample, loco, desiredPos, desiredLook, desiredUp);
  dampedPos.copy(desiredPos);
  dampedLook.copy(desiredLook);
  dampedUp.copy(desiredUp);
  rig.posedMode = rig.mode;
  apply(rig, 1);
}

export function updateCamera(rig: CameraRig, dt: number, sample: PathSample, loco: Object3D): void {
  if (rig.mode === "freePlanetSpin") {
    rig.spinAngle += CAMERA.planetSpinRate * dt;
    rig.planetGroup.rotation.y = rig.spinAngle;
  }
  // Train Follow and the driver's seat stay with the rails. Spin waits.

  applyLens(rig);
  place(rig, sample, loco, desiredPos, desiredLook, desiredUp);
  const entered = rig.posedMode !== rig.mode;
  if (entered) rig.posedMode = rig.mode;
  const locked = rig.mode === "cab" || entered;
  const k = locked ? 1 : 1 - Math.exp(-CAMERA.damping * dt);
  dampedPos.lerp(desiredPos, k);
  dampedLook.lerp(desiredLook, k);
  dampedUp.lerp(desiredUp, k).normalize();
  if (rig.mode !== "cab") avoidPlanet(dampedPos, rig.mode === "trainFollow");
  apply(rig, locked ? 1 : 1 - Math.exp(-7.5 * dt));
}

function applyLens(rig: CameraRig): void {
  const cab = rig.mode === "cab";
  const fov = cab ? CAMERA.cabFov : CAMERA.fov;
  const near = cab ? CAMERA.cabNear : CAMERA.near;
  if (rig.camera.fov === fov && rig.camera.near === near) return;
  rig.camera.fov = fov;
  rig.camera.near = near;
  rig.camera.updateProjectionMatrix();
}

function place(
  rig: CameraRig,
  sample: PathSample,
  loco: Object3D,
  pos: Vector3,
  look: Vector3,
  up: Vector3,
): void {
  if (rig.mode === "cab") {
    placeCab(loco, pos, look, up);
    return;
  }

  toWorld(rig, sample.position, worldSamplePos);
  toWorldDir(rig, sample.tangent, worldTangent);
  toWorldDir(rig, sample.normal, worldNormal);
  toWorldDir(rig, sample.binormal, worldBinormal);

  if (rig.mode === "trainFollow") placeFollow(pos, look, up);
  else placeSpin(rig, pos, look, up);
}

function placeCab(loco: Object3D, pos: Vector3, look: Vector3, up: Vector3): void {
  loco.updateWorldMatrix(true, false);
  pos.copy(cabEye).applyMatrix4(loco.matrixWorld);
  look.copy(cabLook).applyMatrix4(loco.matrixWorld);
  up.copy(cabUp).transformDirection(loco.matrixWorld);
}

function placeFollow(pos: Vector3, look: Vector3, up: Vector3): void {
  pos
    .copy(worldSamplePos)
    .addScaledVector(worldTangent, -CAMERA.followDistance)
    .addScaledVector(worldNormal, CAMERA.followHeight)
    .addScaledVector(worldBinormal, 3);
  look
    .copy(worldSamplePos)
    .addScaledVector(worldTangent, CAMERA.lookAhead)
    .addScaledVector(worldNormal, -6.5)
    .addScaledVector(worldBinormal, 0.8);
  up.copy(worldNormal);
}

function placeSpin(rig: CameraRig, pos: Vector3, look: Vector3, up: Vector3): void {
  // Calm wide framing — camera fixed in world space, planet spins underneath
  const dist = rig.spinZoom;
  pos.set(dist * 0.82, dist * 0.32, dist * 0.48);
  look.set(0, 0, 0);
  up.set(0, 1, 0);
}

function toWorld(rig: CameraRig, local: Vector3, out: Vector3): void {
  out.copy(local);
  rig.planetGroup.localToWorld(out);
}

function toWorldDir(rig: CameraRig, local: Vector3, out: Vector3): void {
  out.copy(local).transformDirection(rig.planetGroup.matrixWorld);
}

function apply(rig: CameraRig, slerp: number): void {
  prevQuat.copy(rig.camera.quaternion);
  rig.camera.up.copy(dampedUp);
  rig.camera.position.copy(dampedPos);
  rig.camera.lookAt(dampedLook);
  targetQuat.copy(rig.camera.quaternion);
  rig.camera.quaternion.copy(prevQuat).slerp(targetQuat, slerp);
}

function avoidPlanet(pos: Vector3, follow: boolean): void {
  radial.copy(pos);
  const r = radial.length() || 1;
  const theta = Math.acos(clamp(radial.y / r, -1, 1));
  const phi = Math.atan2(radial.z, radial.x);
  // Outside the bore, stay well clear of the crust so the camera never
  // slips inside the shell.
  const clearance = follow ? 3.2 : 3.5;
  let minR = PLANET.radius + heightOffset(theta, phi) + clearance;
  if (!follow) minR = Math.max(minR, PLANET.radius + 6);
  if (r < minR) pos.setLength(minR);
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}
