import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/tournament/game-worker.ts"],
  format: "esm",
  // Bundle the workspace `@boardgames/core` package into the output so the
  // runtime never has to resolve its `.ts` source files (which Node's strict
  // ESM resolver can't load).
  noExternal: ["@boardgames/core"],
  splitting: false,
  shims: false,
  clean: true,
});
