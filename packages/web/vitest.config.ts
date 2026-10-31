import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

// Vitest config kept separate from vite.config.ts so the test environment
// doesn't drag in Tailwind, the bundle visualizer, or the dev-server proxy.
//
// `jsdom` is the runtime because the codebase uses WebSocket, localStorage,
// window.matchMedia, ResizeObserver, focus management, framer-motion's DOM
// effects, and React Router — all of which need a DOM but none of which
// require a full browser. Tests that need WebSocket use `mock-socket` to
// stand in for the global; everything else jsdom provides natively.
/** The pre-commit hook: the laptop is busy besides (dev servers, other sessions). */
const hook = Boolean(process.env.LEFTHOOK);
/** Pre-commit hook or CI: slower than a quiet local run. */
const busy = hook || Boolean(process.env.CI);

export default defineConfig({
  // Mirrors the build-time constant vite.config.ts injects; tests run as a
  // development bundle (see `src/lib/ws-client.ts`).
  define: { __DEPLOY_ENV__: JSON.stringify("development") },
  plugins: [react()],
  test: {
    // CI runners are slow, and the pre-commit hook runs while the laptop is
    // busy besides (dev servers, other sessions): a test that takes 0.5 s
    // alone has hit vitest's 5 s default under load. Under the hook / CI:
    // room for tests AND their beforeEach. Keep the tight defaults for a
    // quiet local run so a real hang shows.
    testTimeout: busy ? 30_000 : 5_000,
    hookTimeout: busy ? 30_000 : 10_000,
    // The hook shares the laptop: a worker per core (14) on a loaded machine
    // pushed a 1.5 s file past 48 s, so a few. CI runs one package per job
    // (.github/workflows/ci.yml), so there the suite gets the whole runner.
    ...(hook ? { maxWorkers: 4 } : {}),
    include: ["src/**/*.test.{ts,tsx}"],
    // AI-strength and statistical tests (`*.heavy.test.ts`) run apart, in
    // `pnpm test:heavy` and their own CI job — see vitest.heavy.config.ts.
    exclude: [...configDefaults.exclude, "src/**/*.heavy.test.*"],
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
