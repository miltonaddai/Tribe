import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@tribe/shared": path.resolve(__dirname, "../shared/index.ts"),
    },
  },
  server: {
    port: 5173,
    watch: {
      ignored: ["**/*.mp4", "**/*.webm", "**/*.mov"],
    },
    proxy: {
      "/api": "http://localhost:2567",
      "/health": "http://localhost:2567",
    },
  },
});
