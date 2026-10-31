import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const engine = "http://localhost:4173";

export default defineConfig({
  plugins: [react()],
  resolve: { conditions: ["source"] },
  server: {
    proxy: {
      "/api": engine,
      "/media": engine,
      "/music": engine,
      "/fonts": engine,
      "/renders": engine,
    },
  },
});
