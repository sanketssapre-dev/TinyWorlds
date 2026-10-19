# Tiny Worlds

Two quiet spherical worlds in the same universe — and a parallel one where the seas have risen.

| World | Path (local dev) | GitHub Pages |
| --- | --- | --- |
| **A Silent Flight** — biplane cruise | `/ASilentFlight/` | `/TinyWorlds/ASilentFlight/` |
| **A Silent Sail** — yacht cruise on a flooded globe | `/ASilentSail/` | `/TinyWorlds/ASilentSail/` |

The repo root (`/`) is a small picker linking to both.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints, then choose **A Silent Flight** or **A Silent Sail**, or go directly to `/ASilentFlight/` or `/ASilentSail/`.

```bash
npm test
npm run build
npm run preview
```

## Controls

One button switches the camera and clears a free look. Drag to look. Scroll or pinch to zoom. `C` switches the view.

## Architecture

Vanilla TypeScript, Vite, and Three.js. The two worlds live in separate folders and do not import each other.

- `ASilentFlight/` — original **Silent Flight** app.
- `ASilentSail/` — **Silent Sail**. Shared helpers are copied under `ASilentSail/src/flight/` so this world can change without touching Flight.

GitHub Pages deploys the root picker at `/TinyWorlds/`, with each world at `/TinyWorlds/ASilentFlight/` and `/TinyWorlds/ASilentSail/`.
