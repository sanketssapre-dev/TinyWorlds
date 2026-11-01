---
name: Tiny Worlds — Swiss Alps
description: A quietly observed, autonomous miniature railway travelling through a richly layered Swiss Alpine world.
colors:
  gold: "#d4b36a"
  ink: "#e8dfc8"
  muted: "#b7ad96"
  panel: "rgba(10, 12, 18, 0.58)"
  night: "#04050a"
typography:
  display:
    fontFamily: '"Palatino Linotype", Palatino, "Times New Roman", serif'
    fontSize: "clamp(1.2rem, 2.6vw, 1.85rem)"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.08em"
  body:
    fontFamily: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif'
  label:
    fontFamily: '"Segoe UI", system-ui, sans-serif'
    fontSize: "0.95rem"
    letterSpacing: "0.02em"
rounded:
  pill: "999px"
spacing:
  chrome-inset: "1.4rem 1.6rem"
  control: "2.85rem"
components:
  camera-control:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    width: "{spacing.control}"
    height: "{spacing.control}"
---

# Design System: Tiny Worlds — Swiss Alps

## Overview

**Creative North Star: "A Swiss Alpine Railway Diorama."**

The visitor looks into a miniature world that keeps moving on its own: a paired railway winds through green valley floors, clustered chalets, layered forest, rocky slopes, and snowy Alpine massifs. The three supplied Swiss references set the landscape's ambition: composed, varied, and richly inhabited, with the railway integrated into the terrain rather than laid over it.

The planet is the experience; interface chrome stays quiet and peripheral. Keep the existing autonomous trains and camera modes intact. Build richness through varied terrain, material, and dense, legible scenery—not by making the world feel crowded with controls or unrelated spectacle.

**Key Characteristics:**
- Full-bleed, sunny Alpine landscape with the planet as the focal point.
- Miniature scale expressed through close, legible chalets, forests, rails, and terrain.
- Railway remains an independent, continuously running part of the world.
- Minimal, warm-toned controls recede behind the scenery.

## Colors

The landscape carries its color in the rendered world—sunlit meadow, forest, blue daylight, weathered stone, and glacial snow—while the interface uses a restrained warm-neutral palette.

### Primary
- **Alpine Gold** (`{colors.gold}`): Restrained interface accent for control borders and hover or focus emphasis.

### Neutral
- **Linen Ink** (`{colors.ink}`): High-contrast text and camera-control icon.
- **Muted Linen** (`{colors.muted}`): Secondary interface text.
- **Night** (`{colors.night}`): Canvas and loading fallback, not the daytime scene.
- **Glass Panel** (`{colors.panel}`): Translucent camera-control surface over the 3D world.

### Named Rules
**The Landscape-First Rule.** UI contrast must stay sufficient without competing with the world for attention.

## Typography

**Display Font:** Palatino Linotype, with Palatino and Times New Roman fallbacks
**Body Font:** Palatino Linotype, with Palatino, Book Antiqua, and Georgia fallbacks
**Label Font:** Segoe UI, system-ui, sans-serif

**Character:** The serif wordmark gives the miniature world a quiet, storybook quality. The sans-serif stack is reserved for compact controls and their functional labels.

### Hierarchy
- **World title** (500, `clamp(1.2rem, 2.6vw, 1.85rem)`, 1.2 line-height, `0.08em` letter spacing): Centered title-frame and compact persistent HUD wordmark.
- **HUD wordmark** (500, `clamp(0.7rem, 1.2vw, 0.92rem)`, 1.2 line-height): Small lower-left label, subordinate to the landscape.
- **Control label** (400, `0.95rem`, `0.02em` letter spacing): Functional camera controls when text labels are shown.

## Layout

The 3D world fills the viewport edge to edge. A sparse overlay anchors the wordmark at the lower left and camera control at the lower right, inset about `1.4rem`; the canvas remains the main visual surface. Preserve this framing across viewport sizes and keep controls reachable without obscuring trains or important scenery.

## Elevation & Depth

The world uses actual 3D terrain, objects, daylight, and cast shadows to establish depth. HUD elevation is deliberately light: one translucent, blurred control surface over the scene, without a stack of cards or a dashboard-like shell.

### Named Rules
**The World-Owns-Depth Rule.** Reserve dimensional layering and shadow for the landscape; keep the HUD to a single quiet surface.

## Shapes

Interface geometry is simple and rounded: the camera control is a compact pill with a fine, translucent linen border that shifts to Alpine Gold on hover or focus. Let the landscape use natural, irregular silhouettes—mountain ridges, forest edges, shorelines, and railway curves—rather than imposing interface-like geometry on the terrain.

## Components

### Buttons

- **Character:** A small, glass-dark camera-mode control that stays legible against changing scenery.
- **Shape:** Circular pill, `999px` radius; `2.85rem` square.
- **Color:** Translucent dark panel, linen icon, and a subtle linen border; the border and icon shift to Alpine Gold on hover or focus.
- **Hover / Focus:** Border and icon shift to Alpine Gold. Keep keyboard focus visibly distinguishable.
- **Behavior:** The icon button has a mode-aware accessible name; `C` also cycles camera modes.

### Signature Component: World Wordmark

The persistent “Tiny Worlds” label is a small serif caption at the lower-left edge. Keep it quiet, fixed to the viewport, and secondary to the moving scene.

## Do's and Don'ts

### Do:
- **Do** make the railway feel physically part of the landscape; open-ground rails and sleepers meet graded terrain.
- **Do** reserve viaducts for genuine crossings and elevated spans.
- **Do** build Alpine richness with layered forest, clustered Swiss chalets, textured earth and rock, and clear snowy peaks.
- **Do** give conifers irregularly spaced, drooping boughs, fine needle texture, and natural variation in silhouette and foliage color.
- **Do** build forest crowns from shared instanced bough geometry with a transparent needle atlas for close-up detail; do not add per-tree draw calls or tree shadow passes.
- **Do** shape lake coves in both terrain and water from the same bounded shoreline profile, with a turquoise shallow edge and darker glacial depth.
- **Do** keep the trains running and the camera modes available without requiring visitor input.
- **Do** keep the HUD small, warm, and subordinate to the scenery.

### Don't:
- **Don't** bury open-ground rails in terrain or leave them unsupported above it.
- **Don't** use a viaduct where the track should sit naturally on the land.
- **Don't** let sparse, repetitive scenery or oversized empty slopes replace the layered Swiss landscape.
- **Don't** use evenly stacked cone tiers or repeated, perfectly symmetrical tree crowns.
- **Don't** add persistent interface panels that compete with the autonomous railway.
