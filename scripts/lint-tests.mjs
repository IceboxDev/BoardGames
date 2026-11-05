#!/usr/bin/env node
// ── Test guard: default-tier tests may not depend on the machine ──────────
//
// usage: node scripts/lint-tests.mjs        (in `pnpm lint` and the pre-commit hook)
//
// A default-tier test (`*.test.ts(x)`, not `*.heavy.test.*`) must pass or fail
// on its code and inputs alone, never on how fast or busy the machine is —
// docs/testing.md says why and what to do instead. Each rule below is a way a
// test once turned machine speed into a verdict:
//
//   per-test-timeout   `it(…, 30_000)` / `{ timeout: N }` on a wait — the shared
//                      hang guard (vitest.shared.ts) is the only limit.
//   wall-clock         `performance.now()` — speed claims go in *.heavy.test.ts.
//   date-delta         `Date.now() - start` — measuring elapsed time, same thing.
//   sleep              `new Promise(r => setTimeout(r, N))`, N > 0 — wait for a
//                      signal (a promise, a drained write, a fake clock).
//   mode-env           reading `process.env.CI` / `LEFTHOOK` — one mode everywhere.
//   query-client       `new QueryClient(` in a web test — use testQueryClient()
//                      (packages/web/src/test/query-client.ts).
//
// A line that genuinely needs one says so on itself or the line above:
//   // lint-tests-allow: <rule> — <why>

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SRC_DIRS = ["core", "server", "web"].map((p) => join(ROOT, "packages", p, "src"));

const RULES = [
  {
    id: "per-test-timeout",
    re: /^\s*\},\s*[1-9][\d_]*\s*\);|[{,]\s*timeout:\s*[\d_]/,
    fix: "drop it: the shared hang guard (vitest.shared.ts) is the only time limit",
  },
  {
    id: "wall-clock",
    re: /\bperformance\.now\(\)/,
    fix: "assert a count or a result, or move the speed claim to a *.heavy.test.ts file",
  },
  {
    id: "date-delta",
    re: /Date\.now\(\)\s*-\s*(t\d*|start\w*|began|before|then)\b/,
    fix: "don't measure elapsed time; pin the clock with vi.setSystemTime if a date matters",
  },
  {
    id: "sleep",
    re: /new Promise\(\s*\(?\s*\w+\s*\)?\s*=>\s*setTimeout\(\s*\w+\s*,\s*[1-9]/,
    fix: "wait for a signal: the promise itself, activityWritesSettled(), querySettled(), or a fake clock",
  },
  {
    id: "mode-env",
    re: /process\.env\.(CI|LEFTHOOK)\b/,
    fix: "a test behaves the same in every mode; test-run.mjs settles load, not the test",
  },
  {
    id: "query-client",
    re: /new QueryClient\(/,
    only: (file) => file.includes("/packages/web/"),
    fix: "use testQueryClient() from packages/web/src/test/query-client.ts",
  },
];

function* testFiles(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* testFiles(path);
    else if (/\.test\.tsx?$/.test(name) && !/\.heavy\.test\./.test(name)) yield path;
  }
}

const hits = [];
for (const dir of SRC_DIRS) {
  for (const file of testFiles(dir)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const rule of RULES) {
        if (rule.only && !rule.only(file)) continue;
        if (!rule.re.test(line)) continue;
        const allow = `lint-tests-allow: ${rule.id}`;
        if (line.includes(allow) || lines[i - 1]?.includes(allow)) continue;
        hits.push({ file: relative(ROOT, file), line: i + 1, rule, text: line.trim() });
      }
    });
  }
}

if (hits.length === 0) {
  console.log("lint-tests: ok");
  process.exit(0);
}
for (const h of hits) {
  console.error(`${h.file}:${h.line}  [${h.rule.id}] ${h.text}\n    → ${h.rule.fix}`);
}
console.error(
  `\nlint-tests: ${hits.length} hit(s). A default-tier test must not depend on the machine — see docs/testing.md.`,
);
process.exit(1);
