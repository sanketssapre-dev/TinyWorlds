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
import { fbm3 } from "../math/noise";
import type { PlanetSurface } from "../planet/surface";
import { alpineMaps, createAlpinePlanetMaterial, mappedStandard } from "../render/materials";
import { getSampleAt, scratchSample, type PathSample, type RailwayPath } from "./path";

const tmpPos = new Vector3();
const tmpQuat = new Quaternion();
const tmpScale = new Vector3(1, 1, 1);
const tmpMat = new Matrix4();
const endA = new Vector3();
const endB = new Vector3();
const chord = new Vector3();
const midNormal = new Vector3();
const alignOrigin = new Vector3(0, 0, 0);

/** Offset a sample onto one road and seat it on the formation radius. */
function seatOnFormation(sample: PathSample, lateral: number, lift: number, target: Vector3): Vector3 {
  target.copy(sample.position).addScaledVector(sample.binormal, lateral);
  const len = target.length() || 1;
  target.multiplyScalar(sample.trackRadius / len);
  target.addScaledVector(sample.normal, lift);
  return target;
}

export function buildTrack(path: RailwayPath, surface: PlanetSurface): Group {
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
  const plinthGeo = new BoxGeometry(7.4, 1, 1.3);
  plinthGeo.translate(0, -0.5, 0);
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
  const behind = scratchSample();
  const step = path.totalLength / sleeperCount;

  const sleepers = new InstancedMesh(sleeperGeo, sleeperMat, sleeperCount * lanes.length);
  sleepers.name = "sleepers";
  sleepers.castShadow = true;
  sleepers.receiveShadow = true;

  const archList: Matrix4[] = [];
  const deckList: Matrix4[] = [];
  const portalList: Matrix4[] = [];
  const plinthList: Matrix4[] = [];
  let lastPierS = -TRACK.pierSpacing;
  let lastPortalS = -20;

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

    // Short chords along each road, one per sleeper, so the outer rails
    // stay on the wood through a bend instead of bridging a gap.
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
    align(tmpQuat, sample.tangent, sample.normal);

    if (sample.elevated && s - lastPierS >= TRACK.pierSpacing) {
      const span = Math.max(0.95, sample.elevation + 0.2);
      align(tmpQuat, sample.tangent, sample.normal);
      const pos = sample.position.clone();
      archList.push(new Matrix4().compose(pos, tmpQuat, new Vector3(1, span / 2.05, 1)));
      deckList.push(new Matrix4().compose(pos, tmpQuat, new Vector3(1, 1, 1)));
      lastPierS = s;
    }

    if (s - lastPortalS > 6) {
      const prev = getSampleAt(path, s - 1.4, behind);
      const nextPortal = getSampleAt(path, s + 1.4, ahead);
      const entering = sample.inTunnel && !prev.inTunnel;
      const leaving = sample.inTunnel && !nextPortal.inTunnel;
      if (entering || leaving) {
        lastPortalS = s;
        align(tmpQuat, sample.tangent, sample.normal);
        const portalPos = sample.position
          .clone()
          .addScaledVector(sample.normal, 0.02)
          .addScaledVector(sample.tangent, entering ? -0.25 : 0.25);
        portalList.push(new Matrix4().compose(portalPos, tmpQuat, new Vector3(1, 1, 1)));
        const foot = Math.max(0.35, sample.elevation + 0.45);
        plinthList.push(
          new Matrix4().compose(portalPos, tmpQuat.clone(), new Vector3(1, foot, 1)),
        );
      }
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
    archList.forEach((m, i) => arches.setMatrixAt(i, m));
    deckList.forEach((m, i) => decks.setMatrixAt(i, m));
    arches.instanceMatrix.needsUpdate = true;
    decks.instanceMatrix.needsUpdate = true;
    root.add(arches, decks);
  }

  const bore = buildTunnelShell(path, boreMat);
  if (bore) root.add(bore);
  const cover = buildLandCover(path, surface);
  if (cover) root.add(cover);

  if (portalList.length > 0) {
    const portals = new InstancedMesh(portalFrame, stoneMat, portalList.length);
    portals.name = "tunnel-portals";
    portals.castShadow = true;
    portals.receiveShadow = true;
    portalList.forEach((m, i) => portals.setMatrixAt(i, m));
    portals.instanceMatrix.needsUpdate = true;
    root.add(portals);
    if (plinthList.length > 0) {
      const plinths = new InstancedMesh(plinthGeo, stoneMat, plinthList.length);
      plinths.name = "tunnel-plinths";
      plinths.castShadow = true;
      plinths.receiveShadow = true;
      plinthList.forEach((m, i) => plinths.setMatrixAt(i, m));
      plinths.instanceMatrix.needsUpdate = true;
      root.add(plinths);
    }
  }

  return root;
}

/** One limestone bay. Top sits on local y=0 so a Y scale drops the feet to the valley. */
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
  const deck = new BoxGeometry(2.6, 0.1, 2.25);
  deck.translate(0, -0.07, 0);
  const left = new BoxGeometry(0.09, 0.18, 2.25);
  left.translate(-1.2, 0.05, 0);
  const right = new BoxGeometry(0.09, 0.18, 2.25);
  right.translate(1.2, 0.05, 0);
  return mergeParts([deck, left, right]);
}

const BORE_HALF = 2.15;
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
    const bury = Math.max(0.55, s.trackRadius - s.groundRadius + 0.35);
    for (let k = 0; k < pCount; k++) {
      const pr = profile[k];
      const foot = pr.y < 0.45 ? (0.45 - pr.y) / 0.45 : 0;
      const y = pr.y - bury * foot;
      positions.push(
        s.position.x + s.binormal.x * pr.x + s.normal.x * y,
        s.position.y + s.binormal.y * pr.x + s.normal.y * y,
        s.position.z + s.binormal.z * pr.x + s.normal.z * y,
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

/**
 * Hillside the gallery is cut through. The roof follows the real ground and
 * only rises enough to bury the bore, so it reads as the same meadow rather
 * than a smooth dome. The rock face stays around the arch.
 */
function buildLandCover(path: RailwayPath, surface: PlanetSurface): Mesh | null {
  const samples = path.samples;
  const n = samples.length;
  const COLS = 52;
  const HALF = 20;
  const STEPS = 2;
  const ROWS = 10;
  const CROWN = 4.25;
  const positions: number[] = [];
  const indices: number[] = [];
  const lateral = new Vector3();
  const dir = new Vector3();
  const point = new Vector3();

  const push = (v: Vector3) => {
    positions.push(v.x, v.y, v.z);
  };

  const runs: { a: number; b: number }[] = [];
  let runStart = -1;
  for (let i = 0; i < n; i++) {
    const prev = samples[(i - 1 + n) % n].inTunnel;
    if (samples[i].inTunnel && !prev) runStart = i;
    if (!samples[i].inTunnel && prev && runStart >= 0) {
      runs.push({ a: runStart, b: i - 1 });
      runStart = -1;
    }
  }

  const blend = (i0: number, i1: number, t: number, out: typeof station) => {
    const a = samples[i0];
    const b = samples[i1];
    out.position.copy(a.position).lerp(b.position, t);
    out.binormal.copy(a.binormal).lerp(b.binormal, t).normalize();
    out.normal.copy(a.normal).lerp(b.normal, t).normalize();
    out.tangent.copy(a.tangent).lerp(b.tangent, t).normalize();
    out.trackRadius = a.trackRadius + (b.trackRadius - a.trackRadius) * t;
    out.groundRadius = a.groundRadius + (b.groundRadius - a.groundRadius) * t;
    return out;
  };
  const station = {
    position: new Vector3(),
    binormal: new Vector3(),
    normal: new Vector3(),
    tangent: new Vector3(),
    trackRadius: 0,
    groundRadius: 0,
  };

  const acrossOf = (col: number) => ((col / COLS) * 2 - 1) * HALF;
  // 1 over the arch, falling off within a few metres so the face is a cutting,
  // not a vertical blade across the whole hillside.
  const portalBlend = (across: number) => {
    const ax = Math.abs(across);
    if (ax <= 2.7) return 1;
    return Math.max(0, 1 - (ax - 2.7) / 2.6);
  };

  const hillAt = (s: typeof station, across: number, target: Vector3) => {
    lateral.copy(s.position).addScaledVector(s.binormal, across);
    dir.copy(lateral).normalize();
    const g = groundAlong(surface, dir, s.groundRadius);
    const ax = Math.abs(across);
    const edge = fbm3(lateral.x * 0.16, lateral.y * 0.16, lateral.z * 0.16, 2, 2, 0.5, 8);
    const span = 14.5 + edge * 3;
    const u = Math.min(1, ax / span);
    const smooth = u * u * (3 - 2 * u);
    const wander = fbm3(s.position.x * 0.28, s.position.y * 0.28, s.position.z * 0.28, 3, 2, 0.55, 5);
    const crown = s.trackRadius + CROWN + Math.max(0, wander - 0.55) * 0.35;
    // Roll from the bore up to the real ground. A short drop to the valley floor
    // becomes the cut wall seen from above.
    let radius = crown * (1 - smooth) + g * smooth;

    const ridge = Math.abs(
      fbm3(lateral.x * 0.4, lateral.y * 0.4, lateral.z * 0.4, 4, 2.05, 0.5, 17) - 0.5,
    );
    const grain = fbm3(lateral.x * 1.05, lateral.y * 1.05, lateral.z * 1.05, 3, 2.1, 0.55, 29) - 0.5;
    radius += (ridge * 0.65 + grain * 0.25) * (1 - smooth);
    if (u > 0.84) radius -= Math.pow((u - 0.84) / 0.16, 2) * 0.45;
    if (ax < 3) radius = Math.max(radius, s.trackRadius + CROWN);
    target.copy(dir).multiplyScalar(radius);
  };

  for (const run of runs) {
    const ringAt: number[] = [];
    const emit = (s: typeof station, inset: number) => {
      ringAt.push(positions.length / 3);
      for (let col = 0; col <= COLS; col++) {
        hillAt(s, acrossOf(col), point);
        if (inset !== 0) point.addScaledVector(s.tangent, inset);
        push(point);
      }
    };
    emit(blend(run.a, run.a, 0, station), 0.45);
    for (let i = run.a; i < run.b; i++) {
      for (let step = 0; step < STEPS; step++) {
        if (i === run.a && step === 0) continue;
        emit(blend(i, i + 1, step / STEPS, station), 0);
      }
    }
    emit(blend(run.b, run.b, 0, station), -0.45);

    const stride = COLS + 1;
    for (let r = 0; r < ringAt.length - 1; r++) {
      const a = ringAt[r];
      const b = ringAt[r + 1];
      for (let col = 0; col < COLS; col++) {
        const a0 = a + col;
        const a1 = a0 + 1;
        const b0 = b + col;
        const b1 = b0 + 1;
        // Upward: binormal × tangent points out of the hill.
        indices.push(a0, a1, b0, a1, b1, b0);
      }
    }

    cutFace(run.a, true);
    cutFace(run.b, false);

    function cutFace(index: number, entering: boolean) {
      const s = blend(index, index, 0, station);
      const front = entering ? -0.9 : 0.9;
      const crest = entering ? ringAt[0] : ringAt[ringAt.length - 1];
      const grid: number[] = [];
      for (let row = 0; row <= ROWS; row++) {
        const t = row / ROWS;
        for (let col = 0; col <= COLS; col++) {
          const across = acrossOf(col);
          const portal = portalBlend(across);
          lateral.copy(s.position).addScaledVector(s.binormal, across);
          dir.copy(lateral).normalize();
          const g = groundAlong(surface, dir, s.groundRadius);
          hillAt(s, across, point);
          const hillR = point.length();
          const risen = (g - 0.15) * (1 - t) + hillR * t;
          const buried = g - 0.75;
          const radius = buried + portal * (risen - buried);
          const lean = (1 - portal) * 2.4 * (entering ? 1 : -1);
          point.copy(dir).multiplyScalar(radius).addScaledVector(s.tangent, front * portal + lean);
          grid.push(positions.length / 3);
          push(point);
        }
      }
      const at = (row: number, col: number) => grid[row * stride + col];
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const across = acrossOf(col + 0.5);
          if (portalBlend(acrossOf(col)) < 0.12 && portalBlend(acrossOf(col + 1)) < 0.12) continue;
          const y0 = faceHeight(s, across, row / ROWS);
          const y1 = faceHeight(s, across, (row + 1) / ROWS);
          if (insideMouth(across, (y0 + y1) * 0.5)) continue;
          const a = at(row, col);
          const b = at(row, col + 1);
          const c = at(row + 1, col);
          const d = at(row + 1, col + 1);
          if (entering) indices.push(a, b, c, b, d, c);
          else indices.push(a, c, b, b, c, d);
        }
      }
      for (let col = 0; col < COLS; col++) {
        if (portalBlend(acrossOf(col + 0.5)) < 0.35) continue;
        const a = at(ROWS, col);
        const b = at(ROWS, col + 1);
        const c = crest + col;
        const d = crest + col + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  if (indices.length === 0) return null;
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const land = createAlpinePlanetMaterial();
  land.side = DoubleSide;
  const cover = new Mesh(geo, land);
  cover.name = "tunnel-cover";
  cover.castShadow = true;
  cover.receiveShadow = true;
  return cover;

  function faceHeight(s: typeof station, across: number, t: number): number {
    const portal = portalBlend(across);
    lateral.copy(s.position).addScaledVector(s.binormal, across);
    dir.copy(lateral).normalize();
    const g = groundAlong(surface, dir, s.groundRadius);
    hillAt(s, across, point);
    const hillR = point.length();
    const risen = (g - 0.15) * (1 - t) + hillR * t;
    const buried = g - 0.75;
    const radius = buried + portal * (risen - buried);
    point.copy(dir).multiplyScalar(radius);
    return point.sub(s.position).dot(s.normal);
  }
}

function insideMouth(across: number, height: number): boolean {
  if (height < 0.02) return false;
  const half = BORE_HALF + 0.08;
  const rise = BORE_ARCH * 0.78;
  if (height <= BORE_SPRING) return Math.abs(across) < half;
  const ny = (height - BORE_SPRING) / rise;
  const nx = across / half;
  return ny < 1 && nx * nx + ny * ny < 1;
}

function groundAlong(surface: PlanetSurface, dir: Vector3, fallback: number): number {
  const theta = Math.acos(Math.min(1, Math.max(-1, dir.y)));
  const phi = Math.atan2(dir.z, dir.x);
  const hit = surface.radius(theta, phi);
  return hit > 1 ? hit : fallback;
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
  const jambX = BORE_HALF + 0.3;
  const jambH = BORE_SPRING + 0.15;
  for (const x of [-jambX, jambX]) {
    const jamb = new BoxGeometry(0.48, jambH, 0.72);
    jamb.translate(x, jambH * 0.5, 0);
    parts.push(jamb);
  }
  const wingX = BORE_HALF + 0.95;
  for (const x of [-wingX, wingX]) {
    const wing = new BoxGeometry(0.7, BORE_SPRING * 0.9, 0.58);
    wing.translate(x, BORE_SPRING * 0.45, 0.08);
    parts.push(wing);
  }
  const arch = new TorusGeometry(BORE_ARCH, 0.2, 8, 20, Math.PI);
  arch.scale(BORE_HALF / BORE_ARCH, 1, 1);
  arch.translate(0, BORE_SPRING, 0);
  parts.push(arch);
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
