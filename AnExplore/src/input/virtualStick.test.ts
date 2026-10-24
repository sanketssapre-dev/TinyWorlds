import { describe, expect, it } from "vitest";

import { STICK_RANGE, mapStick } from "./virtualStick";

describe("mapStick", () => {
  it("treats the centre as neutral", () => {
    expect(mapStick(0)).toBe(0);
  });

  it("ignores a twitch inside the dead zone", () => {
    for (let offset = -8; offset <= 8; offset += 1) {
      expect(mapStick(offset)).toBe(0);
    }
  });

  it("saturates at full deflection", () => {
    expect(mapStick(200)).toBe(1);
    expect(mapStick(-200)).toBe(-1);
  });

  it("is symmetric about the centre", () => {
    for (let offset = -120; offset <= 120; offset += 6) {
      expect(mapStick(offset)).toBeCloseTo(-mapStick(-offset), 10);
    }
  });

  it("rises monotonically as the drag travels outward", () => {
    let previous = -1;
    for (let offset = -STICK_RANGE; offset <= STICK_RANGE; offset += 4) {
      const value = mapStick(offset);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("reaches full deflection at the range edge", () => {
    expect(mapStick(STICK_RANGE + 8)).toBe(1);
    expect(mapStick(-(STICK_RANGE + 8))).toBe(-1);
  });
});
