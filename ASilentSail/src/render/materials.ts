import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
} from "three";
import { PLANET } from "../config";
import grassNorUrl from "../../assets/textures/grass_nor.jpg";
import cliffDiffUrl from "../../assets/textures/cliff_diff.jpg";
import cliffNorUrl from "../../assets/textures/cliff_nor.jpg";
import rockDiffUrl from "../../assets/textures/rock_diff.jpg";
import snowDiffUrl from "../../assets/textures/snow_diff.jpg";
import snowNorUrl from "../../assets/textures/snow_nor.jpg";
import woodDiffUrl from "../../assets/textures/wood_diff.jpg";
import woodNorUrl from "../../assets/textures/wood_nor.jpg";
import metalDiffUrl from "../../assets/textures/metal_diff.jpg";
import metalNorUrl from "../../assets/textures/metal_nor.jpg";

/** Procedural tileable surfaces. Generated in-repo — no third-party texture pack. */

function hash(ix: number, iy: number, seed: number): number {
  let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function vnoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, seed: number): number {
  let a = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < 5; i++) {
    a += amp * vnoise(x * f, y * f, seed + i * 17);
    f *= 2.05;
    amp *= 0.5;
  }
  return a;
}

function makeTex(
  size: number,
  paint: (data: Uint8ClampedArray, size: number) => void,
  color = true,
): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const image = ctx.createImageData(size, size);
  paint(image.data, size);
  ctx.putImageData(image, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.colorSpace = color ? SRGBColorSpace : NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function paintRoof(data: Uint8ClampedArray, size: number): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / 18);
      const tile = (x + (row % 2) * 14) % 28 < 1.5 || y % 18 < 1.5;
      const n = fbm(x / 24, y / 24, 33);
      const i = (y * size + x) * 4;
      const r = tile ? 48 : 112 + n * 40;
      data[i] = r * 0.72;
      data[i + 1] = r * 0.32;
      data[i + 2] = r * 0.26;
      data[i + 3] = 255;
    }
  }
}

function paintStone(data: Uint8ClampedArray, size: number): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const bx = Math.floor(x / 36);
      const by = Math.floor(y / 22);
      const mortar = x % 36 < 2 || y % 22 < 2;
      const n = fbm(x / 20, y / 20, 40 + bx + by * 3);
      const i = (y * size + x) * 4;
      const g = mortar ? 70 : 120 + n * 60;
      data[i] = g * 0.95;
      data[i + 1] = g * 0.92;
      data[i + 2] = g * 0.86;
      data[i + 3] = 255;
    }
  }
}

function paintGreen(data: Uint8ClampedArray, size: number): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x / 50, y / 50, 27);
      const wear = n > 0.72 ? 18 : 0;
      const i = (y * size + x) * 4;
      data[i] = 28 + n * 16 + wear;
      data[i + 1] = 62 + n * 22;
      data[i + 2] = 42 + n * 10;
      data[i + 3] = 255;
    }
  }
}

function paintBrass(data: Uint8ClampedArray, size: number): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x / 40, y / 40, 44);
      const i = (y * size + x) * 4;
      data[i] = 176 + n * 50;
      data[i + 1] = 140 + n * 30;
      data[i + 2] = 62 + n * 16;
      data[i + 3] = 255;
    }
  }
}

function paintMoon(data: Uint8ClampedArray, size: number): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let h = fbm(u * 8, v * 4, 2) * 0.55;
      const mare = Math.exp(-((u - 0.35) ** 2 + (v - 0.45) ** 2) * 18);
      h -= mare * 0.25;
      for (let c = 0; c < 40; c++) {
        const cx = hash(c, 1, 7);
        const cy = hash(c, 2, 7);
        const rad = 0.015 + hash(c, 3, 7) * 0.04;
        const dx = Math.abs(u - cx);
        const d = Math.hypot(Math.min(dx, 1 - dx), v - cy);
        if (d < rad) h -= (1 - d / rad) * 0.35;
        else if (d < rad * 1.25) h += 0.08;
      }
      const i = (y * size + x) * 4;
      const g = 150 + h * 140;
      data[i] = g * 0.98;
      data[i + 1] = g * 0.97;
      data[i + 2] = g * 0.93;
      data[i + 3] = 255;
    }
  }
}

function vnoiseWrap(x: number, y: number, seed: number, period: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const p = period;
  const x0 = ((ix % p) + p) % p;
  const y0 = ((iy % p) + p) % p;
  const x1 = (x0 + 1) % p;
  const y1 = (y0 + 1) % p;
  const a = hash(x0, y0, seed);
  const b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed);
  const d = hash(x1, y1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbmTile(u: number, v: number, seed: number): number {
  let a = 0;
  let amp = 0.5;
  let f = 2;
  for (let i = 0; i < 5; i++) {
    a += amp * vnoiseWrap(u * f, v * f, seed + i * 17, f);
    f *= 2;
    amp *= 0.5;
  }
  return a;
}

function paintMeadow(data: Uint8ClampedArray, size: number): void {
  const blades = 36;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const broad = fbmTile(u, v, 4);
      const mid = fbmTile(u, v, 11);
      const warp = fbmTile(u, v, 8);
      const phase = (u * blades + warp * 1.6) * Math.PI * 2;
      const blade = Math.pow(Math.abs(Math.sin(phase)), 10);
      let r = 58 + broad * 70;
      let g = 86 + broad * 70 + mid * 24;
      let b = 32 + broad * 22;
      const dry = smooth01(mid, 0.52, 0.74);
      r = r * (1 - dry) + (148 + broad * 24) * dry;
      g = g * (1 - dry) + (128 + broad * 18) * dry;
      b = b * (1 - dry) + 52 * dry;
      const lush = smooth01(broad, 0.58, 0.8);
      r = r * (1 - lush) + (42 + mid * 16) * lush;
      g = g * (1 - lush) + (108 + mid * 30) * lush;
      b = b * (1 - lush) + (36 + mid * 10) * lush;
      r += blade * 22;
      g += blade * 36;
      b += blade * 8;
      const i = (y * size + x) * 4;
      data[i] = clampByte(r);
      data[i + 1] = clampByte(g);
      data[i + 2] = clampByte(b);
      data[i + 3] = 255;
    }
  }
}

function smooth01(v: number, a: number, b: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, v));
}

function paintCanvas(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  draw(ctx, w, h);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function drawGrass(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (let i = 0; i < 16; i++) {
    const x = w * (0.08 + hash(i, 2, 3) * 0.84);
    const tip = h * (0.06 + hash(i, 4, 3) * 0.28);
    const lean = (hash(i, 5, 3) - 0.5) * w * 0.22;
    const g = 58 + Math.floor(hash(i, 6, 3) * 42);
    const r = 24 + Math.floor(hash(i, 7, 3) * 28);
    ctx.strokeStyle = `rgba(${r},${g},${18 + Math.floor(hash(i, 8, 3) * 16)},0.95)`;
    ctx.lineWidth = 3.2 + hash(i, 9, 3) * 3.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, h - 2);
    ctx.quadraticCurveTo(x + lean * 0.35, h * 0.55, x + lean, tip);
    ctx.stroke();
  }
}

function drawEdelweiss(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = "#3c6828";
  ctx.beginPath();
  ctx.ellipse(w * 0.38, h * 0.84, w * 0.16, h * 0.05, -0.5, 0, Math.PI * 2);
  ctx.ellipse(w * 0.62, h * 0.84, w * 0.16, h * 0.05, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#4d7634";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.92);
  ctx.lineTo(w * 0.5, h * 0.4);
  ctx.stroke();
  const cx = w * 0.5;
  const cy = h * 0.34;
  for (let i = 0; i < 12; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((i / 12) * Math.PI * 2);
    ctx.fillStyle = i % 2 === 0 ? "#fffdf6" : "#f3efe2";
    ctx.beginPath();
    ctx.ellipse(w * 0.1, 0, w * 0.13, h * 0.028, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = "#e6b423";
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.045, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c4922a";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * w * 0.028, cy + Math.sin(a) * w * 0.028, w * 0.01, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBloom(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  petal: string,
  petalB: string,
  heart: string,
): void {
  const spots: Array<[number, number]> = [
    [0.32, 0.28],
    [0.58, 0.2],
    [0.74, 0.36],
    [0.4, 0.46],
    [0.66, 0.52],
  ];
  for (const [u, v] of spots) {
    const x = u * w;
    const y = v * h;
    ctx.strokeStyle = "#3d6a2c";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, h * 0.96);
    ctx.quadraticCurveTo(x + w * 0.04, y + h * 0.2, x, y + h * 0.06);
    ctx.stroke();
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      ctx.fillStyle = p % 2 === 0 ? petal : petalB;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * w * 0.055, y + Math.sin(a) * h * 0.05, w * 0.04, h * 0.025, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = heart;
    ctx.beginPath();
    ctx.arc(x, y, w * 0.022, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGentian(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const xs = [0.32, 0.5, 0.68];
  xs.forEach((u, i) => {
    const x = u * w;
    const top = h * (0.16 + i * 0.06);
    ctx.strokeStyle = "#3d6a2c";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x, h * 0.96);
    ctx.lineTo(x, top + h * 0.16);
    ctx.stroke();
    ctx.fillStyle = i === 1 ? "#2a468e" : "#3d62b0";
    ctx.beginPath();
    ctx.moveTo(x - w * 0.055, top + h * 0.16);
    ctx.lineTo(x - w * 0.085, top);
    ctx.quadraticCurveTo(x, top - h * 0.02, x + w * 0.085, top);
    ctx.lineTo(x + w * 0.055, top + h * 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#dfe6f4";
    ctx.fillRect(x - 1, top + 2, 2, h * 0.08);
  });
}

let grassCard: CanvasTexture | null = null;
let edelweissCard: CanvasTexture | null = null;
let butterCard: CanvasTexture | null = null;
let roseCard: CanvasTexture | null = null;
let gentianCard: CanvasTexture | null = null;

export function grassTuftMap(): CanvasTexture {
  if (!grassCard) grassCard = paintCanvas(128, 256, drawGrass);
  return grassCard;
}

export function edelweissMap(): CanvasTexture {
  if (!edelweissCard) edelweissCard = paintCanvas(160, 200, drawEdelweiss);
  return edelweissCard;
}

export function buttercupMap(): CanvasTexture {
  if (!butterCard) {
    butterCard = paintCanvas(180, 200, (ctx, w, h) => drawBloom(ctx, w, h, "#f0d24a", "#e2b42c", "#f7e7a2"));
  }
  return butterCard;
}

export function roseMap(): CanvasTexture {
  if (!roseCard) {
    roseCard = paintCanvas(180, 200, (ctx, w, h) => drawBloom(ctx, w, h, "#d4536a", "#a83850", "#f0c0b0"));
  }
  return roseCard;
}

export function gentianMap(): CanvasTexture {
  if (!gentianCard) gentianCard = paintCanvas(160, 220, drawGentian);
  return gentianCard;
}

function meadowTexture(): CanvasTexture {
  const tex = makeTex(512, paintMeadow);
  tex.anisotropy = 8;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function loadPhoto(url: string, color: boolean): Texture {
  const tex = new TextureLoader().load(url);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.colorSpace = color ? SRGBColorSpace : NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

let cache: Record<string, Texture> | null = null;

export function alpineMaps(): Record<string, Texture> {
  if (cache) return cache;
  const size = 256;
  cache = {
    grass: meadowTexture(),
    grassNor: loadPhoto(grassNorUrl, false),
    rock: loadPhoto(cliffDiffUrl, true),
    rockNor: loadPhoto(cliffNorUrl, false),
    snow: loadPhoto(snowDiffUrl, true),
    snowNor: loadPhoto(snowNorUrl, false),
    wood: loadPhoto(woodDiffUrl, true),
    woodNor: loadPhoto(woodNorUrl, false),
    roof: makeTex(size, paintRoof),
    stone: makeTex(size, paintStone),
    ballast: loadPhoto(rockDiffUrl, true),
    metal: loadPhoto(metalDiffUrl, true),
    metalNor: loadPhoto(metalNorUrl, false),
    paint: makeTex(size, paintGreen),
    brass: makeTex(size, paintBrass),
    moon: makeTex(512, paintMoon),
  };
  return cache;
}

export function mappedStandard(
  map: Texture,
  opts: { color?: string; roughness?: number; metalness?: number; normalMap?: Texture } = {},
): MeshStandardMaterial {
  return new MeshStandardMaterial({
    map,
    normalMap: opts.normalMap,
    color: opts.color ?? "#ffffff",
    roughness: opts.roughness ?? 0.86,
    metalness: opts.metalness ?? 0.02,
  });
}

/** Triplanar grass / rock / snow so the sphere is not a flat vertex-color ball. */
export function createAlpinePlanetMaterial(): MeshStandardMaterial {
  const maps = alpineMaps();
  const mat = new MeshStandardMaterial({
    map: maps.grass,
    roughness: 0.92,
    metalness: 0.02,
  });
  mat.customProgramCacheKey = () => "alpine-triplanar-v18";
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrass = { value: maps.grass };
    shader.uniforms.uRock = { value: maps.rock };
    shader.uniforms.uSnow = { value: maps.snow };
    shader.uniforms.uGrassNor = { value: maps.grassNor };
    shader.uniforms.uRockNor = { value: maps.rockNor };
    shader.uniforms.uSnowNor = { value: maps.snowNor };
    shader.uniforms.uRadius = { value: PLANET.radius };
    shader.uniforms.uScale = { value: new Vector2(0.11, 1.35) };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjNrm;",
      )
      .replace(
        "#include <beginnormal_vertex>",
        "#include <beginnormal_vertex>\nvObjPos = position;\nvObjNrm = normalize(objectNormal);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform sampler2D uGrass;
        uniform sampler2D uRock;
        uniform sampler2D uSnow;
        uniform sampler2D uGrassNor;
        uniform sampler2D uRockNor;
        uniform sampler2D uSnowNor;
        uniform float uRadius;
        uniform vec2 uScale;
        varying vec3 vObjPos;
        varying vec3 vObjNrm;
        vec3 triW(vec3 n) {
          vec3 w = pow(abs(n), vec3(8.0));
          return w / max(w.x + w.y + w.z, 1e-4);
        }
        vec3 triAt(sampler2D tex, vec3 p, vec3 n, float scale) {
          vec3 w = triW(n);
          vec3 x = texture2D(tex, p.yz * scale).rgb;
          vec3 y = texture2D(tex, p.xz * scale).rgb;
          vec3 z = texture2D(tex, p.xy * scale).rgb;
          return x * w.x + y * w.y + z * w.z;
        }
        float hash13(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.zyx + 31.32);
          return fract((p.x + p.y) * p.z);
        }
        float noise3(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
                mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
            mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
                mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
            f.z);
        }`,
      )
      .replace(
        "#include <map_fragment>",
        `
        vec3 n = normalize(vObjNrm);
        vec3 dir = normalize(vObjPos);
        float h = length(vObjPos) - uRadius;
        float slope = 1.0 - clamp(dot(n, dir), 0.0, 1.0);
        float px = length(fwidth(vObjPos));
        float near = smoothstep(1.6, 0.18, px);
        float detail = smoothstep(0.85, 0.1, px);
        float broad = noise3(dir * 3.2);
        float mottled = noise3(dir * 9.0);
        float turf = noise3(vObjPos * 0.45);
        float fine = noise3(vObjPos * 1.25);
        vec3 meadow = mix(vec3(0.15, 0.30, 0.08), vec3(0.30, 0.46, 0.13), fine);
        meadow = mix(meadow, vec3(0.48, 0.44, 0.16), smoothstep(0.56, 0.8, turf));
        meadow = mix(meadow, vec3(0.18, 0.36, 0.1), smoothstep(0.6, 0.86, noise3(vObjPos * 0.16)));
        vec3 spruce = mix(vec3(0.05, 0.14, 0.07), vec3(0.10, 0.20, 0.09), mottled);
        float strata = sin(h * 5.4 + noise3(dir * 11.0) * 2.4);
        vec3 rockC = mix(vec3(0.32, 0.34, 0.36), vec3(0.58, 0.59, 0.60), broad);
        rockC = mix(rockC * vec3(0.74, 0.76, 0.78), rockC * vec3(1.08, 1.06, 1.04), smoothstep(-0.35, 0.9, strata));
        rockC *= mix(1.0, 0.55, smoothstep(0.76, 0.94, noise3(vObjPos * 1.7)));
        vec3 snowC = mix(vec3(0.76, 0.83, 0.90), vec3(0.97, 0.98, 0.99), noise3(vObjPos * 3.2));
        float forestBand = smoothstep(0.8, 2.4, h) * (1.0 - smoothstep(5.2, 7.4, h));
        forestBand *= 1.0 - smoothstep(0.28, 0.55, slope);
        forestBand *= smoothstep(0.28, 0.62, noise3(dir * 5.5 + mottled));
        float rockW = max(smoothstep(0.14, 0.38, slope), smoothstep(3.8, 6.8, h));
        float snowW = smoothstep(7.0, 9.4, h);
        vec3 macro = mix(meadow, spruce, forestBand);
        macro = mix(macro, rockC, rockW);
        macro = mix(macro, snowC, snowW);
        macro *= mix(0.84, 1.06, broad);
        float photoScale = 0.28;
        vec3 grass = triAt(uGrass, vObjPos, n, photoScale);
        vec3 rock = triAt(uRock, vObjPos, n, photoScale);
        float rockLuma = dot(rock, vec3(0.3, 0.45, 0.25));
        rock = mix(rock, vec3(rockLuma), 0.7) * vec3(0.92, 0.95, 1.0);
        vec3 snow = triAt(uSnow, vObjPos, n, photoScale);
        vec3 photo = mix(grass, rock, rockW);
        photo = mix(photo, snow, snowW);
        photo = mix(photo, photo * vec3(0.42, 0.62, 0.46), forestBand * 0.7);
        vec3 albedo = mix(macro, photo, 0.22 + near * 0.72);
        float meadowMask = (1.0 - rockW) * (1.0 - snowW) * (1.0 - forestBand);
        float warp = noise3(vObjPos * 0.65);
        float streak = pow(abs(sin(vObjPos.x * 20.0 + vObjPos.z * 6.0 + warp * 5.0)), 4.0);
        float streakB = pow(abs(sin(vObjPos.z * 20.0 - vObjPos.x * 5.0 + warp * 4.0)), 4.0);
        float blades = max(streak, streakB * 0.85);
        albedo = mix(albedo, meadow * vec3(0.7, 1.25, 0.58), meadowMask * detail * blades * 0.42);
        float driftN = noise3(vObjPos * 0.2);
        float bloom = smoothstep(0.7, 0.88, driftN) * meadowMask * detail;
        float kind = noise3(dir * 4.5);
        vec3 bloomCol = mix(vec3(0.93, 0.91, 0.74), vec3(0.95, 0.76, 0.16), step(0.48, kind));
        bloomCol = mix(bloomCol, vec3(0.78, 0.32, 0.42), step(0.8, kind));
        albedo = mix(albedo, bloomCol, bloom * 0.26);
        float hem = smoothstep(0.1, 0.22, slope) * (1.0 - smoothstep(0.34, 0.52, slope)) * (1.0 - snowW);
        albedo = mix(albedo, albedo * vec3(0.82, 0.98, 0.5), hem * noise3(vObjPos * 2.1) * 0.45);
        float facing = clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);
        float limb = mix(0.92, 1.0, smoothstep(0.0, 0.08, facing));
        albedo *= mix(limb, 1.0, near);
        diffuseColor.rgb *= albedo;
        `,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          vec3 geoN = normalize(vObjNrm);
          float slopeN = 1.0 - clamp(dot(geoN, normalize(vObjPos)), 0.0, 1.0);
          float hN = length(vObjPos) - uRadius;
          float rockWN = smoothstep(0.22, 0.48, slopeN);
          float snowWN = smoothstep(0.15, 0.7, smoothstep(4.2, 8.2, hN));
          vec3 raw = mix(triAt(uGrassNor, vObjPos, geoN, 0.36), triAt(uRockNor, vObjPos, geoN, 0.36), rockWN);
          raw = mix(raw, triAt(uSnowNor, vObjPos, geoN, 0.36), snowWN);
          float usable = smoothstep(0.08, 0.25, raw.b);
          vec3 tn = raw * 2.0 - 1.0;
          vec3 N = normalize(normal);
          vec3 up = abs(N.y) < 0.98 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
          vec3 T = normalize(cross(up, N));
          vec3 B = cross(N, T);
          vec3 detailN = normalize(T * tn.x * 0.85 + B * tn.y * 0.85 + N * max(tn.z, 0.2));
          float nearN = smoothstep(0.38, 0.06, length(fwidth(vObjPos)));
          normal = normalize(mix(N, detailN, usable * nearN));
        }
        `,
      );
  };
  return mat;
}
