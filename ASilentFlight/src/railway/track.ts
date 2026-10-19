import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TubeGeometry,
  Vector3,
} from "three";
import { TRACK } from "../config";
import { PathSample, RailwayPath, getSampleAt } from "./path";
import { collectPierPositions } from "./trackSupport";

const dummy = new Object3D();
const mat4 = new Matrix4();
const yUp = new Vector3(0, 1, 0);

export function createTrack(path: RailwayPath): Group {
  const group = new Group();
  group.name = "railway";

  const left: Vector3[] = [];
  const right: Vector3[] = [];
  for (let i = 0; i < path.samples.length - 1; i++) {
    const s = path.samples[i];
    left.push(s.position.clone().addScaledVector(s.binormal, TRACK.gauge * 0.5));
    right.push(s.position.clone().addScaledVector(s.binormal, -TRACK.gauge * 0.5));
  }

  const railMat = new MeshStandardMaterial({
    color: new Color("#6d746c"),
    metalness: 0.72,
    roughness: 0.32,
  });
  group.add(railTube(left, railMat));
  group.add(railTube(right, railMat));

  group.add(createSleepers(path));
  group.add(createBallast(path));
  group.add(createEmbankments(path));
  group.add(createDeck(path));
  group.add(createPiers(path));
  group.add(createTunnelPortals(path));

  return group;
}

function railTube(points: Vector3[], mat: MeshStandardMaterial): Mesh {
  const curve = new CatmullRomCurve3(points, true, "catmullrom", 0.15);
  const geo = new TubeGeometry(
    curve,
    Math.max(240, points.length),
    TRACK.railRadius,
    5,
    true,
  );
  const mesh = new Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createSleepers(path: RailwayPath): InstancedMesh {
  const geo = new CylinderGeometry(0.032, 0.038, TRACK.sleeperWidth, 6);
  geo.rotateZ(Math.PI / 2);
  const mat = new MeshStandardMaterial({
    color: new Color("#5b3d2e"),
    roughness: 0.86,
    metalness: 0.04,
  });
  const count = Math.max(1, Math.floor(path.totalLength / TRACK.sleeperSpacing));
  const mesh = new InstancedMesh(geo, mat, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  for (let i = 0; i < count; i++) {
    const s = getSampleAt(path, i * TRACK.sleeperSpacing);
    dummy.position.copy(s.position).addScaledVector(s.normal, -0.028);
    mat4.makeBasis(s.binormal, s.normal, s.tangent);
    dummy.quaternion.setFromRotationMatrix(mat4);
    dummy.scale.set(1, 1, TRACK.sleeperLength / 0.08);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function createBallast(path: RailwayPath): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const samples = path.samples;
  const half = TRACK.ballastWidth * 0.5;
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (a.inTunnel && b.inTunnel) continue;
    const a0 = a.position.clone().addScaledVector(a.binormal, half).addScaledVector(a.normal, -0.045);
    const a1 = a.position.clone().addScaledVector(a.binormal, -half).addScaledVector(a.normal, -0.045);
    const b0 = b.position.clone().addScaledVector(b.binormal, half).addScaledVector(b.normal, -0.045);
    const b1 = b.position.clone().addScaledVector(b.binormal, -half).addScaledVector(b.normal, -0.045);
    pushTri(positions, normals, a0, a1, b0);
    pushTri(positions, normals, a1, b1, b0);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  const mat = new MeshStandardMaterial({
    color: new Color("#4f4b45"),
    roughness: 0.95,
    metalness: 0.02,
  });
  const mesh = new Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

function createPiers(path: RailwayPath): InstancedMesh {
  const piers = collectPierPositions(path);
  const geo = new CylinderGeometry(0.16, 0.26, 1, 7);
  const mat = new MeshStandardMaterial({
    color: new Color("#7a7368"),
    roughness: 0.84,
    metalness: 0.05,
  });
  const mesh = new InstancedMesh(geo, mat, Math.max(1, piers.length));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const dir = new Vector3();
  piers.forEach((pier, i) => {
    dummy.position.copy(pier.bottom).lerp(pier.top, 0.5);
    dir.copy(pier.top).sub(pier.bottom).normalize();
    dummy.quaternion.setFromUnitVectors(yUp, dir);
    dummy.scale.set(1, pier.height, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.count = piers.length;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function createEmbankments(path: RailwayPath): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const samples = path.samples;
  const half = 0.36;
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (a.inTunnel || b.inTunnel || a.inCutting || b.inCutting) continue;
    if (a.elevation < 0.22 || a.elevation >= TRACK.elevatedThreshold) continue;
    if (b.elevation < 0.18) continue;
    const drop = (sample: PathSample, side: number, down: number) =>
      sample.position
        .clone()
        .addScaledVector(sample.binormal, side)
        .addScaledVector(sample.normal, down);
    const aL = drop(a, half, -0.05);
    const aR = drop(a, -half, -0.05);
    const aLb = drop(a, half * 0.72, -(a.elevation - 0.02));
    const aRb = drop(a, -half * 0.72, -(a.elevation - 0.02));
    const bL = drop(b, half, -0.05);
    const bR = drop(b, -half, -0.05);
    const bLb = drop(b, half * 0.72, -(b.elevation - 0.02));
    const bRb = drop(b, -half * 0.72, -(b.elevation - 0.02));
    pushTri(positions, normals, aL, aLb, bL);
    pushTri(positions, normals, aLb, bLb, bL);
    pushTri(positions, normals, aR, bR, aRb);
    pushTri(positions, normals, aRb, bRb, bR);
  }
  return skirtMesh(positions, normals, "#6a5b48");
}

function createDeck(path: RailwayPath): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const samples = path.samples;
  const half = 0.26;
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (a.inTunnel || b.inTunnel) continue;
    if (a.elevation < TRACK.elevatedThreshold || b.elevation < TRACK.elevatedThreshold) continue;
    const drop = (sample: PathSample, side: number, down: number) =>
      sample.position
        .clone()
        .addScaledVector(sample.binormal, side)
        .addScaledVector(sample.normal, down);
    const a0 = drop(a, half, -0.06);
    const a1 = drop(a, -half, -0.06);
    const a2 = drop(a, half, -0.16);
    const a3 = drop(a, -half, -0.16);
    const b0 = drop(b, half, -0.06);
    const b1 = drop(b, -half, -0.06);
    const b2 = drop(b, half, -0.16);
    const b3 = drop(b, -half, -0.16);
    pushTri(positions, normals, a0, a1, b0);
    pushTri(positions, normals, a1, b1, b0);
    pushTri(positions, normals, a2, b2, a3);
    pushTri(positions, normals, a3, b2, b3);
    pushTri(positions, normals, a0, b0, a2);
    pushTri(positions, normals, a2, b0, b2);
    pushTri(positions, normals, a1, a3, b1);
    pushTri(positions, normals, a3, b3, b1);
  }
  return skirtMesh(positions, normals, "#4e463f");
}

function skirtMesh(positions: number[], normals: number[], color: string): Mesh {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  const mesh = new Mesh(
    geo,
    new MeshStandardMaterial({ color: new Color(color), roughness: 0.92, metalness: 0.04 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.visible = positions.length > 0;
  return mesh;
}

function createTunnelPortals(path: RailwayPath): Group {
  const group = new Group();
  const mat = new MeshStandardMaterial({
    color: new Color("#6f675c"),
    roughness: 0.9,
  });
  const dark = new MeshStandardMaterial({
    color: new Color("#14110e"),
    roughness: 1,
  });

  const dir = new Vector3();
  for (let i = 1; i < path.samples.length - 1; i++) {
    const prev = path.samples[i - 1];
    const curr = path.samples[i];
    if (prev.inTunnel === curr.inTunnel) continue;
    const entering = curr.inTunnel && !prev.inTunnel;
    const sign = entering ? 1 : -1;
    const ring = new Mesh(new CylinderGeometry(2.35, 2.6, 0.72, 16, 1, true), mat);
    ring.position.copy(curr.position);
    dir.copy(curr.tangent);
    ring.quaternion.setFromUnitVectors(yUp, dir);
    ring.castShadow = true;
    group.add(ring);

    const bore = new Mesh(new CylinderGeometry(2.05, 2.05, 2.8, 14, 1, true), dark);
    bore.position.copy(curr.position).addScaledVector(curr.tangent, sign * 1.2);
    bore.quaternion.setFromUnitVectors(yUp, dir);
    group.add(bore);
  }
  return group;
}

function pushTri(
  pos: number[],
  nor: number[],
  a: Vector3,
  b: Vector3,
  c: Vector3,
): void {
  const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize();
  pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  nor.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
}
