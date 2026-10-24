import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/TinyWorlds/",
  server: {
    port: 5173,
    host: true,
  },
  build: {
    rollupOptions: {
      // AnExplore is the whole site. ASilentFlight and ASilentSail stay in the
      // repo but are no longer built or published.
      input: {
        main: resolve(__dirname, "index.html"),
      },
    },
  },
});
