import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
