import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeRigidMeshes } from "../flight/render/mergeRigid";
import { waterTime } from "../planet/water";
import { createPirateFlagTexture } from "./pirateFlag";

const HULL_Z0 = -0.4;
const HULL_Z1 = 0.74;
const HULL_BEAM = 0.138;
const HULL_DECK = 0.118;
const HULL_KEEL = -0.085;
const HULL_TIP = 0.024;
const HULL_SOLE = 0.042;

const hullGeo = createHullGeometry();
const deckGeo = createDeckGeometry();
const soleGeo = createSoleGeometry();
const bulkheadGeo = createBulkheadGeometry();
const railGeo = createRailGeometry();
const keelGeo = new BoxGeometry(0.03, 0.055, 0.72);
const thwartGeo = new BoxGeometry(0.18, 0.016, 0.042);
const cabinGeo = new BoxGeometry(0.13, 0.1, 0.18);
const roofGeo = new BoxGeometry(0.156, 0.022, 0.2);
const windowGeo = new BoxGeometry(0.01, 0.038, 0.055);
const mastGeo = new CylinderGeometry(0.012, 0.017, 1.05, 10);
const housingGeo = new CylinderGeometry(0.02, 0.028, 0.05, 10);
const lensGeo = new SphereGeometry(0.042, 12, 10);
const seamGeo = new BoxGeometry(0.17, 0.008, 0.012);
const cleatGeo = new BoxGeometry(0.046, 0.012, 0.018);
const rudderGeo = new BoxGeometry(0.012, 0.11, 0.055);
const tillerGeo = new BoxGeometry(0.015, 0.015, 0.12);
const stepGeo = new BoxGeometry(0.04, 0.02, 0.04);
const transomGeo = new BoxGeometry(HULL_BEAM * 1.72, hullSheer(0) - HULL_SOLE + 0.02, 0.03);
const stemGeo = new BoxGeometry(HULL_BEAM * 0.55, hullSheer(1) - HULL_SOLE + 0.02, 0.04);

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
const guestFlagGeo = createFlagGeometry(0.2, 0.12, 7);
const heroFlagGeo = createFlagGeometry(0.32, 0.2, 12);

type Palette = {
  hull: string;
  sail: string;
  flag: string;
};

const HERO: Palette = { hull: "#d8c4a0", sail: "#f4efe4", flag: "#5a1a8a" };
const GUESTS: Palette[] = [
  { hull: "#6b4228", sail: "#efe3cc", flag: "#c42828" },
  { hull: "#583828", sail: "#f7f2e8", flag: "#e6c12a" },
  { hull: "#4a3a2a", sail: "#f3ead8", flag: "#2a5fd4" },
  { hull: "#7a4a32", sail: "#efe6d4", flag: "#c42828" },
  { hull: "#3f3228", sail: "#f6f0e2", flag: "#e6c12a" },
  { hull: "#624836", sail: "#eee4d0", flag: "#2a5fd4" },
  { hull: "#513628", sail: "#f4ebda", flag: "#c42828" },
  { hull: "#6e5038", sail: "#f1e6d2", flag: "#e6c12a" },
  { hull: "#473328", sail: "#f8f1e4", flag: "#2a5fd4" },
];

export function buildHeroYacht(): Group {
  return buildYacht(HERO, 2.55, true, 29.25, true);
}

export function buildGuestYacht(variant: number): Group {
  return buildYacht(GUESTS[variant % GUESTS.length], 1.85, variant % 2 === 0, 19.8, false);
}

function buildYacht(palette: Palette, scale: number, cabin: boolean, lampPower: number, pirate: boolean): Group {
  const root = new Group();
  const visual = new Group();
  visual.name = "yacht-visual";
  const hullMat = new MeshStandardMaterial({ color: palette.hull, roughness: 0.42, side: DoubleSide });
  const sailMat = new MeshStandardMaterial({
    color: palette.sail,
    roughness: 0.62,
    side: DoubleSide,
  });
  flutter(sailMat, 0.04);
  const flagMat = pirateFlagMaterial(palette.flag, pirate);
  flutterFlag(flagMat, pirate ? 0.028 : 0.022);
  const rigid: Mesh[] = [];

  const part = (geo: BufferGeometry, mat: MeshStandardMaterial, x: number, y: number, z: number) => {
    const mesh = new Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    rigid.push(mesh);
  };

  const clothMesh = (geo: BufferGeometry, mat: MeshStandardMaterial) => {
    const mesh = new Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    visual.add(mesh);
  };

  part(hullGeo, hullMat, 0, 0, 0);
  part(deckGeo, deckMat, 0, 0, 0);
  part(soleGeo, cabinMat, 0, 0, 0);
  part(bulkheadGeo, hullMat, 0, 0, 0);
  part(railGeo, sparMat, 0, 0, 0);
  part(keelGeo, sparMat, 0, -0.08, -0.04);
  part(seamGeo, seamMat, 0, 0.118, 0.08);
  part(seamGeo, seamMat, 0, 0.118, -0.14);
  part(thwartGeo, deckMat, 0, 0.122, 0.16);
  part(thwartGeo, deckMat, 0, 0.122, -0.2);
  part(cleatGeo, sparMat, -0.05, 0.12, 0.24);
  part(cleatGeo, sparMat, 0.05, 0.12, 0.24);

  if (cabin) {
    part(cabinGeo, cabinMat, 0, 0.17, -0.02);
    part(roofGeo, roofMat, 0, 0.226, -0.02);
    part(windowGeo, glassMat, 0.066, 0.17, 0.02);
    part(windowGeo, glassMat, -0.066, 0.17, 0.02);
  } else {
    part(thwartGeo, deckMat, 0, 0.122, -0.02);
  }

  part(stepGeo, sparMat, 0, 0.118, 0.08);
  part(mastGeo, sparMat, 0, 0.63, 0.08);
  part(housingGeo, sparMat, 0, 1.175, 0.08);
  clothMesh(mainSailGeo, sailMat);
  clothMesh(jibGeo, sailMat);
  const flag = new Mesh(pirate ? heroFlagGeo : guestFlagGeo, flagMat);
  flag.name = pirate ? "pirate-flag" : "guest-flag";
  flag.position.set(0.02, 1.16, 0.08);
  flag.castShadow = true;
  flag.receiveShadow = true;
  visual.add(flag);
  part(rudderGeo, sparMat, 0, -0.02, -0.46);
  part(tillerGeo, deckMat, 0, 0.12, -0.36);
  part(transomGeo, hullMat, 0, (hullSheer(0) + HULL_SOLE) * 0.5, HULL_Z0 + 0.012);
  part(stemGeo, hullMat, 0, (hullSheer(1) + HULL_SOLE) * 0.5, HULL_Z1 - 0.018);

  for (const stay of [
    strut(new Vector3(0.02, 0.22, 0.06), new Vector3(0.14, 0.18, -0.38), 0.011, sparMat),
    strut(new Vector3(0, 0.1, 0.62), new Vector3(0, 0.09, 0.78), 0.01, sparMat),
    strut(new Vector3(0, 1.14, 0.08), new Vector3(0, 0.1, 0.76), 0.007, ropeMat),
    strut(new Vector3(0, 1.14, 0.08), new Vector3(0, 0.12, -0.42), 0.007, ropeMat),
    strut(new Vector3(0, 0.82, 0.08), new Vector3(0.15, 0.12, 0.0), 0.006, ropeMat),
    strut(new Vector3(0, 0.82, 0.08), new Vector3(-0.15, 0.12, 0.0), 0.006, ropeMat),
  ]) {
    if (stay) rigid.push(stay);
  }
  mergeRigidMeshes(visual, rigid);

  const lensMat = new MeshStandardMaterial({
    color: "#fff6d6",
    emissive: "#ffe08a",
    emissiveIntensity: 0.1,
    roughness: 0.18,
  });
  const lens = new Mesh(lensGeo, lensMat);
  lens.name = "masthead-lens";
  lens.position.set(0, 1.22, 0.08);
  lens.castShadow = false;
  visual.add(lens);

  const lamp = new PointLight("#fff1c4", lampPower, 117, 1.35);
  lamp.name = "masthead-lamp";
  lamp.position.set(0, 1.22, 0.08);
  lamp.castShadow = false;
  visual.add(lamp);
  const flagLamp = new PointLight("#fff3d0", 4.05, 10.8, 2);
  flagLamp.name = "mast-flag-lamp";
  flagLamp.position.set(0.12, 1.17, 0.08);
  flagLamp.castShadow = false;
  visual.add(flagLamp);
  visual.userData.mastIntensity = lampPower;
  visual.userData.mastLens = lensMat;

  visual.scale.setScalar(scale);
  visual.position.y = 0.08;
  root.add(visual);
  return root;
}

function hullHalfWidth(u: number): number {
  const bowStart = 1 - HULL_BEAM / (HULL_Z1 - HULL_Z0);
  if (u <= 0.22) return HULL_BEAM * (0.9 + 0.1 * (u / 0.22));
  if (u <= bowStart) return HULL_BEAM;
  const t = (u - bowStart) / (1 - bowStart);
  return Math.max(HULL_TIP, HULL_BEAM * Math.sqrt(Math.max(0, 1 - t * t)));
}

function hullSheer(u: number): number {
  const bow = Math.max(0, (u - 0.42) / 0.58);
  return HULL_DECK + bow * bow * 0.055;
}

function hullStation(u: number): number {
  return HULL_Z0 + u * (HULL_Z1 - HULL_Z0);
}

function createHullGeometry(): BufferGeometry {
  const rings = 40;
  const sides = 16;
  const cols = sides + 1;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const u = i / rings;
    const z = hullStation(u);
    const hw = hullHalfWidth(u);
    const deck = hullSheer(u);
    for (let j = 0; j <= sides; j++) {
      const ang = (j / sides) * Math.PI;
      const x = -hw * Math.cos(ang);
      const down = Math.sin(ang);
      const y = deck + (HULL_KEEL - deck) * Math.pow(down, 1.08);
      pos.push(x, y, z);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  return finishGeometry(pos, idx);
}

function createDeckGeometry(): BufferGeometry {
  const rings = 40;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const u = i / rings;
    const z = hullStation(u);
    const hw = hullHalfWidth(u);
    const y = hullSheer(u) + 0.003;
    pos.push(-hw, y, z, 0, y, z, hw, y, z);
  }
  for (let i = 0; i < rings; i++) {
    const a = i * 3;
    const n = a + 3;
    idx.push(a, a + 1, n, n, a + 1, n + 1);
    idx.push(a + 1, a + 2, n + 1, n + 1, a + 2, n + 2);
  }
  return finishGeometry(pos, idx);
}

function createSoleGeometry(): BufferGeometry {
  const rings = 40;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const u = i / rings;
    const z = hullStation(u);
    const hw = hullHalfWidth(u) * 0.92;
    const y = HULL_SOLE;
    pos.push(-hw, y, z, 0, y, z, hw, y, z);
  }
  for (let i = 0; i < rings; i++) {
    const a = i * 3;
    const n = a + 3;
    idx.push(a, n, a + 1, a + 1, n, n + 1);
    idx.push(a + 1, n + 1, a + 2, a + 2, n + 1, n + 2);
  }
  return finishGeometry(pos, idx);
}

function createBulkheadGeometry(): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const sides = 16;
  const addCap = (u: number, reverse: boolean) => {
    const z = hullStation(u);
    const hw = hullHalfWidth(u);
    const deck = hullSheer(u);
    const base = pos.length / 3;
    pos.push(0, HULL_SOLE, z);
    for (let j = 0; j <= sides; j++) {
      const ang = (j / sides) * Math.PI;
      const x = -hw * Math.cos(ang);
      const down = Math.sin(ang);
      const y = deck + (HULL_KEEL - deck) * Math.pow(down, 1.08);
      pos.push(x, y, z);
    }
    for (let j = 0; j < sides; j++) {
      const a = base;
      const b = base + 1 + j;
      const c = base + 2 + j;
      if (reverse) idx.push(a, c, b);
      else idx.push(a, b, c);
    }
  };
  addCap(0, true);
  addCap(1, false);
  return finishGeometry(pos, idx);
}

function createRailGeometry(): BufferGeometry {
  const rings = 40;
  const radial = 6;
  const radius = 0.011;
  const pos: number[] = [];
  const idx: number[] = [];
  const tangent = new Vector3();
  const normal = new Vector3();
  const binormal = new Vector3();
  const center = new Vector3();
  const prev = new Vector3();
  const next = new Vector3();

  const pointAt = (side: number, i: number, target: Vector3) => {
    const u = i / rings;
    const hw = hullHalfWidth(u);
    return target.set(side * hw, hullSheer(u) + 0.012, hullStation(u));
  };

  let vertBase = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i <= rings; i++) {
      pointAt(side, i, center);
      pointAt(side, Math.max(0, i - 1), prev);
      pointAt(side, Math.min(rings, i + 1), next);
      tangent.copy(next).sub(prev);
      if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, 1);
      tangent.normalize();
      normal.set(side, 0.35, 0).normalize();
      binormal.crossVectors(tangent, normal).normalize();
      normal.crossVectors(binormal, tangent).normalize();
      for (let k = 0; k < radial; k++) {
        const a = (k / radial) * Math.PI * 2;
        pos.push(
          center.x + (normal.x * Math.cos(a) + binormal.x * Math.sin(a)) * radius,
          center.y + (normal.y * Math.cos(a) + binormal.y * Math.sin(a)) * radius,
          center.z + (normal.z * Math.cos(a) + binormal.z * Math.sin(a)) * radius,
        );
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let k = 0; k < radial; k++) {
        const a = vertBase + i * radial + k;
        const b = vertBase + i * radial + ((k + 1) % radial);
        const c = a + radial;
        const d = b + radial;
        idx.push(a, c, b, b, c, d);
      }
    }
    vertBase += (rings + 1) * radial;
  }
  return finishGeometry(pos, idx);
}

function finishGeometry(pos: number[], idx: number[]): BufferGeometry {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  const uvs = new Float32Array((pos.length / 3) * 2);
  for (let i = 0; i < pos.length / 3; i++) {
    uvs[i * 2] = pos[i * 3] * 0.5 + 0.5;
    uvs[i * 2 + 1] = pos[i * 3 + 2] * 0.5 + 0.5;
  }
  geo.setAttribute("uv", new BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function strut(a: Vector3, b: Vector3, radius: number, mat: MeshStandardMaterial): Mesh | null {
  const dir = new Vector3().subVectors(b, a);
  const length = dir.length();
  if (length < 1e-4) return null;
  const mesh = new Mesh(new CylinderGeometry(radius, radius, length, 5), mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  return mesh;
}

function pirateFlagMaterial(hex: string, pirate: boolean): MeshStandardMaterial {
  if (!pirate) {
    return new MeshStandardMaterial({ color: hex, roughness: 0.5, side: DoubleSide });
  }
  return new MeshStandardMaterial({
    map: createPirateFlagTexture(),
    color: "#ffffff",
    roughness: 0.5,
    metalness: 0.04,
    side: DoubleSide,
    transparent: true,
    alphaTest: 0.35,
  });
}

function flutterFlag(mat: MeshStandardMaterial, amp: number): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterTime;
    shader.uniforms.uAmp = { value: amp };
    shader.vertexShader =
      "uniform float uTime;\nuniform float uAmp;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         float tip = smoothstep(0.02, 0.28, position.x);
         transformed.z += sin(uTime * 2.4 + position.x * 16.0 + position.y * 6.0) * tip * uAmp;
         transformed.y += sin(uTime * 1.8 + position.x * 11.0) * tip * uAmp * 0.45;`,
      );
  };
}

function createFlagGeometry(width: number, height: number, segs: number): BufferGeometry {
  const cols = segs;
  const rows = 6;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= cols; i++) {
    const u = i / cols;
    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      pos.push(u * width, (v - 0.5) * height, 0);
      uv.push(u, v);
    }
  }
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j;
      const b = a + rows + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute("uv", new BufferAttribute(new Float32Array(uv), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
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
