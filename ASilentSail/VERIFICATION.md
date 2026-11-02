# ASilentSail — staged railway

This folder is a staged app. It is in the repository and opens from the Vite dev server at `/TinyWorlds/ASilentSail/`. GitHub Pages publishes AnExplore only. `vite.config.ts` builds the root `index.html` and leaves this app out of `dist`.

The scene is the Swiss Alps railway: a 144-unit planet with snowy massifs, summer valleys, forest belts, clustered chalets, broad twin railway lines with wide ties, and three carriages on each autonomous consist. Loose boulder scatter and dry-stone piles are excluded; natural rock faces and lake-crossing viaducts remain. Lake transparency varies with depth and the dark sky retains visible stars. There are no tunnels or overhead tunnel covers. The camera cycles Train Follow, Free Planet Spin, and the driver’s view. “Tiny Worlds” is at the bottom left. The camera pin is at the bottom right and names the next mode.

## Check locally

From the repo root:

```bash
npm test
npx tsc --noEmit
npm run dev
```

Open http://localhost:5173/TinyWorlds/ASilentSail/

On a real browser window:

1. The chase starts behind our train, with the oncoming road beside it and the sunny Alpine valley ahead.
2. Both roads meet the graded meadow in open sections; only lake crossings and deep spans use stone viaducts.
3. `C` or the pin cycles Train Follow, Free Planet Spin, then the driver’s view.
4. The wheel zooms only in Free Planet Spin. Drag does not orbit.
5. In Free Planet Spin the planet turns and the Moon stays put in space.

## Retired notes

A checklist dated 2026-10-25 described an earlier build: a camera near radius 75, a two-mode camera, and the pin on the left. Those notes do not describe the current app.
