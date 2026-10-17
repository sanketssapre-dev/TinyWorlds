import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Matrix4,
  PlaneGeometry,
  PointLight,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  SphereGeometry,
  Vector3,
} from "three";
import { FLIGHT } from "../config";
import { mergeRigidMeshes } from "../render/mergeRigid";
import { wrap01 } from "../math/sphere";
import { RailwayPath, getSampleAt, scratchSample } from "../railway/path";

const basis = new Matrix4();
const right = new Vector3();
const targetQuat = new Quaternion();
const localBank = new Quaternion();
const bankAxis = new Vector3(0, 0, 1);
const currentFwd = new Vector3();
const turnAxis = new Vector3();

const TURN = 0.72;

const cream = new MeshStandardMaterial({ color: "#e6d3ae", roughness: 0.55 });
const wing = new MeshStandardMaterial({ color: "#7a3030", roughness: 0.5 });
const wood = new MeshStandardMaterial({ color: "#3a2a20", roughness: 0.78 });
const brass = new MeshStandardMaterial({ color: "#c6a15a", roughness: 0.38, metalness: 0.45 });
const dark = new MeshStandardMaterial({ color: "#221c16", roughness: 0.65 });
const leather = new MeshStandardMaterial({ color: "#4a3024", roughness: 0.7 });
const glass = new MeshStandardMaterial({
  color: "#9fd0d8",
  roughness: 0.15,
  metalness: 0.05,
  transparent: true,
  opacity: 0.55,
});
const propWood = makePropellerWood();

export type FlightState = {
  distance: number;
  speed: number;
  craft: Group;
  propeller: Group;
  spin: number;
  posed: boolean;
};

export function createFlight(): FlightState {
  const craft = buildBiplane();
  const propeller = craft.getObjectByName("propeller") as Group;
  return {
    distance: 12,
    speed: FLIGHT.speed,
    craft,
    propeller,
    spin: 0,
    posed: false,
  };
}

export function updateFlight(state: FlightState, path: RailwayPath, dt: number): void {
  state.distance = wrap01(state.distance + state.speed * dt, path.totalLength);
  state.spin += dt * 22;
  pose(state, path, dt);
  state.propeller.rotation.z = state.spin;
}

function pose(state: FlightState, path: RailwayPath, dt: number): void {
  const f = getSampleAt(path, state.distance, scratchSample());
  state.craft.position.copy(f.position);
  right.copy(f.binormal).negate();
  basis.makeBasis(right, f.normal, f.tangent);
  targetQuat.setFromRotationMatrix(basis);

  if (!state.posed) {
    state.craft.quaternion.copy(targetQuat);
    state.posed = true;
    return;
  }

  currentFwd.set(0, 0, 1).applyQuaternion(state.craft.quaternion);
  turnAxis.crossVectors(currentFwd, f.tangent);
  const turn = Math.max(-0.35, Math.min(0.35, turnAxis.dot(f.normal)));
  localBank.setFromAxisAngle(bankAxis, -turn * 1.15);
  targetQuat.multiply(localBank);
  const k = 1 - Math.exp(-TURN * dt);
  state.craft.quaternion.slerp(targetQuat, k);
}

function buildBiplane(): Group {
  const g = new Group();
  g.name = "biplane";
  const hold = new Group();

  const body = new CylinderGeometry(0.16, 0.15, 1.25, 12);
  body.rotateX(Math.PI / 2);
  addGeo(hold, body, cream, 0, 0.28, -0.02);

  const nose = new CylinderGeometry(0.1, 0.155, 0.28, 12);
  nose.rotateX(Math.PI / 2);
  addGeo(hold, nose, brass, 0, 0.28, 0.72);

  add(hold, new BoxGeometry(0.22, 0.08, 0.2), leather, 0, 0.4, 0.12);
  add(hold, new BoxGeometry(0.16, 0.1, 0.012), glass, 0, 0.44, 0.22);
  addGeo(hold, new SphereGeometry(0.055, 8, 6), dark, 0, 0.44, 0.1);

  add(hold, new BoxGeometry(2.7, 0.035, 0.52), wing, 0, 0.16, 0.05);
  add(hold, new BoxGeometry(2.45, 0.03, 0.46), wing, 0, 0.62, 0.0);
  add(hold, new BoxGeometry(0.08, 0.04, 0.52), wood, -1.32, 0.16, 0.05);
  add(hold, new BoxGeometry(0.08, 0.04, 0.52), wood, 1.32, 0.16, 0.05);

  for (const x of [-0.55, 0.55]) {
    add(hold, new BoxGeometry(0.03, 0.46, 0.03), wood, x, 0.39, 0.16);
    add(hold, new BoxGeometry(0.025, 0.46, 0.025), wood, x, 0.39, -0.08);
  }
  add(hold, new BoxGeometry(0.02, 0.46, 0.02), wood, -0.16, 0.39, 0.02);
  add(hold, new BoxGeometry(0.02, 0.46, 0.02), wood, 0.16, 0.39, 0.02);

  add(hold, new BoxGeometry(0.78, 0.03, 0.26), wing, 0, 0.34, -0.7);
  add(hold, new BoxGeometry(0.035, 0.32, 0.3), wing, 0, 0.5, -0.74);
  add(hold, new BoxGeometry(0.02, 0.16, 0.12), cream, 0, 0.62, -0.86);

  for (const x of [-0.18, 0.18]) {
    add(hold, new BoxGeometry(0.025, 0.2, 0.025), wood, x, 0.1, 0.22);
    const wheel = new Mesh(new CylinderGeometry(0.075, 0.075, 0.035, 12), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.02, 0.22);
    wheel.castShadow = true;
    hold.add(wheel);
    const hub = new CylinderGeometry(0.028, 0.028, 0.05, 8);
    hub.rotateZ(Math.PI / 2);
    addGeo(hold, hub, brass, x, 0.02, 0.22);
  }
  add(hold, new BoxGeometry(0.4, 0.02, 0.02), wood, 0, 0.02, 0.22);
  add(hold, new BoxGeometry(0.02, 0.08, 0.12), wood, 0, 0.08, -0.78);

  for (const x of [-0.12, 0.12]) {
    const pipe = new CylinderGeometry(0.015, 0.015, 0.16, 6);
    pipe.rotateX(Math.PI / 2);
    addGeo(hold, pipe, dark, x, 0.36, 0.48);
  }

  const rigid = [...hold.children] as Mesh[];
  hold.clear();
  mergeRigidMeshes(g, rigid);

  g.add(buildPropeller());
  addWingScript(g);

  addBellyLamp(g, 0, 0.05);
  addBellyLamp(g, -1.05, -0.05);
  addBellyLamp(g, 1.05, -0.05);

  return g;
}

/** Wooden blades and hub. Pitch is baked into the blade geometry so each mesh only turns around the shaft. */
function buildPropeller(): Group {
  const prop = new Group();
  prop.name = "propeller";
  prop.position.set(0, 0.28, 0.9);

  const hubGeo = new CylinderGeometry(0.055, 0.055, 0.09, 12);
  hubGeo.rotateX(Math.PI / 2);
  const hub = new Mesh(hubGeo, propWood);
  hub.castShadow = true;
  prop.add(hub);

  const capGeo = new ConeGeometry(0.052, 0.1, 12);
  capGeo.rotateX(Math.PI / 2);
  capGeo.translate(0, 0, 0.09);
  const cap = new Mesh(capGeo, propWood);
  cap.castShadow = true;
  prop.add(cap);

  // Twist the plank around its span (Y) while it is still centered, then slide it out along that ray.
  const bladeGeo = new BoxGeometry(0.072, 0.34, 0.02);
  bladeGeo.rotateY(0.38);
  bladeGeo.translate(0, 0.22, 0.02);
  for (let i = 0; i < 2; i++) {
    const blade = new Mesh(bladeGeo, propWood);
    blade.rotation.z = i * Math.PI;
    blade.castShadow = true;
    prop.add(blade);
  }

  return prop;
}

/** Cursive gold "FlyingRhino" on the upper wing, readable from above and from behind. */
function addWingScript(parent: Group): void {
  const map = paintWingScript();
  if (!map) return;

  const plate = new Mesh(new PlaneGeometry(2.16, 0.38), wingScriptMaterial(map));
  plate.name = "wing-script";
  // Plane starts facing +Z with text upright. Tip it onto the wing, then mirror X/Y so
  // the line runs left-to-right on screen and the letter tops point toward the nose.
  plate.rotation.x = -Math.PI / 2;
  plate.scale.set(-1, -1, 1);
  plate.position.set(0, 0.643, 0);
  plate.castShadow = false;
  parent.add(plate);
}

function wingScriptMaterial(map: CanvasTexture): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    map,
    color: "#fff8e4",
    emissive: "#ffbf45",
    emissiveMap: map,
    emissiveIntensity: 0.48,
    metalness: 0.82,
    roughness: 0.22,
    clearcoat: 0.9,
    clearcoatRoughness: 0.16,
    transparent: true,
    alphaTest: 0.05,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: DoubleSide,
  });
}

function paintWingScript(): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 360;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const label = "FlyingRhino";
  const family = '"Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive';
  let size = 280;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${size}px ${family}`;
  const fit = (canvas.width * 0.9) / ctx.measureText(label).width;
  if (fit < 1) {
    size = Math.floor(size * fit);
    ctx.font = `600 ${size}px ${family}`;
  }

  const x = canvas.width / 2;
  const y = canvas.height / 2 + size * 0.04;

  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(6, size * 0.045);
  ctx.strokeStyle = "#4a300c";
  ctx.strokeText(label, x, y);

  ctx.save();
  ctx.shadowColor = "#ffd36a";
  ctx.shadowBlur = size * 0.16;
  ctx.fillStyle = "#b8862a";
  ctx.fillText(label, x, y);
  ctx.restore();

  const gold = ctx.createLinearGradient(0, y - size * 0.55, 0, y + size * 0.5);
  gold.addColorStop(0, "#fff7d6");
  gold.addColorStop(0.28, "#f3d27a");
  gold.addColorStop(0.48, "#e0ae3c");
  gold.addColorStop(0.62, "#fff1c2");
  gold.addColorStop(0.8, "#c8922a");
  gold.addColorStop(1, "#7a5414");
  ctx.fillStyle = gold;
  ctx.fillText(label, x, y);

  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  const sheen = ctx.createLinearGradient(0, y - size * 0.48, 0, y + size * 0.05);
  sheen.addColorStop(0, "rgba(255, 252, 236, 0)");
  sheen.addColorStop(0.42, "rgba(255, 252, 236, 0.15)");
  sheen.addColorStop(0.55, "rgba(255, 250, 230, 0.72)");
  sheen.addColorStop(0.7, "rgba(255, 252, 236, 0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  map.needsUpdate = true;
  return map;
}

function makePropellerWood(): MeshStandardMaterial {
  const w = 64;
  const h = 128;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const wave = Math.sin(v * Math.PI * 16 + Math.sin(u * 11) * 0.85);
      const pore = Math.sin(v * Math.PI * 42 + u * 4);
      const knot = Math.exp(-((u - 0.32) ** 2) * 26 - ((v - 0.7) ** 2) * 70);
      const t = Math.min(1, Math.max(0, 0.58 + wave * 0.2 + pore * 0.05 - knot * 0.38));
      const i = (y * w + x) * 4;
      data[i] = Math.round(96 + t * 136);
      data[i + 1] = Math.round(52 + t * 112);
      data[i + 2] = Math.round(24 + t * 70);
      data[i + 3] = 255;
    }
  }
  const map = new DataTexture(data, w, h);
  map.wrapS = RepeatWrapping;
  map.wrapT = RepeatWrapping;
  map.magFilter = LinearFilter;
  map.minFilter = LinearFilter;
  map.colorSpace = SRGBColorSpace;
  map.needsUpdate = true;
  return new MeshStandardMaterial({ map, roughness: 0.82, metalness: 0 });
}

const bulbMat = new MeshStandardMaterial({
  color: "#ffe6c4",
  emissive: "#ffc56a",
  emissiveIntensity: 1.6,
});

function addBellyLamp(parent: Group, x: number, z: number): void {
  const lamp = new PointLight("#ffd2a0", x === 0 ? 3 : 1.2, 6, 2);
  lamp.position.set(x, -0.15, z);
  parent.add(lamp);

  const bulb = new Mesh(new SphereGeometry(0.04, 8, 8), bulbMat);
  bulb.position.set(x, -0.02, z);
  parent.add(bulb);
}

function add(
  parent: Group,
  geo: BoxGeometry,
  mat: MeshStandardMaterial,
  x: number,
  y: number,
  z: number,
): Mesh {
  return addGeo(parent, geo, mat, x, y, z);
}

function addGeo(
  parent: Group,
  geo: BufferGeometry,
  mat: MeshStandardMaterial,
  x: number,
  y: number,
  z: number,
): Mesh {
  const mesh = new Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
