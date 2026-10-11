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
/** Pre-commit hook or CI: the machine is busy besides. */
const busy = Boolean(process.env.CI || process.env.LEFTHOOK);

export default defineConfig({
  // Mirrors the build-time constant vite.config.ts injects; tests run as a
  // development bundle (see `src/lib/ws-client.ts`).
  define: { __DEPLOY_ENV__: JSON.stringify("development") },
  plugins: [react()],
  test: {
    // CI runners are slow, and the pre-commit hook runs while the laptop is
    // busy besides (dev servers, other sessions): a test that takes 0.5 s
    // alone has hit vitest's 5 s default under load, and a worker per core
    // (14) on a loaded machine pushed a 1.5 s file past 48 s. Under the hook /
    // CI: room for tests AND their beforeEach, and a few workers, not one per
    // core. Keep the tight defaults for a quiet local run so a real hang shows.
    testTimeout: busy ? 30_000 : 5_000,
    hookTimeout: busy ? 30_000 : 10_000,
    ...(busy ? { maxWorkers: 4 } : {}),
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
