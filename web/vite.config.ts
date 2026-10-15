import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./", // hash routing + relative assets: works from any path, including a GitHub Pages project URL
  define: { global: "globalThis" },
  build: { target: "es2022", chunkSizeWarningLimit: 1200 },
});
