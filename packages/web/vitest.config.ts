import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Vitest config kept separate from vite.config.ts so the test environment
// doesn't drag in Tailwind, the bundle visualizer, or the dev-server proxy.
//
// `jsdom` is the runtime because the codebase uses WebSocket, localStorage,
// window.matchMedia, ResizeObserver, focus management, framer-motion's DOM
// effects, and React Router — all of which need a DOM but none of which
// require a full browser. Tests that need WebSocket use `mock-socket` to
// stand in for the global; everything else jsdom provides natively.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    // Per-file isolation so a stub on globalThis.fetch in one file doesn't
    // bleed into the next. Slightly slower than `pool: "threads"` with
    // shared globals, but the safety is worth more than the parallelism on
    // a suite this size.
    isolate: true,
    typecheck: { enabled: false },
    css: false,
  },
});
