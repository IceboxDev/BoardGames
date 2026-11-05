#!/usr/bin/env node
// ── The default test suites on a deliberately starved machine ──────────────
//
// usage: node scripts/test-stress.mjs [--rounds=3] [--balloon] [core server web]
//
// The proof behind docs/testing.md: a correct suite passes however busy the
// machine is. This keeps every core busy (one spinning process per core, at
// normal priority, so the suites — which run niced — get only what is left)
// and runs scripts/test-run.mjs for each package, round after round.
// --balloon also holds memory until about 1.5 GB is left available (never
// less, so the desktop and its apps are not pushed into the OOM killer).
//
// Passing = every round green. Whatever arbitration had to absorb is in
// scratch/test-flakes.jsonl (node scripts/test-flakes.mjs): the target is an
// empty log, and each entry there is a test to make deterministic.

import { fork, spawnSync } from "node:child_process";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { availableMb } from "./lib/test-resources.mjs";

if (process.argv[2] === "--burn") {
  for (;;) {
    // spin
  }
}
if (process.argv[2] === "--hold") {
  const mb = Number(process.argv[3]);
  const chunks = [];
  for (let i = 0; i < mb / 64; i++) chunks.push(Buffer.alloc(64 * 1024 * 1024, 1));
  setInterval(() => chunks.length, 1 << 30);
} else {
  const args = process.argv.slice(2);
  const rounds = Number(args.find((a) => a.startsWith("--rounds="))?.split("=")[1] ?? 3);
  const balloon = args.includes("--balloon");
  const packages = args.filter((a) => !a.startsWith("--"));
  const targets = packages.length ? packages : ["core", "server", "web"];
  const self = fileURLToPath(import.meta.url);

  const helpers = [];
  for (let i = 0; i < availableParallelism(); i++) helpers.push(fork(self, ["--burn"]));
  if (balloon) {
    const hold = Math.max(0, availableMb() - 1536);
    if (hold > 0) helpers.push(fork(self, ["--hold", String(hold)]));
    console.log(`test-stress: holding ${hold} MB`);
  }
  const stop = () => {
    for (const h of helpers) h.kill("SIGKILL");
  };
  process.on("exit", stop);
  process.on("SIGINT", () => process.exit(130));

  console.log(`test-stress: ${availableParallelism()} cores spinning, ${rounds} round(s) of ${targets.join(", ")}`);
  const results = [];
  for (let r = 1; r <= rounds; r++) {
    const started = Date.now();
    const run = spawnSync("node", [fileURLToPath(new URL("./test-run.mjs", import.meta.url)), ...targets], {
      stdio: "inherit",
    });
    const secs = Math.round((Date.now() - started) / 1000);
    results.push({ round: r, ok: run.status === 0, secs });
    console.log(`test-stress: round ${r} ${run.status === 0 ? "green" : "RED"} in ${secs} s`);
  }
  stop();
  const red = results.filter((x) => !x.ok).length;
  console.log(`test-stress: ${rounds - red}/${rounds} rounds green — see node scripts/test-flakes.mjs`);
  process.exit(red === 0 ? 0 : 1);
}
