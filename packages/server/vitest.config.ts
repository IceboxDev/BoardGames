import { defineConfig } from "vitest/config";

// Mirror of packages/core/vitest.config.ts. Server tests are pure Node:
// no DOM, no per-file isolation needed (the helpers under test are
// stateless). `typecheck.enabled = false` keeps `vitest run` fast — the
// repo already runs `tsc -b --noEmit` separately via `pnpm typecheck`.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    typecheck: { enabled: false },
  },
});
