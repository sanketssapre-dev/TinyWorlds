import { Group } from "three";
import { describe, expect, it } from "vitest";
import {
  adjustSpinZoom,
  createCamera,
  modeButtonLabel,
  toggleCameraMode,
} from "./controller";
import { CAMERA } from "../config";

describe("camera modes", () => {
  it("starts in Train Follow and toggles to Free Planet Spin", () => {
    const planet = new Group();
    const rig = createCamera(16 / 9, planet);
    expect(rig.mode).toBe("trainFollow");
    expect(modeButtonLabel(rig)).toBe("Free Planet Spin");
    toggleCameraMode(rig);
    expect(rig.mode).toBe("freePlanetSpin");
    expect(modeButtonLabel(rig)).toBe("Train Follow");
  });

  it("only applies zoom in Free Planet Spin", () => {
    const planet = new Group();
    const rig = createCamera(16 / 9, planet);
    const before = rig.spinZoom;
    adjustSpinZoom(rig, 50);
    expect(rig.spinZoom).toBe(before);
    toggleCameraMode(rig);
    adjustSpinZoom(rig, 50);
    expect(rig.spinZoom).toBeGreaterThan(before);
    expect(rig.spinZoom).toBeLessThanOrEqual(CAMERA.maxSpinZoom);
  });
});
