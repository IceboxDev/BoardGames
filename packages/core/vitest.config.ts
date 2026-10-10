import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // CI runners are slow, and the pre-commit hook runs while the laptop is
    // busy besides (a dev server, a browser): a test that takes 0.5 s alone
    // has hit vitest's 5 s default under load. Give them room; keep the tight
    // default for a quiet local run so a real hang still shows.
    testTimeout: process.env.CI || process.env.LEFTHOOK ? 30_000 : 5_000,
    include: ["src/**/*.test.ts"],
    environment: "node",
    typecheck: { enabled: false },
  },
});
