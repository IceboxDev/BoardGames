#!/usr/bin/env node
// ── Pre-commit: typecheck + tests, in two lanes, only what the commit touches ──
//
// usage: node scripts/pre-commit-checks.mjs <staged files…>   (lefthook passes them)
//
// The hook used to start the three test suites and the three typechecks all at
// once. Each vitest spawns a worker per core (web's each with a jsdom), so on a
// 14-core / 15 GB laptop that was ~40 workers and three compilers: free memory
// fell from ~8 GB to ~2 GB, tests timed out and a compiler died silently.
//
// Now there are two lanes side by side, each running ONE job at a time: the
// typechecks in one, the test suites in the other — never more than one
// compiler and one suite at once. Measured on a change to core (the worst
// case, every package): 125 s and never below ~3.8 GB free, against 117 s and
// ~2 GB before. A failure in either lane stops the other.
//
// And only the packages the staged files can break: web and server both build
// on core, so a core change (or a root config — lockfile, base tsconfig,
// biome…) checks all three; a web-only change checks web alone (~65 s).

import { spawn } from "node:child_process";

const PACKAGES = ["core", "server", "web"];
/** Who builds on whom: a change to the key can break each listed package. */
const AFFECTS = { core: ["core", "server", "web"], server: ["server"], web: ["web"] };

const staged = process.argv.slice(2);
const affected = new Set();
for (const file of staged) {
  const pkg = /^packages\/([^/]+)\//.exec(file)?.[1];
  if (pkg && pkg in AFFECTS) for (const p of AFFECTS[pkg]) affected.add(p);
  // Outside the packages: scripts, docs, assets don't feed a build — but a
  // root config (package.json, lockfile, tsconfig*, biome.json…) feeds them all.
  else if (!pkg && /^[^/]+\.(json|ya?ml|ts|mjs|cjs|js)$/.test(file)) {
    for (const p of PACKAGES) affected.add(p);
  }
}

const targets = PACKAGES.filter((p) => affected.has(p));
if (targets.length === 0) {
  console.log("pre-commit: no package code staged — skipping typecheck and tests");
  process.exit(0);
}
console.log(`pre-commit: checking ${targets.join(", ")}`);

const running = new Set();
let failed = false;

/** One pnpm script; resolves to its exit code. `quiet` buffers the output for a failure. */
function run(script, pkg, { quiet }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn("pnpm", ["--filter", `@boardgames/${pkg}`, script], {
      stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
      // LEFTHOOK=1 gives the tests their roomier timeouts (vitest configs, the
      // AI tests' load factor): the laptop may be busy besides.
      env: { ...process.env, LEFTHOOK: "1" },
    });
    let output = "";
    child.stdout?.on("data", (d) => (output += d));
    child.stderr?.on("data", (d) => (output += d));
    running.add(child);
    child.on("close", (code) => {
      running.delete(child);
      const secs = ((Date.now() - started) / 1000).toFixed(0);
      if (code === 0) console.log(`pre-commit: ${script} ${pkg} ok (${secs} s)`);
      else if (!failed) {
        if (quiet) process.stderr.write(output);
        console.error(`\npre-commit: ${script} ${pkg} failed`);
      }
      resolve(code ?? 1);
    });
  });
}

/** A lane: its jobs one after another; the first failure stops both lanes. */
async function lane(script, quiet) {
  for (const pkg of targets) {
    if (failed) return;
    const code = await run(script, pkg, { quiet });
    if (code !== 0 && !failed) {
      failed = true;
      for (const child of running) child.kill();
    }
  }
}

// Typecheck output is held back (printed on failure) so the test lane's
// output reads cleanly.
await Promise.all([lane("typecheck", true), lane("test", false)]);
process.exit(failed ? 1 : 0);
