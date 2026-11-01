# Tiny Worlds

One spherical world is published. Two more are in the repository and run on the local dev server only.

## Published

**AnExplore** is the GitHub Pages site. The root `index.html` loads `AnExplore/src/main.ts`. Vite’s production input is that file alone (`vite.config.ts`), with `base` `/TinyWorlds/`.

A push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): Node 20, `npm run build`, then the `dist` artifact is deployed to GitHub Pages. `npm run build` typechecks every app, then emits AnExplore.

Locally, after `npm run dev`:

**http://localhost:5173/TinyWorlds/**

AnExplore is a biplane over a small planet. The title sits at the bottom left. Two buttons sit at the bottom right: autopilot or manual flight, and the camera. `A` and `M` set the flight mode. `C` switches between the chase and the overhead view. Arrow keys steer and climb while flying by hand. The wheel zooms. On a touch screen, drag steers and a pinch zooms.

## Staged

`ASilentFlight/` and `ASilentSail/` are in git. The Vite dev server opens them. The production build leaves them out, so they are absent from GitHub Pages.

| World | Local URL | What it is |
| --- | --- | --- |
| **A Silent Flight** | http://localhost:5173/TinyWorlds/ASilentFlight/ | Earlier biplane cruise |
| **A Silent Sail** | http://localhost:5173/TinyWorlds/ASilentSail/ | Swiss Alps railway. The folder name remains from the old yacht app. See [ASilentSail/README.md](ASilentSail/README.md). |

## Run

```bash
npm install
npm run dev
```

```bash
npm test
npm run build
npm run preview
```

## Architecture

Vanilla TypeScript, Vite 5, and Three.js. The three apps live in separate folders and do not import each other.

- `AnExplore/` — the published site.
- `ASilentFlight/` — staged flight world.
- `ASilentSail/` — staged railway. `ASilentSail/src/flight/` is an unused copy and is not part of the train scene.
