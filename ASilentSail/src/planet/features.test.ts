import { describe, expect, it } from "vitest";
import { lakeShoreScale, LAKES } from "./features";

describe("Alpine lake shorelines", () => {
  it("keeps irregular coves bounded and consistent for the terrain and water", () => {
    for (const lake of LAKES) {
      const scales = Array.from({ length: 64 }, (_, i) =>
        lakeShoreScale(lake, (i / 64) * Math.PI * 2),
      );
      expect(Math.min(...scales)).toBeGreaterThan(0.8);
      expect(Math.max(...scales)).toBeLessThan(1.2);
      expect(Math.max(...scales) - Math.min(...scales)).toBeGreaterThan(0.1);
    }
  });
});
