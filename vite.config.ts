import { defineConfig } from "vite";

export default defineConfig({
  base: '/TinyWorlds/',
  server: {
    port: 5173,
    host: true,
  },
});
