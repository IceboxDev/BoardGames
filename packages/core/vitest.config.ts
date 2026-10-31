import { configDefaults, defineConfig } from "vitest/config";

/** The pre-commit hook: the laptop is busy besides (dev servers, other sessions). */
const hook = Boolean(process.env.LEFTHOOK);
/** Pre-commit hook or CI: slower than a quiet local run. */
const busy = hook || Boolean(process.env.CI);

export default defineConfig({
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
    include: ["src/**/*.test.ts"],
    // AI-strength and statistical tests (`*.heavy.test.ts`) run apart, in
    // `pnpm test:heavy` and their own CI job — see vitest.heavy.config.ts.
    exclude: [...configDefaults.exclude, "src/**/*.heavy.test.*"],
    environment: "node",
    typecheck: { enabled: false },
  },
});
