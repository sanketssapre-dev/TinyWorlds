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
  it("starts in Train Follow and cycles spin, then the driver's view", () => {
    const planet = new Group();
    const rig = createCamera(16 / 9, planet);
    expect(rig.mode).toBe("trainFollow");
    expect(modeButtonLabel(rig)).toBe("Free Planet Spin");
    toggleCameraMode(rig);
    expect(rig.mode).toBe("freePlanetSpin");
    expect(modeButtonLabel(rig)).toBe("Driver's view");
    toggleCameraMode(rig);
    expect(rig.mode).toBe("cab");
    expect(modeButtonLabel(rig)).toBe("Train Follow");
    toggleCameraMode(rig);
    expect(rig.mode).toBe("trainFollow");
    expect(modeButtonLabel(rig)).toBe("Free Planet Spin");
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
    const spun = rig.spinZoom;
    toggleCameraMode(rig);
    expect(rig.mode).toBe("cab");
    adjustSpinZoom(rig, 50);
    expect(rig.spinZoom).toBe(spun);
  });
});
