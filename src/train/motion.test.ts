import { describe, expect, it } from "vitest";
import { createRailwayPath } from "../railway/path";
import { createTrain, updateTrain } from "./motion";

const path = createRailwayPath(512);

describe("train motion", () => {
  it("advances by speed × elapsed time and wraps the circuit", () => {
    const train = createTrain();
    train.distance = path.totalLength - 1;
    train.speed = 4;
    train.paused = false;
    updateTrain(train, path, 0.5);
    expect(train.distance).toBeCloseTo(1, 5);
  });

  it("matches two half-steps to one full step", () => {
    const a = createTrain();
    const b = createTrain();
    a.distance = b.distance = 20;
    a.speed = b.speed = 3.5;
    updateTrain(a, path, 0.4);
    updateTrain(b, path, 0.1);
    updateTrain(b, path, 0.3);
    expect(a.distance).toBeCloseTo(b.distance, 5);
  });

  it("preserves distance and route while paused", () => {
    const train = createTrain();
    train.distance = 15.25;
    train.speed = 0;
    updateTrain(train, path, 0.05);
    train.paused = true;
    train.speed = 6;
    const before = train.loco.position.clone();
    updateTrain(train, path, 1.2);
    expect(train.distance).toBeCloseTo(15.25, 5);
    expect(train.loco.position.distanceTo(before)).toBeLessThan(1e-6);
  });

  it("is a single locomotive", () => {
    const train = createTrain();
    expect(train.group.children).toHaveLength(1);
    expect(train.loco.name).toBe("locomotive");
    expect(train.speed).toBeLessThanOrEqual(0.5);
  });
});
