#!/usr/bin/env node
// Flags slow tests in a CI test job before they become timeouts.
//
//   node scripts/ci-slow-tests.mjs <vitest-json-report> [thresholdSeconds=10]
//
// Reads a report written by `vitest run --reporter=json --outputFile=…` and
// prints a GitHub `::warning` annotation for every test that took longer than
// the threshold on the runner, pointing at the heavy tier (`*.heavy.test.ts`,
// see packages/core/vitest.heavy.config.ts). It only warns — it always exits
// 0 — so it can never turn CI red itself; a missing or unreadable report
// (the suite crashed before writing one) is reported and skipped.

import { appendFileSync, readFileSync } from "node:fs";
import { relative } from "node:path";

const [reportPath, thresholdArg] = process.argv.slice(2);
const thresholdMs = Number(thresholdArg ?? 10) * 1000;

if (!reportPath) {
  console.log("usage: ci-slow-tests.mjs <vitest-json-report> [thresholdSeconds]");
  process.exit(0);
}

let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (err) {
  console.log(`ci-slow-tests: no readable report at ${reportPath} (${err.message}) — skipped`);
  process.exit(0);
}

const slow = [];
for (const file of report.testResults ?? []) {
  for (const test of file.assertionResults ?? []) {
    if (typeof test.duration === "number" && test.duration > thresholdMs) {
      slow.push({ file: relative(process.cwd(), file.name), title: test.fullName ?? test.title, ms: test.duration });
    }
  }
}
slow.sort((a, b) => b.ms - a.ms);

for (const t of slow) {
  const seconds = (t.ms / 1000).toFixed(1);
  console.log(
    `::warning file=${t.file},title=Slow test (${seconds} s)::${t.title} took ${seconds} s on the CI runner (limit ${thresholdMs / 1000} s). If it measures strength or convergence rather than correctness, move it to a *.heavy.test.ts file (pnpm test:heavy).`,
  );
}

const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary) {
  const lines = slow.length
    ? ["### Slow tests", "", "| Test | File | Seconds |", "|---|---|---|", ...slow.map((t) => `| ${t.title} | ${t.file} | ${(t.ms / 1000).toFixed(1)} |`)]
    : [`No test over ${thresholdMs / 1000} s.`];
  appendFileSync(summary, `${lines.join("\n")}\n`);
}
console.log(`ci-slow-tests: ${slow.length} test(s) over ${thresholdMs / 1000} s`);
