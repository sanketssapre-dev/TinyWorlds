import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Matrix4,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  SphereGeometry,
  SpotLight,
  Vector3,
} from "three";
import { FLIGHT } from "../config";
import { wrap01 } from "../math/sphere";
import { mergeRigidMeshes } from "../render/mergeRigid";
import { RailwayPath, getSampleAt, scratchSample } from "../railway/path";

const basis = new Matrix4();
const right = new Vector3();
const targetQuat = new Quaternion();
const localBank = new Quaternion();
const bankAxis = new Vector3(0, 0, 1);
const currentFwd = new Vector3();
const turnAxis = new Vector3();
const sunDirection = new Vector3(90, 55, 35).normalize();
const groundNormal = new Vector3();
const TURN = 0.72;

const cream = new MeshStandardMaterial({ color: "#e6d3ae", roughness: 0.55 });
const wing = new MeshStandardMaterial({ color: "#7a3030", roughness: 0.5 });
const wood = new MeshStandardMaterial({ color: "#3a2a20", roughness: 0.78 });
const brass = new MeshStandardMaterial({ color: "#c6a15a", roughness: 0.38, metalness: 0.45 });
const dark = new MeshStandardMaterial({ color: "#221c16", roughness: 0.65 });
const leather = new MeshStandardMaterial({ color: "#4a3024", roughness: 0.7 });
const canopyGlass = new MeshPhysicalMaterial({
  color: "#9fd0d8",
  roughness: 0.12,
  metalness: 0.02,
  transparent: true,
  opacity: 0.38,
  clearcoat: 0.9,
  clearcoatRoughness: 0.08,
  depthWrite: false,
  side: DoubleSide,
});
const searchLightLens = new MeshStandardMaterial({
  color: "#fff0ce",
  emissive: "#ffcf78",
  emissiveIntensity: 0.65,
  roughness: 0.22,
});
const propWood = makePropellerWood();

export type FlightState = {
  distance: number;
  speed: number;
  craft: Group;
  propeller: Group;
  searchLight: SpotLight;
  searchLightTarget: Object3D;
  wingLights: MeshStandardMaterial[];
  spin: number;
  posed: boolean;
};

export function createFlight(): FlightState {
  const craft = buildBiplane();
  const propeller = craft.getObjectByName("propeller") as Group;
  const { light: searchLight, target: searchLightTarget } = createSearchLight();
  craft.add(searchLight, searchLightTarget);
  const wingLights = craft.userData.wingLights as MeshStandardMaterial[];
  return {
    distance: 12,
    speed: FLIGHT.speed,
    craft,
    propeller,
    searchLight,
    searchLightTarget,
    wingLights,
    spin: 0,
    posed: false,
  };
}

export function updateFlight(state: FlightState, path: RailwayPath, dt: number): void {
  state.distance = wrap01(state.distance + state.speed * dt, path.totalLength);
  state.spin += dt * 22;
  pose(state, path, dt);
  state.propeller.rotation.z = state.spin;
  updateWingLights(state.wingLights, state.spin / 22);
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
  } else {
    currentFwd.set(0, 0, 1).applyQuaternion(state.craft.quaternion);
    turnAxis.crossVectors(currentFwd, f.tangent);
    const turn = Math.max(-0.35, Math.min(0.35, turnAxis.dot(f.normal)));
    localBank.setFromAxisAngle(bankAxis, -turn * 1.15);
    targetQuat.multiply(localBank);
    const k = 1 - Math.exp(-TURN * dt);
    state.craft.quaternion.slerp(targetQuat, k);
  }
  updateSearchLight(state, dt);
}

function buildBiplane(): Group {
  const g = new Group();
  g.name = "biplane";
  const hold = new Group();

  const body = new CylinderGeometry(0.16, 0.15, 1.25, 12);
  body.rotateX(Math.PI / 2);
  addGeo(hold, body, cream, 0, 0.28, -0.02);

  const nose = new CylinderGeometry(0.16, 0.155, 0.2, 16);
  nose.rotateX(Math.PI / 2);
  addGeo(hold, nose, brass, 0, 0.28, 0.69);
  const noseCap = new Mesh(new SphereGeometry(1, 16, 10), brass);
  noseCap.name = "rounded-engine-cowling";
  noseCap.position.set(0, 0.28, 0.77);
  noseCap.scale.set(0.155, 0.14, 0.1);
  noseCap.castShadow = true;
  hold.add(noseCap);

  add(hold, new BoxGeometry(0.22, 0.08, 0.2), leather, 0, 0.4, 0.12);
  addGeo(hold, new SphereGeometry(0.055, 8, 6), dark, 0, 0.44, 0.1);
  addCockpitCanopy(hold);
  addSearchLightFixture(hold);

  add(hold, new BoxGeometry(2.25, 0.035, 0.52), wing, 0, 0.16, 0.05);
  add(hold, new BoxGeometry(2.7, 0.03, 0.46), wing, 0, 0.62, 0.0);
  add(hold, new BoxGeometry(0.08, 0.04, 0.52), wood, -1.1, 0.16, 0.05);
  add(hold, new BoxGeometry(0.08, 0.04, 0.52), wood, 1.1, 0.16, 0.05);
  add(hold, new BoxGeometry(0.08, 0.035, 0.46), wood, -1.32, 0.62, 0);
  add(hold, new BoxGeometry(0.08, 0.035, 0.46), wood, 1.32, 0.62, 0);

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

  const rigid = [...hold.children].filter((mesh) => mesh !== noseCap) as Mesh[];
  hold.remove(noseCap);
  hold.clear();
  mergeRigidMeshes(g, rigid);
  g.add(noseCap);

  g.add(buildPropeller());
  addWingScript(g);
  g.userData.wingLights = addWingLights(g);

  return g;
}

function addCockpitCanopy(parent: Group): void {
  const canopy = new Mesh(new SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), canopyGlass);
  canopy.name = "covered-cockpit";
  canopy.position.set(0, 0.4, 0.04);
  canopy.scale.set(0.17, 0.18, 0.3);
  canopy.castShadow = false;
  parent.add(canopy);
}

function addSearchLightFixture(parent: Group): void {
  const housing = new CylinderGeometry(0.075, 0.095, 0.12, 10);
  addGeo(parent, housing, dark, 0, 0.1, -0.12);
  const lens = new Mesh(new SphereGeometry(0.065, 10, 8), searchLightLens);
  lens.name = "search-light-lens";
  lens.position.set(0, 0.025, -0.12);
  parent.add(lens);
}

function addWingLights(parent: Group): MeshStandardMaterial[] {
  const lights: MeshStandardMaterial[] = [];
  for (const x of [-1.34, 1.34]) {
    const material = new MeshStandardMaterial({
      color: "#e8fbff",
      emissive: "#75e5ff",
      emissiveIntensity: 0,
      roughness: 0.25,
    });
    const beacon = new Mesh(new SphereGeometry(0.045, 8, 6), material);
    beacon.name = "wing-edge-beacon";
    beacon.position.set(x, 0.655, 0);
    beacon.castShadow = false;
    parent.add(beacon);
    lights.push(material);
  }
  return lights;
}

function updateWingLights(lights: MeshStandardMaterial[], time: number): void {
  const phase = time % 1.5;
  const pulse = (start: number): number => {
    const t = phase - start;
    if (t < 0 || t > 0.14) return 0;
    return Math.min(1, t / 0.025, (0.14 - t) / 0.035);
  };
  const intensity = Math.max(pulse(0), pulse(0.22)) * 2.8;
  for (const light of lights) light.emissiveIntensity = intensity;
}

function createSearchLight(): { light: SpotLight; target: Object3D } {
  const target = new Object3D();
  target.name = "search-light-aim";
  target.position.set(0, -12, 1.5);

  const light = new SpotLight("#ffe6a3", 0, 26, 1.25, 0.9, 2);
  light.name = "aircraft-search-light";
  light.position.set(0, -0.2, -0.12);
  light.target = target;
  light.castShadow = false;
  light.visible = false;
  return { light, target };
}

function updateSearchLight(state: FlightState, dt: number): void {
  groundNormal.copy(state.craft.position).normalize();
  const night = groundNormal.dot(sunDirection) < -0.12;
  const targetIntensity = night ? 32 : 0;
  state.searchLight.intensity +=
    (targetIntensity - state.searchLight.intensity) * (1 - Math.exp(-3 * dt));
  state.searchLight.visible = state.searchLight.intensity > 0.1;
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

  const cap = new Mesh(new SphereGeometry(0.055, 12, 10), propWood);
  cap.name = "rounded-propeller-spinner";
  cap.position.set(0, 0, 0.075);
  cap.scale.set(1, 1, 1.25);
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

/** Crisp, narrow "Flying Rhino" print on the upper wing, readable from above. */
function addWingScript(parent: Group): void {
  const map = paintWingScript();
  if (!map) return;

  const plate = new Mesh(new PlaneGeometry(2.0, 0.3), wingScriptMaterial(map));
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
    metalness: 0.12,
    roughness: 0.42,
    clearcoat: 0.25,
    clearcoatRoughness: 0.3,
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
  canvas.width = 1600;
  canvas.height = 240;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const label = "Flying Rhino";
  const family = '"Arial Narrow", Arial, sans-serif';
  let size = 190;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${size}px ${family}`;
  const fit = (canvas.width * 0.92) / ctx.measureText(label).width;
  if (fit < 1) {
    size = Math.floor(size * fit);
    ctx.font = `700 ${size}px ${family}`;
  }

  const x = canvas.width / 2;
  const y = canvas.height / 2 + size * 0.04;

  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, size * 0.025);
  ctx.strokeStyle = "#3f1920";
  ctx.strokeText(label, x, y);

  ctx.save();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff2cc";
  ctx.fillText(label, x, y);
  ctx.restore();

  ctx.fillStyle = "#fff2cc";
  ctx.fillText(label, x, y);

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
