import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  TorusGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { TRACK } from "../config";
import { alpineMaps, mappedStandard } from "../render/materials";
import type { RailwayPath } from "./path";

const tmpPos = new Vector3();
const tmpQuat = new Quaternion();
const tmpScale = new Vector3(1, 1, 1);
const tmpMat = new Matrix4();
const railOffset = new Vector3();
const alignOrigin = new Vector3(0, 0, 0);

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
  const ballastMat = mappedStandard(maps.ballast, { roughness: 0.96, color: "#3e3a34" });
  const stoneMat = mappedStandard(maps.stone, { roughness: 0.9 });

  const railGeo = new CylinderGeometry(TRACK.railRadius, TRACK.railRadius, 1, 6);
  railGeo.rotateX(Math.PI / 2);
  const sleeperGeo = new BoxGeometry(
    TRACK.sleeperWidth,
    TRACK.sleeperHeight,
    TRACK.sleeperLength,
  );
  const ballastGeo = new BoxGeometry(TRACK.ballastWidth, 0.06, TRACK.sleeperSpacing * 0.95);
  const archGeo = archBayGeometry();
  const deckGeo = viaductDeckGeometry();
  const portalFrame = tunnelPortalGeometry();
  const boreMat = mappedStandard(maps.stone, { color: "#6a645c", roughness: 0.94 });
  boreMat.side = DoubleSide;
  boreMat.customProgramCacheKey = () => "tunnel-bore-twosided";
  boreMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      "#include <normal_fragment_begin>\nif (!gl_FrontFacing) normal = -normal;",
    );
  };

  const samples = path.samples;
  const n = samples.length;
  const segmentCount = n;
  const sleeperCount = Math.floor(path.totalLength / TRACK.sleeperSpacing);

  const leftRails = new InstancedMesh(railGeo, railMat, segmentCount);
  const rightRails = new InstancedMesh(railGeo, railMat, segmentCount);
  leftRails.name = "rail-left";
  rightRails.name = "rail-right";
  leftRails.castShadow = true;
  rightRails.castShadow = true;

  for (let i = 0; i < n; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % n];
    const len = a.position.distanceTo(b.position);
    tmpPos.copy(a.position).add(b.position).multiplyScalar(0.5);
    const tangent = b.position.clone().sub(a.position).normalize();
    const midNormal = a.normal.clone().add(b.normal).normalize();
    const midBin = a.binormal.clone().add(b.binormal).normalize();
    align(tmpQuat, tangent, midNormal);

    // Left rail
    railOffset.copy(midBin).multiplyScalar(-TRACK.gauge * 0.5);
    tmpMat.compose(
      tmpPos.clone().add(railOffset).addScaledVector(midNormal, 0.14),
      tmpQuat,
      tmpScale.set(1, 1, len),
    );
    leftRails.setMatrixAt(i, tmpMat);

    // Right rail
    railOffset.copy(midBin).multiplyScalar(TRACK.gauge * 0.5);
    tmpMat.compose(
      tmpPos.clone().add(railOffset).addScaledVector(midNormal, 0.14),
      tmpQuat,
      tmpScale.set(1, 1, len),
    );
    rightRails.setMatrixAt(i, tmpMat);
  }
  leftRails.instanceMatrix.needsUpdate = true;
  rightRails.instanceMatrix.needsUpdate = true;
  root.add(leftRails, rightRails);

  const sleepers = new InstancedMesh(sleeperGeo, sleeperMat, sleeperCount);
  const ballasts = new InstancedMesh(ballastGeo, ballastMat, sleeperCount);
  sleepers.name = "sleepers";
  ballasts.name = "ballast";
  sleepers.castShadow = true;
  sleepers.receiveShadow = true;
  ballasts.receiveShadow = true;

  const archList: Matrix4[] = [];
  const deckList: Matrix4[] = [];
  const portalList: Matrix4[] = [];
  let lastPierS = -TRACK.pierSpacing;
  let lastPortalS = -20;

  for (let i = 0; i < sleeperCount; i++) {
    const s = (i / sleeperCount) * path.totalLength;
    const sample = sampleAtIndex(path, s);
    align(tmpQuat, sample.tangent, sample.normal);
    tmpMat.compose(
      sample.position.clone().addScaledVector(sample.normal, 0.07),
      tmpQuat,
      tmpScale.set(1, 1, 1),
    );
    sleepers.setMatrixAt(i, tmpMat);

    tmpMat.compose(
      sample.position.clone().addScaledVector(sample.normal, 0.02),
      tmpQuat,
      tmpScale.set(1, 1, 1),
    );
    ballasts.setMatrixAt(i, tmpMat);

    if (sample.elevated && s - lastPierS >= TRACK.pierSpacing) {
      const span = Math.max(0.95, sample.elevation);
      align(tmpQuat, sample.tangent, sample.normal);
      const pos = sample.position.clone();
      archList.push(new Matrix4().compose(pos, tmpQuat, new Vector3(1, span / 2.05, 1)));
      deckList.push(new Matrix4().compose(pos, tmpQuat, new Vector3(1, 1, 1)));
      lastPierS = s;
    }

    if (s - lastPortalS > 6) {
      const prev = sampleAtIndex(path, s - 1.4);
      const next = sampleAtIndex(path, s + 1.4);
      const entering = sample.inTunnel && !prev.inTunnel;
      const leaving = sample.inTunnel && !next.inTunnel;
      if (entering || leaving) {
        lastPortalS = s;
        align(tmpQuat, sample.tangent, sample.normal);
        const portalPos = sample.position
          .clone()
          .addScaledVector(sample.normal, 0.02)
          .addScaledVector(sample.tangent, entering ? -0.25 : 0.25);
        portalList.push(new Matrix4().compose(portalPos, tmpQuat, new Vector3(1, 1, 1)));
      }
    }
  }
  sleepers.instanceMatrix.needsUpdate = true;
  ballasts.instanceMatrix.needsUpdate = true;
  root.add(sleepers, ballasts);

  if (archList.length > 0) {
    const arches = new InstancedMesh(archGeo, stoneMat, archList.length);
    const decks = new InstancedMesh(deckGeo, stoneMat, deckList.length);
    arches.name = "viaduct-arches";
    decks.name = "viaduct-deck";
    arches.castShadow = true;
    arches.receiveShadow = true;
    decks.castShadow = true;
    decks.receiveShadow = true;
    archList.forEach((m, i) => arches.setMatrixAt(i, m));
    deckList.forEach((m, i) => decks.setMatrixAt(i, m));
    arches.instanceMatrix.needsUpdate = true;
    decks.instanceMatrix.needsUpdate = true;
    root.add(arches, decks);
  }

  const bore = buildTunnelShell(path, boreMat);
  if (bore) root.add(bore);

  if (portalList.length > 0) {
    const portals = new InstancedMesh(portalFrame, stoneMat, portalList.length);
    portals.name = "tunnel-portals";
    portals.castShadow = true;
    portals.receiveShadow = true;
    portalList.forEach((m, i) => portals.setMatrixAt(i, m));
    portals.instanceMatrix.needsUpdate = true;
    root.add(portals);
  }

  return root;
}

/** One limestone bay. Top sits on local y=0 so a Y scale drops the feet to the valley. */
function archBayGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const z of [-1.02, 1.02]) {
    const tower = new BoxGeometry(0.82, 2.05, 0.55);
    tower.translate(0, -1.025, z);
    parts.push(tower);
  }
  const ring = new TorusGeometry(0.7, 0.12, 6, 14, Math.PI);
  ring.rotateY(Math.PI / 2);
  ring.translate(0, -0.88, 0);
  parts.push(ring);
  const spandrel = new BoxGeometry(0.58, 0.34, 1.35);
  spandrel.translate(0, -0.17, 0);
  parts.push(spandrel);
  return mergeParts(parts);
}

function viaductDeckGeometry(): BufferGeometry {
  const deck = new BoxGeometry(1.4, 0.1, 2.25);
  deck.translate(0, -0.07, 0);
  const left = new BoxGeometry(0.09, 0.18, 2.25);
  left.translate(-0.72, 0.05, 0);
  const right = new BoxGeometry(0.09, 0.18, 2.25);
  right.translate(0.72, 0.05, 0);
  return mergeParts([deck, left, right]);
}

const BORE_HALF = 1.46;
const BORE_SPRING = 2.05;
const BORE_ARCH = 1.46;
const BORE_THICK = 0.4;

/** Continuous horseshoe. Inner opening is about 2.9 wide and 3.5 tall. */
function buildTunnelShell(path: RailwayPath, material: Mesh["material"]): Group | null {
  const samples = path.samples;
  const profile = tunnelProfile();
  const pCount = profile.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ringAt = new Array<number>(samples.length).fill(-1);
  const floorPos: number[] = [];
  const floorUv: number[] = [];
  const floorIdx: number[] = [];
  const floorAt = new Array<number>(samples.length).fill(-1);

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (!s.inTunnel) continue;
    ringAt[i] = positions.length / 3;
    const v = s.s * 0.85;
    for (let k = 0; k < pCount; k++) {
      const pr = profile[k];
      positions.push(
        s.position.x + s.binormal.x * pr.x + s.normal.x * pr.y,
        s.position.y + s.binormal.y * pr.x + s.normal.y * pr.y,
        s.position.z + s.binormal.z * pr.x + s.normal.z * pr.y,
      );
      uvs.push((k / pCount) * 5, v);
    }
    floorAt[i] = floorPos.length / 3;
    for (const x of [-BORE_HALF + 0.04, BORE_HALF - 0.04]) {
      floorPos.push(
        s.position.x + s.binormal.x * x + s.normal.x * 0.04,
        s.position.y + s.binormal.y * x + s.normal.y * 0.04,
        s.position.z + s.binormal.z * x + s.normal.z * 0.04,
      );
      floorUv.push(x, v);
    }
  }

  for (let i = 0; i < samples.length; i++) {
    const a = ringAt[i];
    const b = ringAt[(i + 1) % samples.length];
    if (a < 0 || b < 0) continue;
    for (let k = 0; k < pCount; k++) {
      const k1 = (k + 1) % pCount;
      const a0 = a + k;
      const a1 = a + k1;
      const b0 = b + k;
      const b1 = b + k1;
      indices.push(a0, b0, a1, a1, b0, b1);
    }
    const fa = floorAt[i];
    const fb = floorAt[(i + 1) % samples.length];
    floorIdx.push(fa, fb, fa + 1, fa + 1, fb, fb + 1);
  }

  if (indices.length === 0) return null;

  const shellGeo = new BufferGeometry();
  shellGeo.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  shellGeo.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  shellGeo.setIndex(indices);
  shellGeo.computeVertexNormals();

  const floorGeo = new BufferGeometry();
  floorGeo.setAttribute("position", new BufferAttribute(new Float32Array(floorPos), 3));
  floorGeo.setAttribute("uv", new BufferAttribute(new Float32Array(floorUv), 2));
  floorGeo.setIndex(floorIdx);
  floorGeo.computeVertexNormals();

  const shell = new Mesh(shellGeo, material);
  shell.name = "tunnel-bore";
  shell.castShadow = false;
  shell.receiveShadow = true;
  const floor = new Mesh(floorGeo, material);
  floor.name = "tunnel-floor";
  floor.receiveShadow = true;
  const group = new Group();
  group.name = "tunnel-shell";
  group.add(shell, floor);
  return group;
}

function tunnelProfile(): { x: number; y: number }[] {
  const inner: { x: number; y: number }[] = [
    { x: -BORE_HALF, y: 0.02 },
    { x: -BORE_HALF, y: BORE_SPRING },
  ];
  const steps = 8;
  for (let k = 1; k < steps; k++) {
    const a = Math.PI * (1 - k / steps);
    inner.push({
      x: Math.cos(a) * BORE_HALF,
      y: BORE_SPRING + Math.sin(a) * BORE_ARCH,
    });
  }
  inner.push({ x: BORE_HALF, y: BORE_SPRING }, { x: BORE_HALF, y: 0.02 });

  const outer: { x: number; y: number }[] = [];
  for (let i = inner.length - 1; i >= 0; i--) {
    const p = inner[i];
    const above = p.y >= BORE_SPRING - 0.02;
    if (!above) {
      outer.push({ x: p.x + Math.sign(p.x) * BORE_THICK, y: p.y });
      continue;
    }
    const ax = p.x;
    const ay = p.y - BORE_SPRING;
    const len = Math.hypot(ax, ay) || 1;
    outer.push({ x: p.x + (ax / len) * BORE_THICK, y: p.y + (ay / len) * BORE_THICK });
  }
  return inner.concat(outer);
}

/** Masonry mouth sized to the shell. The chimney sits near 1.7. */
function tunnelPortalGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const x of [-1.78, 1.78]) {
    const jamb = new BoxGeometry(0.46, 2.2, 0.72);
    jamb.translate(x, 1.12, 0);
    parts.push(jamb);
  }
  for (const x of [-2.42, 2.42]) {
    const wing = new BoxGeometry(0.72, 1.85, 0.58);
    wing.translate(x, 0.95, 0.08);
    parts.push(wing);
  }
  const arch = new TorusGeometry(1.55, 0.22, 8, 18, Math.PI);
  arch.translate(0, 2.18, 0);
  parts.push(arch);
  const cap = new BoxGeometry(3.3, 0.26, 0.74);
  cap.translate(0, 3.82, 0);
  parts.push(cap);
  return mergeParts(parts);
}

function mergeParts(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false)!;
  for (const geo of parts) geo.dispose();
  return merged;
}

function align(q: Quaternion, tangent: Vector3, normal: Vector3): void {
  // Local +Z along tangent, +Y along surface normal
  const look = new Matrix4();
  look.lookAt(alignOrigin, tangent, normal);
  q.setFromRotationMatrix(look);
}

function sampleAtIndex(
  path: RailwayPath,
  s: number,
): {
  position: Vector3;
  tangent: Vector3;
  normal: Vector3;
  binormal: Vector3;
  elevated: boolean;
  inTunnel: boolean;
  elevation: number;
} {
  const samples = path.samples;
  const n = samples.length;
  const target = ((s % path.totalLength) + path.totalLength) % path.totalLength;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (samples[mid].s <= target) lo = mid;
    else hi = mid - 1;
  }
  return samples[lo];
}
