import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  SphereGeometry,
  type Material,
} from "three";
import { TRACK, TRAIN } from "../config";
import { mergeRigidMeshes } from "../render/mergeRigid";

const green = new MeshStandardMaterial({ color: "#1b4632", metalness: 0.42, roughness: 0.38 });
const greenDark = new MeshStandardMaterial({ color: "#123628", metalness: 0.35, roughness: 0.46 });
const black = new MeshStandardMaterial({ color: "#1a1c1f", metalness: 0.55, roughness: 0.4 });
const soot = new MeshStandardMaterial({ color: "#2a2c30", metalness: 0.25, roughness: 0.72 });
const brass = new MeshStandardMaterial({ color: "#c6a15a", metalness: 0.85, roughness: 0.28 });
const cream = new MeshStandardMaterial({ color: "#e7dcc4", metalness: 0.08, roughness: 0.55 });
const red = new MeshStandardMaterial({ color: "#8c2c24", metalness: 0.3, roughness: 0.48 });
const roof = new MeshStandardMaterial({ color: "#141618", metalness: 0.4, roughness: 0.5 });
const steel = new MeshStandardMaterial({ color: "#8d929a", metalness: 0.78, roughness: 0.32 });
const glass = new MeshStandardMaterial({
  color: "#d7e4ea",
  emissive: "#f0c878",
  emissiveIntensity: 0.28,
  metalness: 0.15,
  roughness: 0.12,
  transparent: true,
  opacity: 0.72,
});
const lampGlass = new MeshStandardMaterial({
  color: "#ffe6b0",
  emissive: "#ffd27a",
  emissiveIntensity: 1.4,
  metalness: 0.1,
  roughness: 0.2,
});

const GAUGE = TRACK.gauge * 0.5;
const DRIVE = TRAIN.wheelRadius;

export type TrainMeshes = {
  root: Group;
  loco: Group;
  carriages: Group[];
  wheels: Object3D[];
  steamAnchor: Group;
};

export function createTrainMeshes(): TrainMeshes {
  const root = new Group();
  root.name = "train";

  const wheels: Object3D[] = [];
  const loco = buildLocomotive(wheels);
  loco.name = "locomotive";
  root.add(loco);

  const carriages: Group[] = [];
  for (let i = 0; i < 3; i++) {
    const car = buildCarriage(i, wheels);
    car.name = `carriage-${i + 1}`;
    carriages.push(car);
    root.add(car);
  }

  const steamAnchor = new Group();
  steamAnchor.name = "steam-anchor";
  steamAnchor.position.set(0, 1.7, 1.12);
  loco.add(steamAnchor);

  return { root, loco, carriages, wheels, steamAnchor };
}

function buildLocomotive(wheels: Object3D[]): Group {
  const g = new Group();
  const body = new Group();
  body.position.y = 0.08;
  g.add(body);
  const parts: Mesh[] = [];

  // Chassis and running boards
  box(parts, black, 0.46, 0.08, 2.7, 0, 0.22, 0.05);
  box(parts, soot, 0.78, 0.035, 2.35, 0, 0.4, 0.15);
  for (const x of [-0.36, 0.36]) {
    box(parts, soot, 0.06, 0.025, 2.2, x, 0.43, 0.1);
  }

  // Boiler, smokebox, firebox
  cyl(parts, green, 0.33, 1.2, 0, 0.78, 0.28, "z", 20);
  cyl(parts, soot, 0.355, 0.46, 0, 0.78, 1.12, "z", 20);
  cyl(parts, soot, 0.3, 0.04, 0, 0.78, 1.36, "z", 16);
  box(parts, greenDark, 0.7, 0.42, 0.55, 0, 0.62, -0.28);

  // Brass boiler bands and domes
  for (const z of [0.72, 0.28, -0.12]) cyl(parts, brass, 0.345, 0.028, 0, 0.78, z, "z", 20);
  cyl(parts, brass, 0.11, 0.16, 0, 1.16, 0.48, "y", 12);
  sphere(parts, brass, 0.12, 0, 1.28, 0.48);
  cyl(parts, green, 0.09, 0.12, 0, 1.12, 0.05, "y", 10);
  sphere(parts, greenDark, 0.1, 0, 1.22, 0.05);
  cyl(parts, brass, 0.025, 0.1, 0.08, 1.2, 0.22, "y", 6);
  sphere(parts, brass, 0.035, 0.08, 1.26, 0.22);

  // Chimney
  cyl(parts, soot, 0.11, 0.16, 0, 1.18, 1.1, "y", 12);
  cyl(parts, soot, 0.15, 0.28, 0, 1.4, 1.1, "y", 12);
  cyl(parts, brass, 0.165, 0.03, 0, 1.55, 1.1, "y", 12);

  // Handrails
  for (const x of [-0.3, 0.3]) cyl(parts, steel, 0.012, 1.15, x, 1.02, 0.35, "z", 6);

  // Cab
  box(parts, green, 0.86, 0.78, 0.72, 0, 0.86, -0.72);
  box(parts, roof, 0.94, 0.06, 0.86, 0, 1.28, -0.7);
  box(parts, cream, 0.82, 0.04, 0.7, 0, 0.5, -0.72);
  box(parts, soot, 0.7, 0.35, 0.42, 0, 0.72, -1.22);
  box(parts, roof, 0.74, 0.04, 0.46, 0, 0.92, -1.22);
  // Cab windows
  box(parts, glass, 0.02, 0.28, 0.32, -0.44, 0.92, -0.72, false);
  box(parts, glass, 0.02, 0.28, 0.32, 0.44, 0.92, -0.72, false);
  box(parts, glass, 0.22, 0.22, 0.02, -0.16, 0.98, -0.35, false);
  box(parts, glass, 0.22, 0.22, 0.02, 0.16, 0.98, -0.35, false);
  box(parts, brass, 0.16, 0.06, 0.012, 0.44, 0.62, -0.5);
  box(parts, brass, 0.16, 0.06, 0.012, -0.44, 0.62, -0.5);

  // Steps
  for (const x of [-0.42, 0.42]) {
    box(parts, steel, 0.08, 0.02, 0.14, x, 0.28, -0.48);
    box(parts, steel, 0.08, 0.02, 0.14, x, 0.16, -0.48);
  }

  // Front buffer beam, buffers, lamp, pilot
  box(parts, red, 0.72, 0.16, 0.06, 0, 0.34, 1.48);
  for (const x of [-0.2, 0.2]) {
    cyl(parts, soot, 0.055, 0.08, x, 0.34, 1.54, "z", 8);
    cyl(parts, steel, 0.07, 0.02, x, 0.34, 1.58, "z", 8);
  }
  cyl(parts, brass, 0.07, 0.06, 0, 0.62, 1.46, "z", 10);
  cyl(parts, lampGlass, 0.045, 0.02, 0, 0.62, 1.5, "z", 10, false);
  box(parts, soot, 0.5, 0.04, 0.28, 0, 0.16, 1.32);
  for (const x of [-0.22, 0.22]) {
    box(parts, soot, 0.03, 0.16, 0.32, x, 0.18, 1.28);
  }

  // Cylinders and a static coupling rod outside the wheels
  for (const x of [-1, 1]) {
    box(parts, soot, 0.1, 0.1, 0.28, x * 0.3, 0.28, 1.05);
    cyl(parts, steel, 0.02, 0.42, x * 0.3, 0.28, 0.78, "z", 6);
    box(parts, steel, 0.025, 0.04, 1.05, x * (GAUGE + 0.07), DRIVE, 0.35);
  }

  const lamp = new PointLight("#ffe2a8", 2.2, 9, 2);
  lamp.position.set(0, 0.7, 1.55);
  body.add(lamp);

  addSpokedWheel(body, wheels, 1.28, 0.11);
  for (const z of [0.82, 0.32, -0.18]) addSpokedWheel(body, wheels, z, DRIVE);

  mergeRigidMeshes(body, parts);
  return g;
}

function buildCarriage(index: number, wheels: Object3D[]): Group {
  const g = new Group();
  const body = new Group();
  body.position.y = 0.08;
  g.add(body);
  const parts: Mesh[] = [];
  const len = TRAIN.carriageLength * 0.9;
  const paint = index === 2 ? greenDark : green;

  box(parts, soot, 0.7, 0.06, len * 0.82, 0, 0.36, 0);
  box(parts, paint, 0.78, 0.38, len, 0, 0.58, 0);
  box(parts, cream, 0.8, 0.42, len * 0.96, 0, 0.96, 0);
  box(parts, paint, 0.78, 0.08, len, 0, 1.2, 0);
  box(parts, roof, 0.84, 0.08, len * 0.98, 0, 1.28, 0);
  box(parts, roof, 0.7, 0.05, len * 0.7, 0, 1.34, 0);
  // Gold lining
  box(parts, brass, 0.802, 0.012, len * 0.98, 0, 0.78, 0);
  box(parts, brass, 0.802, 0.012, len * 0.98, 0, 1.16, 0);

  const windows = 5;
  for (const side of [-1, 1]) {
    for (let w = 0; w < windows; w++) {
      const z = (w - (windows - 1) / 2) * 0.36;
      box(parts, glass, 0.02, 0.28, 0.24, side * 0.4, 0.98, z, false);
      box(parts, cream, 0.016, 0.32, 0.03, side * 0.405, 0.98, z - 0.14);
    }
    // Door
    box(parts, greenDark, 0.02, 0.55, 0.22, side * 0.4, 0.78, len * 0.38);
    box(parts, brass, 0.015, 0.06, 0.015, side * 0.415, 0.78, len * 0.34);
  }

  // End platforms and gangways
  for (const z of [-1, 1]) {
    box(parts, soot, 0.7, 0.04, 0.12, 0, 0.46, z * (len * 0.5 + 0.04));
    box(parts, red, 0.62, 0.1, 0.04, 0, 0.4, z * (len * 0.5 + 0.1));
    box(parts, soot, 0.28, 0.32, 0.06, 0, 0.7, z * (len * 0.5 + 0.08));
    for (const x of [-0.18, 0.18]) {
      cyl(parts, steel, 0.04, 0.05, x, 0.4, z * (len * 0.5 + 0.14), "z", 8);
    }
  }

  for (const bogie of [-0.62, 0.62]) {
    box(parts, soot, 0.46, 0.06, 0.42, 0, 0.28, bogie);
    addSpokedWheel(body, wheels, bogie - 0.14, 0.12);
    addSpokedWheel(body, wheels, bogie + 0.14, 0.12);
  }

  mergeRigidMeshes(body, parts);
  return g;
}

function addSpokedWheel(parent: Group, wheels: Object3D[], z: number, radius: number): void {
  for (const side of [-1, 1]) {
    const wheel = new Group();
    wheel.position.set(side * GAUGE, radius, z);
    const rim = new Mesh(new CylinderGeometry(radius * 0.92, radius * 0.92, 0.05, 18), steel);
    rim.rotation.z = Math.PI / 2;
    rim.castShadow = true;
    wheel.add(rim);
    const tyre = new Mesh(new CylinderGeometry(radius, radius, 0.02, 16), steel);
    tyre.rotation.z = Math.PI / 2;
    wheel.add(tyre);
    const hub = new Mesh(new CylinderGeometry(radius * 0.18, radius * 0.18, 0.06, 8), brass);
    hub.rotation.z = Math.PI / 2;
    wheel.add(hub);
    for (let i = 0; i < 8; i++) {
      const spoke = new Mesh(new BoxGeometry(0.016, radius * 0.7, 0.016), soot);
      spoke.geometry.translate(0, radius * 0.4, 0);
      spoke.rotation.x = (i / 8) * Math.PI * 2;
      wheel.add(spoke);
    }
    const weight = new Mesh(new BoxGeometry(0.03, radius * 0.28, radius * 0.22), black);
    weight.position.set(0, radius * 0.62, 0);
    wheel.add(weight);
    parent.add(wheel);
    wheels.push(wheel);
  }
}

function box(
  parts: Mesh[],
  mat: Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  shadow = true,
): void {
  const mesh = new Mesh(new BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  parts.push(mesh);
}

function cyl(
  parts: Mesh[],
  mat: Material,
  radius: number,
  length: number,
  x: number,
  y: number,
  z: number,
  axis: "x" | "y" | "z",
  segments: number,
  shadow = true,
): void {
  const mesh = new Mesh(new CylinderGeometry(radius, radius, length, segments), mat);
  if (axis === "z") mesh.rotation.x = Math.PI / 2;
  if (axis === "x") mesh.rotation.z = Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  parts.push(mesh);
}

function sphere(
  parts: Mesh[],
  mat: Material,
  radius: number,
  x: number,
  y: number,
  z: number,
): void {
  const mesh = new Mesh(new SphereGeometry(radius, 12, 10), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parts.push(mesh);
}

/** Soft steam puffs rising off the chimney. */
export function createSteamSystem(anchor: Group): {
  root: Group;
  update: (dt: number, moving: boolean) => void;
} {
  const root = new Group();
  root.name = "steam";
  anchor.add(root);

  const mat = new MeshStandardMaterial({
    color: "#e7eef2",
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    roughness: 1,
    metalness: 0,
  });
  type Puff = { mesh: Mesh; age: number; life: number };
  const puffs: Puff[] = [];
  let emit = 0;

  return {
    root,
    update(dt: number, moving: boolean) {
      emit -= dt;
      if (moving && emit <= 0) {
        emit = 0.16 + Math.random() * 0.2;
        const mesh = new Mesh(new SphereGeometry(0.1, 8, 6), mat.clone());
        mesh.position.set((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.06);
        root.add(mesh);
        puffs.push({ mesh, age: 0, life: 1.8 + Math.random() * 0.9 });
      }
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.age += dt;
        const t = p.age / p.life;
        p.mesh.position.y += dt * 0.7;
        p.mesh.position.z -= dt * 0.12;
        p.mesh.scale.setScalar(0.55 + t * 2.2);
        (p.mesh.material as MeshStandardMaterial).opacity = 0.4 * (1 - t);
        if (p.age >= p.life) {
          root.remove(p.mesh);
          p.mesh.geometry.dispose();
          (p.mesh.material as MeshStandardMaterial).dispose();
          puffs.splice(i, 1);
        }
      }
    },
  };
}
