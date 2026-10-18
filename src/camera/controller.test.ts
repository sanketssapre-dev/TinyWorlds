import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { CAMERA } from "../config";
import { createCamera, snapCamera } from "./controller";
import { createFlightPath, getSampleAt } from "../railway/path";

describe("above-world camera", () => {
  it("keeps the overhead view aligned to the aircraft at maximum zoom", () => {
    const rig = createCamera(16 / 9);
    rig.overhead = true;
    rig.zoom = CAMERA.maxOverheadZoom;
    const sample = getSampleAt(createFlightPath(), 0);
    snapCamera(rig, sample);

    const cameraOffset = rig.camera.position.clone().sub(sample.position).normalize();
    const cameraDirection = rig.camera.getWorldDirection(new Vector3());

    expect(rig.camera.position.distanceTo(sample.position)).toBeCloseTo(CAMERA.maxOverheadZoom);
    expect(cameraOffset.dot(sample.normal)).toBeGreaterThan(0.999);
    expect(cameraDirection.dot(sample.normal.clone().negate())).toBeGreaterThan(0.999);
    expect(rig.camera.up.dot(sample.tangent)).toBeGreaterThan(0.999);
  });
});
