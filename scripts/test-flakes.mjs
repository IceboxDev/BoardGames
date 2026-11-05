#!/usr/bin/env node
// What scripts/test-run.mjs had to rerun alone: every LOAD-SENSITIVE test
// (failed beside the others, passed alone), most frequent first. Each one is a
// test whose result still depends on timing or load — make it wait on a
// signal instead (docs/testing.md), then clear the log with `--clear`.
//
// usage: node scripts/test-flakes.mjs [--clear]

import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FLAKES = join(resolve(fileURLToPath(new URL("..", import.meta.url))), "scratch", "test-flakes.jsonl");

if (process.argv.includes("--clear")) {
  rmSync(FLAKES, { force: true });
  console.log("test-flakes: log cleared");
  process.exit(0);
}
if (!existsSync(FLAKES)) {
  console.log("test-flakes: none logged");
  process.exit(0);
}
const rows = readFileSync(FLAKES, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const byTest = new Map();
for (const r of rows) {
  const key = `${r.file} › ${r.test}`;
  const e = byTest.get(key) ?? { key, count: 0, last: r };
  e.count++;
  e.last = r;
  byTest.set(key, e);
}
for (const e of [...byTest.values()].sort((a, b) => b.count - a.count)) {
  const r = e.last;
  console.log(`${e.count}× ${e.key}`);
  console.log(`    last ${r.at}: ${r.error || "(no message)"} — ${r.workers ?? "default"} workers, ${r.memAvailableMb} MB free, load ${r.loadavg?.toFixed?.(1)}`);
}
