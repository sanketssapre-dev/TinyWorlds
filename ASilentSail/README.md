# Tiny Worlds — Swiss Alps railway

Staged app in `ASilentSail/`. The folder name remains from the old yacht world. The scene is a closed mountain railway on a spherical Alpine planet: a forest-green steam locomotive, three carriages, a second train on a parallel road, stone viaducts over the lakes the line crosses, tunnels whose roofs continue the meadow, and a cratered Moon.

GitHub Pages publishes **AnExplore** from the repo root. This railway is in the repository and runs from the Vite dev server. The production build does not emit it.

## Run locally

From the repo root:

```bash
npm install
npm run dev
```

Open:

**http://localhost:5173/TinyWorlds/ASilentSail/**

The Vite `base` is `/TinyWorlds/`.

```bash
npm test
```

`npm test` and `tsc` include this app together with AnExplore and ASilentFlight.

## Controls

| Input | Action |
| --- | --- |
| Camera pin, bottom right | Cycle **Train Follow** → **Free Planet Spin** → **Driver's view** |
| `C` | Same as the camera pin |
| Mouse wheel / pinch | Zoom only in Free Planet Spin |

The words “Tiny Worlds” sit at the bottom left. The pin’s accessible name is the next mode (`Switch camera to …`). The trains run on their own. Free Planet Spin turns the planet; drag does not orbit. The driver’s view sits in the cab, with its own field of view, and does not zoom or spin the planet.

## The world

- Planet radius **96**. Relief runs from about **-1.2** to **12**.
- One Moon, radius **26**, about **4.5** planet radii out. Moon, stars, and sun stay outside the rotating planet group.
- Two roads, **1.36** apart. Our train takes the left road. The oncoming train takes the right and travels the other way. Each consist is one locomotive and three carriages.
- The wooden base under the sleepers is only where the rails are held more than **0.6** above the ground. Calm meadow shows sleepers on the grass. Lake crossings are stone viaducts. Tunnel roofs are the surrounding meadow, with rock at the stone mouth.

## Layout

| Path | Role |
| --- | --- |
| `src/main.ts` | Scene wiring, planet group, input |
| `src/planet/` | Terrain, mesh, scenery, lakes |
| `src/railway/` | Closed path, formation shelf, track, viaducts, tunnels |
| `src/train/` | Locomotive, carriages, steam, second consist |
| `src/camera/` | Train Follow, Free Planet Spin, driver’s view |
| `src/ui/` | Title and camera pin |
| `src/flight/` | Dormant Flight copy. Unused by this world. |

## Assets / licensing

Surface photos are CC0 from [Poly Haven](https://polyhaven.com/license): `aerial_grass_rock`, `cliff_side`, `rock_face`, `snow_02`, `wood_planks`, `metal_plate` (1k diffuse and normal). Files live in `assets/textures/`. Roof tiles, locomotive paint, brass, and the Moon map are generated in `src/render/materials.ts`. The planet blends grass, cliff, and snow in a triplanar shader by slope and elevation.
