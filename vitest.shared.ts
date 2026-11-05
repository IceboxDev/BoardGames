import { configDefaults, defineConfig } from "vitest/config";

// The settings every package's default test tier shares (merged by
// packages/{core,server,web}/vitest.config.ts). The rules behind them are in
// docs/testing.md; in short: a test's verdict depends on the code and its
// inputs, never on how fast or busy the machine is.
//
// So there is ONE timing mode — the same quiet, in the pre-commit hook and on
// CI. The limits below only catch a test that hangs: a correct test stays far
// under them even on a machine that is swapping. Never set a per-test timeout
// (scripts/lint-tests.mjs rejects one). Whether a failure was the code or the
// load is settled by scripts/test-run.mjs, which reruns a failed file alone.

/** How long a test or hook may run before it counts as hung. */
export const HANG_GUARD_MS = 120_000;

export default defineConfig({
  test: {
    testTimeout: HANG_GUARD_MS,
    hookTimeout: HANG_GUARD_MS,
    // AI-strength, statistical and timing tests (`*.heavy.test.ts`) run apart,
    // in `pnpm test:heavy` and their own CI job — see
    // packages/core/vitest.heavy.config.ts.
    exclude: [...configDefaults.exclude, "src/**/*.heavy.test.*"],
    typecheck: { enabled: false },
  },
});
