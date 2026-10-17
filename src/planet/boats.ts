import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { sphToCart } from "../math/sphere";
import { mergeRigidMeshes } from "../render/mergeRigid";
import { SITES } from "./features";
import { MAIN_LAKE_ANGULAR, mainLakeWaterRadius, waterTime } from "./water";

const COUNT = 3;
/** Modest shrink of the whole boat, about a quarter smaller than the original. */
const BOAT_SCALE = 0.75;
const MIN_SEPARATION = 2.4;
const KEEP_FRACTION = 0.68;

const HULL = ["#6b4228", "#7d5434", "#583828"];
const SAIL = ["#f4efe4", "#efe3cc", "#f7f2e8"];
const PENNANT = ["#c4493a", "#2e6da6", "#d4a24a"];

const hullGeo = new BoxGeometry(0.26, 0.12, 0.66);
const bowAGeo = new BoxGeometry(0.18, 0.09, 0.16);
const bowBGeo = new BoxGeometry(0.11, 0.07, 0.14);
const bowCGeo = new BoxGeometry(0.05, 0.045, 0.12);
const sternGeo = new BoxGeometry(0.22, 0.13, 0.1);
const keelGeo = new BoxGeometry(0.034, 0.06, 0.7);
const gunwaleGeo = new BoxGeometry(0.018, 0.028, 0.76);
const deckGeo = new BoxGeometry(0.2, 0.016, 0.5);
const thwartGeo = new BoxGeometry(0.18, 0.016, 0.042);
const cabinGeo = new BoxGeometry(0.13, 0.1, 0.18);
const roofGeo = new BoxGeometry(0.156, 0.022, 0.2);
const windowGeo = new BoxGeometry(0.01, 0.038, 0.055);
const stripeGeo = new BoxGeometry(0.01, 0.016, 0.62);
const mastGeo = new CylinderGeometry(0.012, 0.017, 1.05, 7);
const truckGeo = new SphereGeometry(0.026, 8, 6);
const seamGeo = new BoxGeometry(0.17, 0.008, 0.012);
const cleatGeo = new BoxGeometry(0.046, 0.012, 0.018);
const rudderGeo = new BoxGeometry(0.012, 0.11, 0.055);
const tillerGeo = new BoxGeometry(0.015, 0.015, 0.12);
const stepGeo = new BoxGeometry(0.04, 0.02, 0.04);

const deckMat = new MeshStandardMaterial({ color: "#c6a56e", roughness: 0.72 });
const seamMat = new MeshStandardMaterial({ color: "#a68455", roughness: 0.78 });
const sparMat = new MeshStandardMaterial({ color: "#3d2c22", roughness: 0.82 });
const ropeMat = new MeshStandardMaterial({ color: "#2a241c", roughness: 0.9 });
const cabinMat = new MeshStandardMaterial({ color: "#6d5438", roughness: 0.8 });
const roofMat = new MeshStandardMaterial({ color: "#4a3b32", roughness: 0.74 });
const glassMat = new MeshStandardMaterial({
  color: "#1b3338",
  roughness: 0.18,
  metalness: 0.12,
});

const mainSailGeo = cloth(
  new Vector3(0.02, 0.22, 0.06),
  new Vector3(0.05, 1.14, 0.08),
  new Vector3(0.15, 0.18, -0.4),
  0.055,
);
const jibGeo = cloth(
  new Vector3(0.0, 0.1, 0.7),
  new Vector3(0.045, 0.92, 0.1),
  new Vector3(0.11, 0.24, 0.04),
  0.035,
);
const pennantGeo = cloth(
  new Vector3(0.0, 1.16, 0.08),
  new Vector3(0.2, 1.14, 0.02),
  new Vector3(0.03, 1.1, 0.05),
  0.012,
);

type Boat = {
  group: Group;
  x: number;
  y: number;
  heading: number;
  speed: number;
  phase: number;
  rate: number;
};

const boats: Boat[] = [];
const centerDir = new Vector3();
const east = new Vector3();
const north = new Vector3();
const radial = new Vector3();
const forward = new Vector3();
const lookTarget = new Vector3();
let surfaceR = 1;
let ready = false;

export function createBoats(): Group {
  const root = new Group();
  root.name = "boats";
  sphToCart(1, SITES.lake.theta, SITES.lake.phi, centerDir);
  const hint = Math.abs(centerDir.y) < 0.85 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  east.crossVectors(hint, centerDir).normalize();
  north.crossVectors(centerDir, east).normalize();
  surfaceR = mainLakeWaterRadius();

  const placed = [
    { x: 0.09, y: 0.04, heading: 0.7, speed: 0.24, phase: 0.4, rate: 0.14, scale: 0.92 },
    { x: -0.1, y: -0.03, heading: -0.8, speed: 0.21, phase: 3.1, rate: 0.17, scale: 0.86 },
    { x: 0.01, y: -0.12, heading: 0.4, speed: 0.28, phase: 4.4, rate: 0.13, scale: 1.0 },
  ];

  for (let i = 0; i < COUNT; i++) {
    const spec = placed[i];
    const group = buildBoat(i);
    group.scale.setScalar(spec.scale * BOAT_SCALE);
    root.add(group);
    boats.push({
      group,
      x: spec.x,
      y: spec.y,
      heading: spec.heading,
      speed: spec.speed,
      phase: spec.phase,
      rate: spec.rate,
    });
  }

  ready = true;
  updateBoats(0);
  return root;
}

export function updateBoats(dt: number): void {
  if (!ready) return;
  const time = waterTime.value;
  const limit = MAIN_LAKE_ANGULAR * KEEP_FRACTION;
  const minAng = MIN_SEPARATION / surfaceR;

  for (const boat of boats) {
    boat.heading += Math.sin(time * boat.rate + boat.phase) * 0.28 * dt;
    boat.heading += Math.sin(time * boat.rate * 0.43 + boat.phase * 1.7) * 0.12 * dt;
  }

  for (let i = 0; i < boats.length; i++) {
    const boat = boats[i];
    for (let j = 0; j < boats.length; j++) {
      if (i === j) continue;
      const other = boats[j];
      const dx = boat.x - other.x;
      const dy = boat.y - other.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= minAng * 1.6 || dist < 1e-5) continue;
      const urgency = 1 - dist / (minAng * 1.6);
      const away = Math.atan2(dy, dx);
      boat.heading = turnToward(boat.heading, away, (0.6 + 2.2 * urgency) * dt);
    }
    const radius = Math.hypot(boat.x, boat.y);
    if (radius > limit * 0.58) {
      const urgency = Math.min(1, (radius - limit * 0.58) / (limit * 0.42));
      const inward = Math.atan2(-boat.y, -boat.x);
      boat.heading = turnToward(boat.heading, inward, (0.35 + 2.6 * urgency) * dt);
    }
  }

  for (const boat of boats) {
    let speed = boat.speed * (0.86 + 0.14 * Math.sin(time * 0.21 + boat.phase));
    const radius = Math.hypot(boat.x, boat.y);
    if (radius > limit * 0.82) speed *= 0.5;
    const step = (speed * dt) / surfaceR;
    boat.x += Math.cos(boat.heading) * step;
    boat.y += Math.sin(boat.heading) * step;
    if (boat.heading > Math.PI * 4 || boat.heading < -Math.PI * 4) {
      boat.heading = Math.atan2(Math.sin(boat.heading), Math.cos(boat.heading));
    }
  }

  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < boats.length; i++) {
      for (let j = i + 1; j < boats.length; j++) pushApart(boats[i], boats[j], minAng, limit);
    }
    for (const boat of boats) clampInside(boat, limit);
  }

  for (const boat of boats) pose(boat, time);
}

function pushApart(a: Boat, b: Boat, minAng: number, limit: number): void {
  let dx = a.x - b.x;
  let dy = a.y - b.y;
  let dist = Math.hypot(dx, dy);
  if (dist >= minAng) return;
  if (dist < 1e-5) {
    dx = 1e-4;
    dy = 0;
    dist = 1e-4;
  }
  const push = (minAng - dist) * 0.5;
  const ux = dx / dist;
  const uy = dy / dist;
  let ax = a.x + ux * push;
  let ay = a.y + uy * push;
  let bx = b.x - ux * push;
  let by = b.y - uy * push;
  const aOut = Math.hypot(ax, ay) > limit;
  const bOut = Math.hypot(bx, by) > limit;
  if (aOut && !bOut) {
    ax = a.x;
    ay = a.y;
    bx = b.x - ux * push * 2;
    by = b.y - uy * push * 2;
  } else if (bOut && !aOut) {
    bx = b.x;
    by = b.y;
    ax = a.x + ux * push * 2;
    ay = a.y + uy * push * 2;
  } else if (aOut && bOut) {
    ax *= 0.82;
    ay *= 0.82;
    bx *= 0.82;
    by *= 0.82;
  }
  a.x = ax;
  a.y = ay;
  b.x = bx;
  b.y = by;
}

function clampInside(boat: Boat, limit: number): void {
  const radius = Math.hypot(boat.x, boat.y);
  if (radius > limit) {
    boat.x *= limit / radius;
    boat.y *= limit / radius;
  }
}

function pose(boat: Boat, time: number): void {
  const ang = Math.hypot(boat.x, boat.y);
  const bearing = Math.atan2(boat.y, boat.x);
  const sinA = Math.sin(ang);
  radial
    .copy(centerDir)
    .addScaledVector(east, Math.cos(bearing) * sinA)
    .addScaledVector(north, Math.sin(bearing) * sinA)
    .normalize();
  const wave = Math.sin(radial.x * surfaceR * 0.35 + time * 1.3) * 0.04;
  boat.group.position.copy(radial).multiplyScalar(surfaceR + wave + 0.012);

  forward
    .copy(east)
    .multiplyScalar(Math.cos(boat.heading))
    .addScaledVector(north, Math.sin(boat.heading));
  forward.addScaledVector(radial, -forward.dot(radial)).normalize();
  lookTarget.copy(boat.group.position).add(forward);
  boat.group.up.copy(radial);
  boat.group.lookAt(lookTarget);
  boat.group.rotateZ(Math.sin(time * 0.85 + boat.phase) * 0.045);
  boat.group.rotateX(Math.sin(time * 1.15 + boat.phase * 1.3) * 0.03);
}

function turnToward(current: number, target: number, maxDelta: number): number {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  if (delta > maxDelta) return current + maxDelta;
  if (delta < -maxDelta) return current - maxDelta;
  return current + delta;
}

function buildBoat(index: number): Group {
  const g = new Group();
  g.name = "sailboat";
  const hullMat = new MeshStandardMaterial({ color: HULL[index], roughness: 0.78 });
  const sailMat = new MeshStandardMaterial({
    color: SAIL[index],
    roughness: 0.62,
    side: DoubleSide,
  });
  flutter(sailMat, 0.04);
  const pennantMat = new MeshStandardMaterial({
    color: PENNANT[index],
    roughness: 0.48,
    side: DoubleSide,
  });
  flutter(pennantMat, 0.08);
  const stripeMat = new MeshStandardMaterial({ color: PENNANT[index], roughness: 0.55 });
  const rigid: Mesh[] = [];

  const part = (
    geo: BufferGeometry,
    mat: MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
  ): void => {
    const mesh = new Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    rigid.push(mesh);
  };

  const clothMesh = (geo: BufferGeometry, mat: MeshStandardMaterial): void => {
    const mesh = new Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  };

  part(keelGeo, sparMat, 0, -0.05, -0.02);
  part(hullGeo, hullMat, 0, 0.05, 0);
  part(bowAGeo, hullMat, 0, 0.046, 0.4);
  part(bowBGeo, hullMat, 0, 0.04, 0.54);
  part(bowCGeo, hullMat, 0, 0.034, 0.66);
  part(sternGeo, hullMat, 0, 0.058, -0.38);
  part(stripeGeo, stripeMat, 0.132, 0.03, 0);
  part(stripeGeo, stripeMat, -0.132, 0.03, 0);
  part(gunwaleGeo, sparMat, 0.135, 0.11, 0);
  part(gunwaleGeo, sparMat, -0.135, 0.11, 0);
  part(deckGeo, deckMat, 0, 0.1, -0.02);
  part(seamGeo, seamMat, 0, 0.11, 0.08);
  part(seamGeo, seamMat, 0, 0.11, -0.14);
  part(thwartGeo, deckMat, 0, 0.116, 0.18);
  part(thwartGeo, deckMat, 0, 0.116, -0.22);
  part(cleatGeo, sparMat, -0.05, 0.114, 0.26);
  part(cleatGeo, sparMat, 0.05, 0.114, 0.26);

  if (index % 2 === 0) {
    part(cabinGeo, cabinMat, 0, 0.16, -0.02);
    part(roofGeo, roofMat, 0, 0.216, -0.02);
    part(windowGeo, glassMat, 0.066, 0.16, 0.02);
    part(windowGeo, glassMat, -0.066, 0.16, 0.02);
  } else {
    part(thwartGeo, deckMat, 0, 0.116, -0.02);
  }

  part(stepGeo, sparMat, 0, 0.112, 0.08);
  part(mastGeo, sparMat, 0, 0.63, 0.08);
  part(truckGeo, sparMat, 0, 1.17, 0.08);
  clothMesh(mainSailGeo, sailMat);
  clothMesh(jibGeo, sailMat);
  clothMesh(pennantGeo, pennantMat);
  part(rudderGeo, sparMat, 0, 0.0, -0.46);
  part(tillerGeo, deckMat, 0, 0.12, -0.36);

  for (const stay of [
    strut(new Vector3(0.02, 0.22, 0.06), new Vector3(0.14, 0.18, -0.38), 0.011, sparMat),
    strut(new Vector3(0, 0.09, 0.6), new Vector3(0, 0.07, 0.82), 0.01, sparMat),
    strut(new Vector3(0, 1.14, 0.08), new Vector3(0, 0.08, 0.78), 0.007, ropeMat),
    strut(new Vector3(0, 1.14, 0.08), new Vector3(0, 0.12, -0.42), 0.007, ropeMat),
    strut(new Vector3(0, 0.82, 0.08), new Vector3(0.15, 0.11, 0.0), 0.006, ropeMat),
    strut(new Vector3(0, 0.82, 0.08), new Vector3(-0.15, 0.11, 0.0), 0.006, ropeMat),
  ]) {
    if (stay) rigid.push(stay);
  }
  mergeRigidMeshes(g, rigid);
  return g;
}

function strut(
  a: Vector3,
  b: Vector3,
  radius: number,
  mat: MeshStandardMaterial,
): Mesh | null {
  const dir = new Vector3().subVectors(b, a);
  const length = dir.length();
  if (length < 1e-4) return null;
  const mesh = new Mesh(new CylinderGeometry(radius, radius, length, 5), mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  return mesh;
}

function flutter(mat: MeshStandardMaterial, amp: number): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterTime;
    shader.uniforms.uAmp = { value: amp };
    shader.vertexShader =
      "uniform float uTime;\nuniform float uAmp;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         float tip = smoothstep(-0.1, 0.85, position.y);
         transformed.x += sin(uTime * 1.6 + position.y * 4.5 + position.z * 3.0) * tip * uAmp;
         transformed.z += sin(uTime * 1.15 + position.y * 3.5) * tip * uAmp * 0.35;`,
      );
  };
}

function cloth(a: Vector3, b: Vector3, c: Vector3, belly: number): BufferGeometry {
  const ab = new Vector3().subVectors(b, a);
  const ac = new Vector3().subVectors(c, a);
  const n = new Vector3().crossVectors(ab, ac);
  if (n.lengthSq() < 1e-8) n.set(1, 0, 0);
  else n.normalize();
  if (n.x < 0) n.negate();
  const mid = new Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3).addScaledVector(n, belly);
  const verts = [a, b, mid, b, c, mid, c, a, mid];
  const positions = new Float32Array(verts.length * 3);
  const uvs = new Float32Array(verts.length * 2);
  for (let i = 0; i < verts.length; i++) {
    positions[i * 3] = verts[i].x;
    positions[i * 3 + 1] = verts[i].y;
    positions[i * 3 + 2] = verts[i].z;
    uvs[i * 2] = (i % 3) / 2;
    uvs[i * 2 + 1] = Math.min(1, verts[i].y);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(positions, 3));
  geo.setAttribute("uv", new BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}
