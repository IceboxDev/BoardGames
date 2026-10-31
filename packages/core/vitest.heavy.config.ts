import { configDefaults, defineConfig } from "vitest/config";

// The heavy tier: tests that prove an AI plays WELL (seeded games against a
// weaker bot) or that a sampler CONVERGES (hundreds of thousands of steps),
// not that the code is correct — those stay in the default suite. They take
// 5–25 s alone and several times that on a CI runner, so they are kept out of
// the pre-commit hook and the default CI jobs (vitest.config.ts excludes
// them) and run here: `pnpm test:heavy`, and the "Heavy tests" CI job.
//
// Name a test file `*.heavy.test.ts` to put it here. One file at a time, with
// one generous timeout for the whole tier — no per-test timeouts.
export default defineConfig({
  test: {
    include: ["src/**/*.heavy.test.ts"],
    exclude: configDefaults.exclude,
    environment: "node",
    fileParallelism: false,
    testTimeout: 600_000,
    hookTimeout: 60_000,
    typecheck: { enabled: false },
  },
});
