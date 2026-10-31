import { Group, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { CAMERA, PLANET } from "../config";
import { heightOffset } from "../planet/height";
import type { PathSample } from "../railway/path";

export type CameraMode = "trainFollow" | "freePlanetSpin";

export type CameraRig = {
  camera: PerspectiveCamera;
  mode: CameraMode;
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

export function createCamera(aspect: number, planetGroup: Group): CameraRig {
  const camera = new PerspectiveCamera(CAMERA.fov, aspect, CAMERA.near, CAMERA.far);
  return {
    camera,
    mode: "trainFollow",
    spinZoom: CAMERA.spinDistance,
    planetGroup,
    spinAngle: 0,
  };
}

export function toggleCameraMode(rig: CameraRig): void {
  if (rig.mode === "trainFollow") {
    rig.mode = "freePlanetSpin";
    rig.spinZoom = CAMERA.spinDistance;
  } else {
    rig.mode = "trainFollow";
    // Freeze planet rotation where it is — stop ambient spin
  }
}

export function modeButtonLabel(rig: CameraRig): string {
  return rig.mode === "trainFollow" ? "Free Planet Spin" : "Train Follow";
}

export function adjustSpinZoom(rig: CameraRig, delta: number): void {
  if (rig.mode !== "freePlanetSpin") return;
  rig.spinZoom = clamp(rig.spinZoom + delta, CAMERA.minSpinZoom, CAMERA.maxSpinZoom);
}

export function snapCamera(rig: CameraRig, sample: PathSample): void {
  place(rig, sample, desiredPos, desiredLook, desiredUp);
  dampedPos.copy(desiredPos);
  dampedLook.copy(desiredLook);
  dampedUp.copy(desiredUp);
  apply(rig, 1);
}

export function updateCamera(rig: CameraRig, dt: number, sample: PathSample): void {
  if (rig.mode === "freePlanetSpin") {
    rig.spinAngle += CAMERA.planetSpinRate * dt;
    rig.planetGroup.rotation.y = rig.spinAngle;
  }
  // Train Follow: do not advance ambient planet rotation

  place(rig, sample, desiredPos, desiredLook, desiredUp);
  const k = 1 - Math.exp(-CAMERA.damping * dt);
  dampedPos.lerp(desiredPos, k);
  dampedLook.lerp(desiredLook, k);
  dampedUp.lerp(desiredUp, k).normalize();
  avoidPlanet(dampedPos, rig.mode === "trainFollow", sample.inTunnel);
  apply(rig, 1 - Math.exp(-7.5 * dt));
}

function place(
  rig: CameraRig,
  sample: PathSample,
  pos: Vector3,
  look: Vector3,
  up: Vector3,
): void {
  toWorld(rig, sample.position, worldSamplePos);
  toWorldDir(rig, sample.tangent, worldTangent);
  toWorldDir(rig, sample.normal, worldNormal);
  toWorldDir(rig, sample.binormal, worldBinormal);

  if (rig.mode === "trainFollow") {
    placeFollow(pos, look, up, sample.inTunnel);
  } else {
    placeSpin(rig, pos, look, up);
  }
}

function placeFollow(pos: Vector3, look: Vector3, up: Vector3, inside: boolean): void {
  // Outside, a meadow chase. Inside a bore, sit on the centerline just
  // behind the consist so the view travels through the mouth.
  const back = inside ? 0.4 : 8.5;
  const height = inside ? 2.25 : 2.35;
  const side = inside ? 0.12 : 1.55;
  const lookAhead = inside ? 13 : 11;
  const lookH = inside ? 0.45 : 1.7;
  const lookSide = inside ? 0 : -0.35;
  pos
    .copy(worldSamplePos)
    .addScaledVector(worldTangent, -back)
    .addScaledVector(worldNormal, height)
    .addScaledVector(worldBinormal, side);
  look
    .copy(worldSamplePos)
    .addScaledVector(worldTangent, lookAhead)
    .addScaledVector(worldNormal, lookH)
    .addScaledVector(worldBinormal, lookSide);
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

function avoidPlanet(pos: Vector3, follow: boolean, insideTunnel: boolean): void {
  radial.copy(pos);
  const r = radial.length() || 1;
  const theta = Math.acos(clamp(radial.y / r, -1, 1));
  const phi = Math.atan2(radial.z, radial.x);
  // Outside the bore, stay well clear of the crust so the camera never
  // slips inside the shell. Inside, only correct a true intersection.
  const clearance = insideTunnel ? 0.4 : follow ? 3.2 : 3.5;
  let minR = PLANET.radius + heightOffset(theta, phi) + clearance;
  if (!follow) minR = Math.max(minR, PLANET.radius + 6);
  if (r < minR) pos.setLength(minR);
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}
