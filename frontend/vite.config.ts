import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.VITE_APP_BASE ?? "./",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/littleorange-api": {
        target: "http://127.0.0.1:8797",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/littleorange-api/, ""),
      },
      "/littleorange-command": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/littleorange-command/, ""),
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("three") || id.includes("@react-three")) return "scene-vendor";
          if (id.includes("motion")) return "motion-vendor";
          return undefined;
        },
      },
    },
  },
});
