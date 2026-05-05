import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Bundle analyzer; emits dist/stats.html on build when ANALYZE=1.
    process.env.ANALYZE
      ? visualizer({ filename: "dist/stats.html", gzipSize: true, brotliSize: true })
      : null,
  ],
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      "/api": "http://localhost:3001",
      "/ws": { target: "ws://localhost:3001", ws: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split stable third-party libs into their own chunks so a code change
        // in `src/` does not bust the cached vendor bundles. Anything not
        // listed here stays in the entry chunk or its lazy route chunk.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query"],
          motion: ["framer-motion"],
          auth: ["better-auth"],
        },
      },
    },
  },
});
