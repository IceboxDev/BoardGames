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
    // ── Browser baseline: color-mix() ────────────────────────────────────
    // The theming engine and every unit built on it (select styles, ambient
    // effects, the glow-shadow family, the tone conversions) derive alpha
    // variants with `color-mix(in srgb, …)`. That lands at Chrome 111 /
    // Safari 16.2 / Firefox 113 — ABOVE Vite's default
    // `baseline-widely-available` target (chrome107 / safari16.0), so the
    // default would promise support the CSS can't deliver.
    //
    // This is not cosmetic degradation: a Tailwind shadow whose color is an
    // unsupported color-mix becomes invalid-at-computed-value-time, and since
    // ring and shadow share ONE `box-shadow` declaration, the element loses
    // its focus RING too — not just the glow.
    //
    // Decision: raise the target to match reality rather than carry an
    // `@supports` fallback path through every unit. This is a private club
    // site on modern devices; all four engines shipped color-mix in 2023.
    target: ["chrome111", "edge111", "firefox113", "safari16.2"],
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
