import process from "node:process";
import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const backendTarget = `http://localhost:${process.env.BACKEND_PORT || "8029"}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/healthz": {
        target: backendTarget,
        changeOrigin: true,
      },
      "/metrics": {
        target: backendTarget,
        changeOrigin: true,
      },
      "/api": {
        target: backendTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
