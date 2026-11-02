import { Group, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  adjustSpinZoom,
  createCamera,
  modeButtonLabel,
  snapCamera,
  toggleCameraMode,
  updateCamera,
} from "./controller";
import { CAMERA, PLANET } from "../config";
import { scratchSample } from "../railway/path";

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

  it("keeps the follow camera behind the train on open track", () => {
    const planet = new Group();
    const rig = createCamera(16 / 9, planet);
    const surfacePosition = new Vector3(PLANET.radius + 10, 0, 0);
    const normal = new Vector3(1, 0, 0);
    const tangent = new Vector3(0, 0, 1).projectOnPlane(normal).normalize();
    const binormal = tangent.clone().cross(normal).normalize();
    const sample = scratchSample();
    sample.position.copy(surfacePosition);
    sample.normal.copy(normal);
    sample.tangent.copy(tangent);
    sample.binormal.copy(binormal);
    snapCamera(rig, sample, new Group());
    updateCamera(rig, 1 / 60, sample, new Group());

    const expected = surfacePosition
      .clone()
      .addScaledVector(tangent, -CAMERA.followDistance)
      .addScaledVector(normal, CAMERA.followHeight)
      .addScaledVector(binormal, 3);
    expect(rig.camera.position.distanceTo(expected)).toBeLessThan(1e-5);
  });
});
