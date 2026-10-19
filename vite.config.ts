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
      input: {
        main: resolve(__dirname, "index.html"),
        silentFlight: resolve(__dirname, "ASilentFlight/index.html"),
        silentSail: resolve(__dirname, "ASilentSail/index.html"),
      },
    },
  },
});
