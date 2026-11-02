import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Quaternion,
  TorusGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { TRACK } from "../config";
import { alpineMaps, mappedStandard } from "../render/materials";
import { getSampleAt, scratchSample, type PathSample, type RailwayPath } from "./path";

const tmpPos = new Vector3();
const tmpQuat = new Quaternion();
const tmpScale = new Vector3(1, 1, 1);
const tmpMat = new Matrix4();
const endA = new Vector3();
const endB = new Vector3();
const chord = new Vector3();
const midNormal = new Vector3();
const alignOrigin = new Vector3();
const viaductWidth = TRACK.trackSpacing + TRACK.sleeperWidth + 0.4;

function seatOnFormation(sample: PathSample, lateral: number, lift: number, target: Vector3): Vector3 {
  target.copy(sample.position).addScaledVector(sample.binormal, lateral);
  const len = target.length() || 1;
  target.multiplyScalar(sample.trackRadius / len);
  target.addScaledVector(sample.normal, lift);
  return target;
}

export function buildTrack(path: RailwayPath): Group {
  const root = new Group();
  root.name = "railway-track";

  const maps = alpineMaps();
  const railMat = mappedStandard(maps.metal, {
    color: "#e4e7ec",
    metalness: 0.82,
    roughness: 0.34,
    normalMap: maps.metalNor,
  });
  railMat.polygonOffset = true;
  railMat.polygonOffsetFactor = -2;
  railMat.polygonOffsetUnits = -2;
  const sleeperMat = mappedStandard(maps.wood, {
    roughness: 0.88,
    metalness: 0.04,
    normalMap: maps.woodNor,
  });
  const stoneMat = mappedStandard(maps.stone, { roughness: 0.9 });

  const railGeo = new CylinderGeometry(TRACK.railRadius, TRACK.railRadius, 1, 6);
  railGeo.rotateX(Math.PI / 2);
  const sleeperGeo = new BoxGeometry(
    TRACK.sleeperWidth,
    TRACK.sleeperHeight,
    TRACK.sleeperLength,
  );
  const archGeo = archBayGeometry();
  const deckGeo = viaductDeckGeometry();

  const lanes = [-TRACK.trackSpacing * 0.5, TRACK.trackSpacing * 0.5];
  const sleeperCount = Math.floor(path.totalLength / TRACK.sleeperSpacing);
  const segmentCount = sleeperCount * lanes.length;
  const leftRails = new InstancedMesh(railGeo, railMat, segmentCount);
  const rightRails = new InstancedMesh(railGeo, railMat, segmentCount);
  leftRails.name = "rail-left";
  rightRails.name = "rail-right";
  leftRails.castShadow = true;
  rightRails.castShadow = true;

  const here = scratchSample();
  const ahead = scratchSample();
  const step = path.totalLength / sleeperCount;
  const sleepers = new InstancedMesh(sleeperGeo, sleeperMat, segmentCount);
  sleepers.name = "sleepers";
  sleepers.castShadow = true;
  sleepers.receiveShadow = true;

  const archList: Matrix4[] = [];
  const deckList: Matrix4[] = [];
  let lastPierS = -TRACK.pierSpacing;

  for (let i = 0; i < sleeperCount; i++) {
    const s = i * step;
    const sample = getSampleAt(path, s, here);
    const next = getSampleAt(path, s + step, ahead);
    align(tmpQuat, sample.tangent, sample.normal);
    for (let lane = 0; lane < lanes.length; lane++) {
      seatOnFormation(sample, lanes[lane], 0.07, tmpPos);
      tmpMat.compose(tmpPos, tmpQuat, tmpScale.set(1, 1, 1));
      sleepers.setMatrixAt(lane * sleeperCount + i, tmpMat);
    }

    midNormal.copy(sample.normal).add(next.normal).normalize();
    for (let lane = 0; lane < lanes.length; lane++) {
      const index = lane * sleeperCount + i;
      const lateral = lanes[lane];
      for (const rail of [-0.5, 0.5]) {
        const offset = lateral + rail * TRACK.gauge;
        seatOnFormation(sample, offset, 0.14, endA);
        seatOnFormation(next, offset, 0.14, endB);
        chord.copy(endB).sub(endA);
        const len = chord.length();
        if (len < 1e-5) continue;
        chord.multiplyScalar(1 / len);
        tmpPos.copy(endA).add(endB).multiplyScalar(0.5);
        align(tmpQuat, chord, midNormal);
        tmpMat.compose(tmpPos, tmpQuat, tmpScale.set(1, 1, len));
        (rail < 0 ? leftRails : rightRails).setMatrixAt(index, tmpMat);
      }
    }

    if (sample.elevated && s - lastPierS >= TRACK.pierSpacing) {
      const span = Math.max(0.95, sample.elevation + 0.2);
      align(tmpQuat, sample.tangent, sample.normal);
      archList.push(
        new Matrix4().compose(
          sample.position,
          tmpQuat,
          new Vector3(viaductWidth / 1.9, span / 2.05, 1),
        ),
      );
      deckList.push(new Matrix4().compose(sample.position, tmpQuat, new Vector3(1, 1, 1)));
      lastPierS = s;
    }
  }

  sleepers.instanceMatrix.needsUpdate = true;
  leftRails.instanceMatrix.needsUpdate = true;
  rightRails.instanceMatrix.needsUpdate = true;
  root.add(leftRails, rightRails, sleepers);
  if (archList.length > 0) {
    const arches = new InstancedMesh(archGeo, stoneMat, archList.length);
    const decks = new InstancedMesh(deckGeo, stoneMat, deckList.length);
    arches.name = "viaduct-arches";
    decks.name = "viaduct-deck";
    arches.castShadow = true;
    arches.receiveShadow = true;
    decks.castShadow = true;
    decks.receiveShadow = true;
    archList.forEach((matrix, i) => arches.setMatrixAt(i, matrix));
    deckList.forEach((matrix, i) => decks.setMatrixAt(i, matrix));
    arches.instanceMatrix.needsUpdate = true;
    decks.instanceMatrix.needsUpdate = true;
    root.add(arches, decks);
  }

  return root;
}

function archBayGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const z of [-1.02, 1.02]) {
    const tower = new BoxGeometry(1.9, 2.05, 0.55);
    tower.translate(0, -1.025, z);
    parts.push(tower);
  }
  const ring = new TorusGeometry(0.7, 0.12, 6, 14, Math.PI);
  ring.rotateY(Math.PI / 2);
  ring.translate(0, -0.88, 0);
  parts.push(ring);
  const spandrel = new BoxGeometry(1.5, 0.34, 1.35);
  spandrel.translate(0, -0.17, 0);
  parts.push(spandrel);
  return mergeParts(parts);
}

function viaductDeckGeometry(): BufferGeometry {
  const deck = new BoxGeometry(viaductWidth, 0.1, 2.25);
  deck.translate(0, -0.07, 0);
  const left = new BoxGeometry(0.09, 0.18, 2.25);
  left.translate(-viaductWidth / 2 + 0.16, 0.05, 0);
  const right = new BoxGeometry(0.09, 0.18, 2.25);
  right.translate(viaductWidth / 2 - 0.16, 0.05, 0);
  return mergeParts([deck, left, right]);
}

function mergeParts(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false)!;
  for (const geometry of parts) geometry.dispose();
  return merged;
}

function align(q: Quaternion, tangent: Vector3, normal: Vector3): void {
  const look = new Matrix4();
  look.lookAt(alignOrigin, tangent, normal);
  q.setFromRotationMatrix(look);
}
