import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The pre-commit hook and CI run three suites and a typecheck at once, and
    // this machine may be busy besides: a test that takes 0.5 s alone has hit
    // vitest's 5 s default there on load alone. Give them room; keep the
    // tight default for a quiet local run so a real hang still shows.
    testTimeout: process.env.CI || process.env.LEFTHOOK ? 30_000 : 5_000,
    include: ["src/**/*.test.ts"],
    environment: "node",
    typecheck: { enabled: false },
  },
});
