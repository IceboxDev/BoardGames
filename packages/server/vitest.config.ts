import { defineConfig, mergeConfig } from "vitest/config";
import shared from "../../vitest.shared.ts";

// Server tests are pure Node: no DOM, no per-file isolation needed (the
// helpers under test are stateless). Timeouts, the heavy-tier exclude and
// worker counts are shared — see vitest.shared.ts and docs/testing.md.
export default mergeConfig(
  shared,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts"],
      environment: "node",
    },
  }),
);
