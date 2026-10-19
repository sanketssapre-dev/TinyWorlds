import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["ASilentFlight/src/**/*.test.ts", "ASilentSail/src/**/*.test.ts"],
  },
});
