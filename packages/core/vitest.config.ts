import { defineConfig } from "vitest/config";

/** Pre-commit hook or CI: the machine is busy besides. */
const busy = Boolean(process.env.CI || process.env.LEFTHOOK);

export default defineConfig({
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
    include: ["src/**/*.test.ts"],
    environment: "node",
    typecheck: { enabled: false },
  },
});
