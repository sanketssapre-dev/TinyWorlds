import { PerspectiveCamera, Quaternion, Vector3 } from "three";
import { CAMERA, PLANET } from "../config";
import { heightOffset } from "../planet/height";
import { PathSample } from "../flight/path";

export type CameraMode = "behind" | "above";

export type CameraRig = {
  camera: PerspectiveCamera;
  mode: CameraMode;
  overhead: boolean;
  userOrbit: boolean;
  yaw: number;
  pitch: number;
  zoom: number;
};

const desiredPos = new Vector3();
const desiredLook = new Vector3();
const desiredUp = new Vector3();
const dampedPos = new Vector3();
const dampedLook = new Vector3();
const dampedUp = new Vector3(0, 1, 0);
const offset = new Vector3();
const radial = new Vector3();
const prevQuat = new Quaternion();
const targetQuat = new Quaternion();

export function createCamera(aspect: number): CameraRig {
  const camera = new PerspectiveCamera(CAMERA.fov, aspect, CAMERA.near, CAMERA.far);
  return {
    camera,
    mode: "behind",
    overhead: false,
    userOrbit: false,
    yaw: 0,
    pitch: 0.08,
    zoom: CAMERA.followDistance,
  };
}

/** Clears a free look and switches between behind the flight and above the world. */
export function cycleView(rig: CameraRig): void {
  rig.overhead = !rig.overhead;
  rig.mode = rig.overhead ? "above" : "behind";
  rig.yaw = 0;
  rig.pitch = rig.overhead ? 0 : 0.08;
  rig.zoom = rig.overhead ? CAMERA.overheadDistance : CAMERA.followDistance;
  rig.userOrbit = false;
}

export function notifyOrbit(rig: CameraRig): void {
  rig.userOrbit = true;
}

export function snapCamera(rig: CameraRig, sample: PathSample): void {
  place(rig, sample, desiredPos, desiredLook, desiredUp);
  dampedPos.copy(desiredPos);
  dampedLook.copy(desiredLook);
  dampedUp.copy(desiredUp);
  apply(rig, 1);
}

export function updateCamera(rig: CameraRig, dt: number, sample: PathSample): void {
  place(rig, sample, desiredPos, desiredLook, desiredUp);
  const k = 1 - Math.exp(-CAMERA.damping * dt);
  dampedPos.lerp(desiredPos, k);
  dampedLook.lerp(desiredLook, k);
  dampedUp.lerp(desiredUp, k).normalize();
  avoidPlanet(dampedPos);
  apply(rig, 1 - Math.exp(-7.5 * dt));
}

function place(rig: CameraRig, sample: PathSample, pos: Vector3, look: Vector3, up: Vector3): void {
  if (rig.overhead) placeAbove(rig, sample, pos, look, up);
  else placeBehind(rig, sample, pos, look, up);
}

function placeBehind(rig: CameraRig, sample: PathSample, pos: Vector3, look: Vector3, up: Vector3): void {
  const dist = rig.zoom;
  const height = CAMERA.followHeight + (rig.zoom - CAMERA.followDistance) * 0.08;
  offset
    .copy(sample.tangent)
    .multiplyScalar(-Math.cos(rig.pitch))
    .addScaledVector(sample.normal, Math.sin(rig.pitch));
  const spun = offset
    .clone()
    .multiplyScalar(Math.cos(rig.yaw))
    .addScaledVector(sample.binormal, Math.sin(rig.yaw));
  if (spun.lengthSq() < 1e-8) spun.copy(sample.normal);
  spun.normalize();

  pos.copy(sample.position).addScaledVector(spun, dist).addScaledVector(sample.normal, height);
  look
    .copy(sample.position)
    .addScaledVector(sample.tangent, CAMERA.lookAhead)
    .addScaledVector(sample.normal, 0.35);
  up.copy(sample.normal);
}

function placeAbove(rig: CameraRig, sample: PathSample, pos: Vector3, look: Vector3, up: Vector3): void {
  const dist = rig.zoom;
  offset
    .copy(sample.normal)
    .multiplyScalar(Math.cos(rig.pitch))
    .addScaledVector(sample.tangent, -Math.sin(rig.pitch) * 0.35);
  const spun = offset
    .clone()
    .multiplyScalar(Math.cos(rig.yaw))
    .addScaledVector(sample.binormal, Math.sin(rig.yaw));
  spun.normalize();

  pos.copy(sample.position).addScaledVector(spun, dist);
  look.copy(sample.position).addScaledVector(sample.tangent, 2.2);
  up.copy(sample.tangent);
}

function apply(rig: CameraRig, slerp: number): void {
  prevQuat.copy(rig.camera.quaternion);
  rig.camera.up.copy(dampedUp);
  rig.camera.position.copy(dampedPos);
  rig.camera.lookAt(dampedLook);
  targetQuat.copy(rig.camera.quaternion);
  rig.camera.quaternion.copy(prevQuat).slerp(targetQuat, slerp);
}

function avoidPlanet(pos: Vector3): void {
  radial.copy(pos);
  const r = radial.length() || 1;
  const theta = Math.acos(clamp(radial.y / r, -1, 1));
  const phi = Math.atan2(radial.z, radial.x);
  const minR = PLANET.radius + heightOffset(theta, phi) + 1.4;
  if (r < minR) pos.setLength(minR);
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function modeLabel(rig: CameraRig): string {
  if (rig.overhead) return "Above the world";
  if (rig.userOrbit) return "Looking around";
  return "Behind the flight";
}

export function viewButtonLabel(rig: CameraRig): string {
  return rig.overhead ? "Behind" : "Above";
}
