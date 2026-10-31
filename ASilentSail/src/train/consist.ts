import { Group, Matrix4, Object3D, Vector3 } from "three";
import { TRAIN } from "../config";
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
  const steam = createSteamSystem(meshes.steamAnchor);

  const root = new Group();
  root.name = "train-consist";
  root.add(meshes.root);

  let distance = 0;
  const locoLen = TRAIN.locomotiveLength;
  const carLen = TRAIN.carriageLength;
  const gap = TRAIN.carriageGap;

  const place = (obj: Object3D, along: number, halfLen: number) => {
    const mid = getSampleAt(path, along, sampleScratch);
    const nose = getSampleAt(path, along + halfLen, noseScratch);
    const tail = getSampleAt(path, along - halfLen, tailScratch);
    forward.copy(nose.position).sub(tail.position);
    if (forward.lengthSq() < 1e-6) forward.copy(mid.tangent);
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
    obj.position.copy(mid.position).addScaledVector(up, 0.04);
  };

  const update = (dt: number): PathSample => {
    distance += TRAIN.cruiseSpeed * dt;
    place(meshes.loco, distance, locoLen * 0.42);

    let back = locoLen * 0.5 + gap + carLen * 0.5;
    for (let i = 0; i < meshes.carriages.length; i++) {
      place(meshes.carriages[i], distance - back, carLen * 0.42);
      back += carLen + gap;
    }

    const wheelSpin = (TRAIN.cruiseSpeed / TRAIN.wheelRadius) * dt;
    for (const wheel of meshes.wheels) {
      wheel.rotation.x += wheelSpin;
    }
    steam.update(dt, true);
    const loco = getSampleAt(path, distance, sampleScratch);
    // The bore follows the curve. A long tangent offset leaves the tube,
    // so once the chase is inside, anchor it on the rails behind the consist.
    const gate = getSampleAt(path, distance - 8, cameraScratch);
    const behind = getSampleAt(path, distance - 12.2, noseScratch);
    if (gate.inTunnel || behind.inTunnel) {
      const cam = getSampleAt(path, distance - 11.6, sampleScratch);
      cam.inTunnel = true;
      return cam;
    }
    loco.inTunnel = false;
    return loco;
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
