import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
} from "three";
import { TRACK, TRAIN } from "../config";

function mat(color: string, extras: ConstructorParameters<typeof MeshStandardMaterial>[0] = {}) {
  return new MeshStandardMaterial({ color: new Color(color), roughness: 0.55, metalness: 0.12, ...extras });
}

function addMesh(parent: Group, geo: BoxGeometry | CylinderGeometry | SphereGeometry, material: MeshStandardMaterial, x = 0, y = 0, z = 0) {
  const m = new Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function createLocomotive(): Group {
  const g = new Group();
  g.name = "locomotive";
  const body = mat("#5c2b2a");
  const dark = mat("#2c241f");
  const brass = mat("#c4a15a", { metalness: 0.7, roughness: 0.35 });
  const green = mat("#2f4a3a");
  const glow = mat("#f3d27a", { emissive: "#e8b85a", emissiveIntensity: 1.4 });

  const L = TRAIN.locomotiveLength;
  addMesh(g, new BoxGeometry(0.42, 0.32, L * 0.55), green, 0, 0.28, L * 0.08);
  addMesh(g, new BoxGeometry(0.44, 0.38, L * 0.32), body, 0, 0.42, -L * 0.28);
  addMesh(g, new BoxGeometry(0.4, 0.08, L * 0.92), dark, 0, 0.12, 0);
  const boiler = addMesh(g, new CylinderGeometry(0.16, 0.16, L * 0.5, 10), green, 0, 0.34, L * 0.12);
  boiler.rotation.x = Math.PI / 2;
  addMesh(g, new CylinderGeometry(0.07, 0.09, 0.28, 8), dark, 0, 0.58, L * 0.22);
  addMesh(g, new CylinderGeometry(0.09, 0.09, 0.04, 8), brass, 0, 0.72, L * 0.22);
  addMesh(g, new SphereGeometry(0.045, 8, 8), glow, 0, 0.26, L * 0.48);
  addMesh(g, new BoxGeometry(0.18, 0.12, 0.02), glow, 0.12, 0.5, -L * 0.12);
  addMesh(g, new BoxGeometry(0.18, 0.12, 0.02), glow, -0.12, 0.5, -L * 0.12);
  addMesh(g, new BoxGeometry(0.38, 0.06, 0.16), brass, 0, 0.16, L * 0.48);

  addWheels(g, L);
  addMesh(g, new CylinderGeometry(0.02, 0.02, 0.16, 6), dark, 0, 0.16, -L * 0.5);

  const lampLight = new PointLight("#f6d48a", 2.4, 7, 2);
  lampLight.position.set(0, 0.28, L * 0.5);
  g.add(lampLight);

  const smoke = new Group();
  smoke.name = "smoke";
  smoke.position.set(0, 0.78, L * 0.22);
  const puffMat = mat("#c5c0b8", { transparent: true, opacity: 0.35, depthWrite: false });
  for (let i = 0; i < 6; i++) {
    const puff = new Mesh(new SphereGeometry(0.05, 6, 6), puffMat.clone());
    puff.userData.age = i / 6;
    smoke.add(puff);
  }
  g.add(smoke);

  return g;
}

function addWheels(g: Group, length: number): void {
  const iron = mat("#2a2a28", { metalness: 0.6, roughness: 0.4 });
  const geo = new CylinderGeometry(TRAIN.wheelRadius, TRAIN.wheelRadius, 0.045, 12);
  const half = TRACK.gauge * 0.5;
  const zs = [-length * 0.28, length * 0.2];
  for (const z of zs) {
    for (const x of [-half, half]) {
      const axle = new Group();
      axle.position.set(x, TRAIN.wheelRadius, z);
      axle.rotation.z = Math.PI / 2;
      const w = new Mesh(geo, iron);
      w.castShadow = true;
      w.userData.wheel = true;
      axle.add(w);
      g.add(axle);
    }
  }
  for (const x of [-half, half]) {
    addMesh(g, new BoxGeometry(0.02, 0.02, length * 0.5), iron, x, TRAIN.wheelRadius, -length * 0.04);
  }
}

export function updateSmoke(loco: Group, dt: number, moving: boolean): void {
  const smoke = loco.getObjectByName("smoke") as Group | undefined;
  if (!smoke) return;
  for (const puff of smoke.children) {
    const m = puff as Mesh;
    m.userData.age += dt * (moving ? 0.55 : 0.12);
    if (m.userData.age > 1) m.userData.age -= 1;
    const a = m.userData.age as number;
    m.position.set(Math.sin(a * 6) * 0.04, a * 0.55, 0);
    const s = 0.4 + a * 1.4;
    m.scale.setScalar(s);
    const mat = m.material as MeshStandardMaterial;
    mat.opacity = moving ? (1 - a) * 0.32 : (1 - a) * 0.08;
  }
}

export function spinWheels(root: Group, distance: number): void {
  root.traverse((obj) => {
    if (obj.userData.wheel) {
      obj.rotation.y = -distance / TRAIN.wheelRadius;
    }
  });
}
