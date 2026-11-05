#!/usr/bin/env node
// ── One package's default test suite, with a verdict the machine can't sway ──
//
// usage: node scripts/test-run.mjs <core|server|web>…   (packages run one after another)
//
// The rules are in docs/testing.md. In short, a suite runs in two passes:
//
// 1. All of it, with as many workers as free memory allows
//    (scripts/lib/test-resources.mjs). Green → done; nothing else runs.
// 2. Every file that failed in pass 1 runs again ALONE: one file, one worker,
//    with VITEST_ARBITRATION=1 (web's find/wait limit becomes the whole hang
//    guard). Pass 2 is the verdict. A test that fails again fails the run. A
//    test that only failed beside the others is LOAD-SENSITIVE: a warning,
//    logged to scratch/test-flakes.jsonl (`node scripts/test-flakes.mjs`)
//    so it gets made deterministic — never a red commit.
//
// A pass-1 crash with no report (a worker OOM-killed, say) reruns the whole
// suite one file at a time, so that also ends in a real verdict.
//
// It also reports tests over SLOW_S seconds: `::warning` annotations on CI
// (a slow default-tier test belongs in *.heavy.test.ts), a short list locally.

import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { loadavg, tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { availableMb, workersFor } from "./lib/test-resources.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FLAKES = join(ROOT, "scratch", "test-flakes.jsonl");
const CI = Boolean(process.env.CI);
const SLOW_S = 10;
const PACKAGES = ["core", "server", "web"];

const yellow = (s) => (process.stdout.isTTY ? `\x1b[33m${s}\x1b[0m` : s);
const red = (s) => (process.stdout.isTTY ? `\x1b[31m${s}\x1b[0m` : s);

/** One `vitest run` in the package; resolves to its exit code and parsed JSON report. */
function vitest(pkg, args, { env = {}, quiet = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "test-run-"));
  const report = join(dir, "report.json");
  const cmd = [
    "pnpm",
    "exec",
    "vitest",
    "run",
    "--reporter=default",
    "--reporter=json",
    `--outputFile.json=${report}`,
    ...args,
  ];
  // Locally the suite yields to whatever else the machine is doing.
  const argv = !CI && process.platform === "linux" ? ["nice", "-n", "10", ...cmd] : cmd;
  return new Promise((done) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd: join(ROOT, "packages", pkg),
      stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
      env: { ...process.env, ...env },
    });
    let output = "";
    child.stdout?.on("data", (d) => (output += d));
    child.stderr?.on("data", (d) => (output += d));
    const stop = () => child.kill("SIGTERM");
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
    child.on("close", (code) => {
      process.off("SIGTERM", stop);
      process.off("SIGINT", stop);
      let json = null;
      try {
        json = JSON.parse(readFileSync(report, "utf8"));
      } catch {
        // crashed before writing it
      }
      rmSync(dir, { recursive: true, force: true });
      done({ code: code ?? 1, json, output });
    });
  });
}

const failedTests = (json) =>
  (json?.testResults ?? []).flatMap((f) =>
    (f.assertionResults ?? [])
      .filter((t) => t.status === "failed")
      .map((t) => ({
        file: f.name,
        test: t.fullName ?? t.title,
        error: (t.failureMessages ?? []).join("\n").split("\n")[0]?.slice(0, 300) ?? "",
        ms: t.duration ?? null,
      })),
  );

/** Files that failed: a failing test, or the file itself (an import or hook error). */
const failedFiles = (json) =>
  (json?.testResults ?? []).filter((f) => f.status === "failed").map((f) => f.name);

function reportSlow(pkg, json) {
  const slow = (json?.testResults ?? [])
    .flatMap((f) =>
      (f.assertionResults ?? []).map((t) => ({
        file: relative(ROOT, f.name),
        test: t.fullName ?? t.title,
        ms: t.duration ?? 0,
      })),
    )
    .filter((t) => t.ms > SLOW_S * 1000)
    .sort((a, b) => b.ms - a.ms);
  for (const t of slow) {
    const s = (t.ms / 1000).toFixed(1);
    if (CI) {
      console.log(
        `::warning file=${t.file},title=Slow test (${s} s)::${t.test} took ${s} s (limit ${SLOW_S} s). If it measures strength, speed or convergence rather than correctness, move it to a *.heavy.test.ts file (pnpm test:heavy).`,
      );
    } else {
      console.log(yellow(`test-run: slow (${s} s) ${t.test} — ${t.file}`));
    }
  }
  if (CI && process.env.GITHUB_STEP_SUMMARY) {
    const lines = slow.length
      ? [`### Slow tests (${pkg})`, "", "| Test | File | Seconds |", "|---|---|---|"].concat(
          slow.map((t) => `| ${t.test} | ${t.file} | ${(t.ms / 1000).toFixed(1)} |`),
        )
      : [`No ${pkg} test over ${SLOW_S} s.`];
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
  }
}

function logFlake(pkg, f, workers) {
  if (!existsSync(join(ROOT, "scratch"))) mkdirSync(join(ROOT, "scratch"));
  appendFileSync(
    FLAKES,
    `${JSON.stringify({
      at: new Date().toISOString(),
      pkg,
      file: relative(ROOT, f.file),
      test: f.test,
      error: f.error,
      ms: f.ms,
      workers,
      memAvailableMb: availableMb(),
      loadavg: loadavg()[0],
      ci: CI,
    })}\n`,
  );
}

async function runPackage(pkg) {
  const workers = CI ? null : workersFor(pkg);
  console.log(
    `test-run: ${pkg} — ${workers === null ? "default" : workers} worker(s), ${availableMb()} MB free`,
  );
  const first = await vitest(pkg, workers === null ? [] : [`--maxWorkers=${workers}`]);
  reportSlow(pkg, first.json);
  if (first.code === 0) return true;

  // Which files to judge again, alone.
  let files = failedFiles(first.json);
  const crashed = first.json === null || files.length === 0;
  if (crashed) {
    console.log(yellow(`test-run: ${pkg} failed without naming a file — rerunning every file alone`));
  }
  const firstFailures = failedTests(first.json);
  console.log(
    yellow(
      `\ntest-run: ${pkg} — ${crashed ? "the whole suite" : `${files.length} file(s)`} failed beside the others; running ${crashed ? "it" : "each"} alone to see if the code is at fault…`,
    ),
  );

  const env = { VITEST_ARBITRATION: "1" };
  const alone = ["--maxWorkers=1", "--no-file-parallelism"];
  let real = [];
  if (crashed) {
    const again = await vitest(pkg, alone, { env, quiet: true });
    if (again.code !== 0) {
      process.stdout.write(again.output);
      real = failedTests(again.json);
      if (real.length === 0) real = [{ file: pkg, test: "(suite crashed)", error: "", ms: null }];
    }
    files = [];
  }
  for (const file of files) {
    const again = await vitest(pkg, [...alone, file], { env, quiet: true });
    if (again.code !== 0) {
      process.stdout.write(again.output);
      const still = failedTests(again.json);
      real.push(...(still.length ? still : [{ file, test: "(file failed to run)", error: "", ms: null }]));
    }
  }

  const realKeys = new Set(real.map((f) => `${f.file}\u0000${f.test}`));
  const loadOnly = firstFailures.filter((f) => !realKeys.has(`${f.file}\u0000${f.test}`));
  for (const f of loadOnly) {
    logFlake(pkg, f, workers);
    const msg = `LOAD-SENSITIVE (passed alone, failed beside the others): ${f.test} — ${relative(ROOT, f.file)}`;
    console.log(CI ? `::warning file=${relative(ROOT, f.file)},title=Load-sensitive test::${msg}` : yellow(`test-run: ${msg}`));
  }
  if (loadOnly.length > 0) {
    console.log(yellow(`test-run: logged to ${relative(ROOT, FLAKES)} — make each one deterministic (docs/testing.md)`));
  }
  if (real.length > 0) {
    for (const f of real) console.error(red(`test-run: FAILED alone too: ${f.test} — ${relative(ROOT, f.file)}`));
    return false;
  }
  console.log(`test-run: ${pkg} ok — every failure passed when run alone`);
  return true;
}

const targets = process.argv.slice(2);
if (targets.length === 0 || targets.some((p) => !PACKAGES.includes(p))) {
  console.error(`usage: test-run.mjs <${PACKAGES.join("|")}>…`);
  process.exit(2);
}
let ok = true;
for (const pkg of targets) {
  if (!(await runPackage(pkg))) {
    ok = false;
    break;
  }
}
process.exit(ok ? 0 : 1);
