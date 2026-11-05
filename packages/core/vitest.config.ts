import { defineConfig, mergeConfig } from "vitest/config";
import shared from "../../vitest.shared.ts";

// Timeouts, the heavy-tier exclude and worker counts are shared — see
// vitest.shared.ts and docs/testing.md.
export default mergeConfig(
  shared,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts"],
      environment: "node",
    },
  }),
);
