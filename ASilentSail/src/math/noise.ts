/** Deterministic 3D value noise and FBM for terrain and placement. */

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hash3(ix: number, iy: number, iz: number, seed: number): number {
  let n = ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 1013904223;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

export function valueNoise3(
  x: number,
  y: number,
  z: number,
  seed = 17,
): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const fz = fade(z - iz);

  const n000 = hash3(ix, iy, iz, seed);
  const n100 = hash3(ix + 1, iy, iz, seed);
  const n010 = hash3(ix, iy + 1, iz, seed);
  const n110 = hash3(ix + 1, iy + 1, iz, seed);
  const n001 = hash3(ix, iy, iz + 1, seed);
  const n101 = hash3(ix + 1, iy, iz + 1, seed);
  const n011 = hash3(ix, iy + 1, iz + 1, seed);
  const n111 = hash3(ix + 1, iy + 1, iz + 1, seed);

  const nx00 = lerp(n000, n100, fx);
  const nx10 = lerp(n010, n110, fx);
  const nx01 = lerp(n001, n101, fx);
  const nx11 = lerp(n011, n111, fx);
  const nxy0 = lerp(nx00, nx10, fy);
  const nxy1 = lerp(nx01, nx11, fy);
  return lerp(nxy0, nxy1, fz) * 2 - 1;
}

export function fbm3(
  x: number,
  y: number,
  z: number,
  octaves = 5,
  lacunarity = 2,
  gain = 0.5,
  seed = 17,
): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise3(x * freq, y * freq, z * freq, seed + i * 19);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export function hash01(x: number, y: number, z: number, seed = 3): number {
  return (valueNoise3(x * 12.9898, y * 78.233, z * 37.719, seed) + 1) * 0.5;
}
