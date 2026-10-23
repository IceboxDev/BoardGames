import { defineConfig } from "vitest/config";

// The crawler's unit tests (pure functions only; no network):
//   pnpm exec vitest run --config scripts/quiz-evidence/vitest.config.ts
export default defineConfig({
  test: {
    root: new URL(".", import.meta.url).pathname,
    include: ["*.test.ts"],
    environment: "node",
  },
});
