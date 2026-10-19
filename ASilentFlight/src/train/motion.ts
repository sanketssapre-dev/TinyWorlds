import { Group, Matrix4 } from "three";
import { TRAIN } from "../config";
import { wrap01 } from "../math/sphere";
import { RailwayPath, getSampleAt, scratchSample } from "../railway/path";
import { createLocomotive, spinWheels, updateSmoke } from "./buildTrain";

const basis = new Matrix4();

export type TrainState = {
  distance: number;
  speed: number;
  paused: boolean;
  group: Group;
  loco: Group;
};

export function createTrain(): TrainState {
  const group = new Group();
  group.name = "train";
  const loco = createLocomotive();
  group.add(loco);
  return {
    distance: 4,
    speed: TRAIN.defaultSpeed,
    paused: false,
    group,
    loco,
  };
}

export function updateTrain(state: TrainState, path: RailwayPath, dt: number): void {
  if (!state.paused) {
    state.distance = wrap01(state.distance + state.speed * dt, path.totalLength);
  }
  poseOnTrack(state.loco, path, state.distance);
  spinWheels(state.loco, state.distance);
  updateSmoke(state.loco, dt, !state.paused && state.speed > 0.15);
}

function poseOnTrack(obj: Group, path: RailwayPath, s: number): void {
  const f = getSampleAt(path, s, scratchSample());
  obj.position.copy(f.position).addScaledVector(f.normal, TRAIN.wheelRadius + 0.02);
  basis.makeBasis(f.binormal, f.normal, f.tangent);
  obj.quaternion.setFromRotationMatrix(basis);
}
