# Tiny Worlds — Swiss Alps (train world)

The former **Sail / yacht** app in this folder has been **replaced** by the Swiss Alps **steam-train** world from the master prompt. Folder name remains `ASilentSail/` for now (URL unchanged); content is trains, not sails.

Local Alpine miniature: spherical planet, closed mountain railway, vintage steam train, cratered Moon. **Not** linked from the repo root or GitHub Pages yet.

## Run locally

From the repo root:

```bash
npm install
npm run dev
```

Open:

**http://localhost:5173/TinyWorlds/ASilentSail/**

(The Vite `base` is `/TinyWorlds/`.)

```bash
npm test
```

## Controls

| Input | Action |
| --- | --- |
| Bottom-left button | Toggle **Train Follow** ↔ **Free Planet Spin** |
| `C` | Same as the camera button |
| Mouse wheel / pinch | Zoom **only** in Free Planet Spin |

No train controls — the consist runs continuously. Free Planet Spin rotates the planet automatically; drag does not orbit.

## Scale notes

- Planet radius **72** (enlarged from the old yacht world’s 45).
- Single Moon at **~4.5×** planet radius, radius ~Earth ratio (~1/3.7).
- Moon and starfield stay outside the rotating planet group.

## Layout

| Path | Role |
| --- | --- |
| `src/main.ts` | Scene wiring, planet group, input |
| `src/planet/` | Terrain, mesh, scenery, water |
| `src/railway/` | Closed path + track mesh |
| `src/train/` | Locomotive, carriages, steam |
| `src/camera/` | Train Follow / Free Planet Spin |
| `src/ui/` | Minimal HUD (two elements) |
| `src/flight/` | Dormant Flight copy — unused by this world |

## Assets / licensing

Surface photos are CC0 from [Poly Haven](https://polyhaven.com/license): `aerial_grass_rock`, `cliff_side`, `rock_face`, `snow_02`, `wood_planks`, `metal_plate` (1k diffuse and normal). Files live in `assets/textures/`. Roof tiles, locomotive paint, brass, and the Moon map are still generated in `src/render/materials.ts`. The planet blends grass, cliff, and snow in a triplanar shader by slope and elevation.
