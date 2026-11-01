import { Group, Matrix4, Object3D, Vector3 } from "three";
import { TRACK, TRAIN } from "../config";
import {
  createRailwayPath,
  getSampleAt,
  scratchSample,
  type PathSample,
  type RailwayPath,
} from "../railway/path";
import type { PlanetSurface } from "../planet/surface";
import { createSteamSystem, createTrainMeshes, type TrainMeshes } from "./meshes";

export type TrainConsist = {
  root: Group;
  path: RailwayPath;
  distance: number;
  meshes: TrainMeshes;
  update: (dt: number) => PathSample;
};

const sampleScratch = scratchSample();
const noseScratch = scratchSample();
const tailScratch = scratchSample();
const cameraScratch = scratchSample();
const basis = new Matrix4();
const forward = new Vector3();
const side = new Vector3();
const radial = new Vector3();
const up = new Vector3();

export function createTrain(surface: PlanetSurface): TrainConsist {
  const path = createRailwayPath(surface);
  const meshes = createTrainMeshes();
  const oncoming = createTrainMeshes();
  oncoming.root.name = "oncoming-train";
  const steam = createSteamSystem(meshes.steamAnchor);
  const oncomingSteam = createSteamSystem(oncoming.steamAnchor);

  const root = new Group();
  root.name = "train-consist";
  root.add(meshes.root, oncoming.root);

  let distance = 0;
  // Far enough ahead to read as another train, close enough to meet on this lap.
  let oncomingDistance = 46;
  const ownLateral = -TRACK.trackSpacing * 0.5;
  const otherLateral = TRACK.trackSpacing * 0.5;
  const locoLen = TRAIN.locomotiveLength;
  const carLen = TRAIN.carriageLength;
  const gap = TRAIN.carriageGap;

  const place = (
    obj: Object3D,
    along: number,
    halfLen: number,
    lateral: number,
    direction: number,
  ) => {
    const mid = getSampleAt(path, along, sampleScratch);
    const nose = getSampleAt(path, along + direction * halfLen, noseScratch);
    const tail = getSampleAt(path, along - direction * halfLen, tailScratch);
    forward.copy(nose.position).sub(tail.position);
    if (forward.lengthSq() < 1e-6) forward.copy(mid.tangent).multiplyScalar(direction);
    forward.normalize();
    radial.copy(mid.position).normalize();
    side.crossVectors(radial, forward);
    if (side.lengthSq() < 1e-6) side.set(0, 1, 0).cross(forward);
    side.normalize();
    up.crossVectors(forward, side).normalize();
    if (up.dot(radial) < 0) {
      side.negate();
      up.negate();
    }
    basis.makeBasis(side, up, forward);
    obj.quaternion.setFromRotationMatrix(basis);
    obj.position.copy(mid.position).addScaledVector(mid.binormal, lateral);
    const radialLen = obj.position.length() || 1;
    obj.position.multiplyScalar(mid.trackRadius / radialLen).addScaledVector(up, 0.04);
  };

  const lay = (group: TrainMeshes, along: number, lateral: number, direction: number) => {
    place(group.loco, along, locoLen * 0.42, lateral, direction);
    let back = locoLen * 0.5 + gap + carLen * 0.5;
    for (let i = 0; i < group.carriages.length; i++) {
      place(group.carriages[i], along - direction * back, carLen * 0.42, lateral, direction);
      back += carLen + gap;
    }
  };

  const onOurTrack = (sample: PathSample) => {
    sample.position.addScaledVector(sample.binormal, ownLateral);
    const len = sample.position.length() || 1;
    sample.position.multiplyScalar(sample.trackRadius / len);
    return sample;
  };

  const update = (dt: number): PathSample => {
    distance += TRAIN.cruiseSpeed * dt;
    oncomingDistance -= TRAIN.cruiseSpeed * dt;
    lay(meshes, distance, ownLateral, 1);
    lay(oncoming, oncomingDistance, otherLateral, -1);

    const wheelSpin = (TRAIN.cruiseSpeed / TRAIN.wheelRadius) * dt;
    for (const wheel of meshes.wheels) wheel.rotation.x += wheelSpin;
    for (const wheel of oncoming.wheels) wheel.rotation.x += wheelSpin;
    steam.update(dt, true);
    oncomingSteam.update(dt, true);
    const loco = getSampleAt(path, distance, sampleScratch);
    // The bore follows the curve. A long tangent offset leaves the tube,
    // so once the chase is inside, anchor it on the rails behind the consist.
    const gate = getSampleAt(path, distance - 8, cameraScratch);
    const behind = getSampleAt(path, distance - 12.2, noseScratch);
    if (gate.inTunnel || behind.inTunnel) {
      const cam = getSampleAt(path, distance - 11.6, sampleScratch);
      cam.inTunnel = true;
      return onOurTrack(cam);
    }
    loco.inTunnel = false;
    return onOurTrack(loco);
  };

  // Initial placement
  update(0);

  return {
    root,
    path,
    get distance() {
      return distance;
    },
    set distance(v: number) {
      distance = v;
    },
    meshes,
    update,
  };
}
