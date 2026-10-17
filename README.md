# Tiny Worlds — A Quiet Flight

A small spherical fantasy world, ninety units across, and one propeller biplane cruising above it. Open the page and leave it running. The circuit takes a few quiet minutes. The planet is the subject: grasslands, forests, water, a village, and a handful of landmarks.

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (http://127.0.0.1:5173/). The biplane is already in the air.

```bash
npm test
npm run build
npm run preview
```

## Controls

One button switches the camera and clears a free look.

| View | Button |
| --- | --- |
| Behind the flight | Behind |
| Above the world | Above |

Drag looks around. Scroll, or a pinch, zooms. `C` switches the view as well.

## Architecture

Vanilla TypeScript, Vite, and Three.js.

| Module | Role |
| --- | --- |
| `src/config.ts` | Planet, flight, and camera scale |
| `src/planet/` | Terrain, scenery, water |
| `src/railway/path.ts` | Closed route, reused as the cruise path |
| `src/flight/biplane.ts` | Biplane and propeller |
| `src/camera/controller.ts` | Behind the flight, and above the world |
| `src/ui/hud.ts` | The camera button |
| `src/main.ts` | Renderer and loop |

The route is a closed latitude/longitude curve. The biplane holds a few units above the smoothed hills, and never dips into the ground. Motion is `speed × dt`. The propeller spins on its own so the flight still reads when the camera is wide.
