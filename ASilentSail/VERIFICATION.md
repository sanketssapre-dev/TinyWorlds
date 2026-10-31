# Verification report — Swiss Alps (ASilentSail)

Date: 2026-10-25  
Branch: `feature/asilentsail-swiss-alps`  
Scope: **ASilentSail/ only** (root Pages / AnExplore untouched)

## Commands run

| Command | Result |
| --- | --- |
| `npm test` | 128/128 passed (incl. new Sail railway, camera, scale tests) |
| `npx tsc --noEmit` | Clean |
| `npm run dev` → `/TinyWorlds/ASilentSail/` | App boots; loader hides; no `#error` |

## Browser checks (automated)

Automation cannot screenshot WebGL reliably in this environment; verification used canvas `readPixels` + runtime debug:

| Check | Result |
| --- | --- |
| Train Follow on load | Yes — mode `trainFollow`, camera near track (~r 75) |
| UI: BL button + BR “Tiny Worlds” | Present; button label “Free Planet Spin” |
| Toggle → Free Planet Spin | Mode switches; label becomes “Train Follow” |
| Ambient planet spin | `spinAngle` advances only in Free Planet Spin; stays 0 in Train Follow |
| Train keeps moving in spin | `trainDist` increases while spinning |
| Zoom gated | Unit test: wheel zoom ignored in Train Follow |
| Planet silhouette in spin | Corner pixels `#04050a` (space); centre green terrain |
| Moon / env independent | Moon lives under `environment`, not `planet-world` |

## Manual follow-ups (recommended on your machine)

1. Open http://localhost:5173/TinyWorlds/ASilentSail/
2. Confirm loco + 3 carriages, steam, track continuity through a full lap
3. Toggle camera; confirm no drag-orbit; wheel zoom only in Free Planet Spin
4. Confirm Moon holds still in space while the planet turns

## Known limitations

- Yacht world removed from this app folder; dormant `src/flight/` copy remains unused.
- Not published to GitHub Pages / root index (intentional).
- Tunnel portals / viaducts are simplified instances; further art pass welcome.
- Browser automation screenshots of the canvas stay black; use a real Chrome window for visual QA.
