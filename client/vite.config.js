import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // During local dev, proxy /api calls to your Express server
  // so you don't have to deal with CORS while developing
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    // Output goes into ../public — Express will serve this folder
    outDir: "../public",
    emptyOutDir: true,
  },
});
