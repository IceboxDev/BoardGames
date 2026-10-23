// Tests of the quiz scripts (history-io, evidence, backlog, tags, regroup,
// runs): `pnpm --filter @boardgames/core exec vitest run --config ../../scripts/quiz-ingest/vitest.config.ts`.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: fileURLToPath(new URL("../..", import.meta.url)),
    include: ["scripts/quiz/lib/**/*.test.ts", "scripts/quiz-ingest/**/*.test.ts"],
    environment: "node",
  },
});
