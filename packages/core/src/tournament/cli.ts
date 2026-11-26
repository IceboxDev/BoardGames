/**
 * Local AI tournament runner. Plays every pair of a game's AI strategies
 * against each other and writes the results into the game's web folder, where
 * the Tournament page renders them. Nothing here runs on the server.
 *
 *   pnpm --filter @boardgames/core tournament <slug>
 *     [--games 100]          games per matchup per table size (rounded up to even)
 *     [--players 2,4]        table sizes (default: the simulator's own list)
 *     [--strategies a,b,c]   only these strategies (default: every one on offer)
 *     [--workers N]          parallel processes (default: cores − 1)
 *     [--out path]           output file (default: web/src/games/<slug>/tournament-results.generated.ts)
 *     [--fresh]              forget the journal of an interrupted run and start over
 *     [--min-free-mb 1500]   hand out no new game while the machine has less memory free
 *
 * Seating: A takes side 0 in even-numbered games and side 1 in odd-numbered
 * ones — by default the even and odd seats, or the simulator's own `sides`
 * (partners, dealt roles). Games 2k and 2k+1 share one deal (seed), so each
 * pair is the same cards with the sides swapped — seat and deal luck cancel out.
 *
 * Co-op games (`format: "benchmark"`) play each strategy in every seat on the
 * same seeds and record how often the table won.
 *
 * Long runs: scripts/tournament-bg.sh (a systemd service that resumes after a kill).
 *
 * A rerun replaces only the matchups (or benchmark runs) it played; the rest
 * of the file is kept.
 *
 * Nothing is lost to an interruption (a kill, the OOM killer, a reboot):
 *  - every finished game is appended to a journal, `scratch/tournaments/<slug>.jsonl`;
 *    the same command run again replays the journal and plays only what is missing;
 *  - each matchup is written into the results file the moment its last game is
 *    in, so a long run fills the file as it goes;
 *  - a failed game keeps only its own matchup out of the file; the rerun retries it.
 * The journal is cleared of a run's games once all of them are written. After
 * changing an AI, start over with `--fresh` (the journal can't tell).
 */

import { execFileSync, fork } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { availableParallelism, freemem } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { getManifest } from "../games/manifests";
import { strategiesFor } from "../machines/manifest";
import type { GameOutcome } from "../machines/outcome";
import { compareSeatGroups, seatResult, seatScore } from "../machines/outcome";
import {
  type BenchmarkTally,
  emptyBenchmarkTally,
  emptyTally,
  type MatchupTally,
  mergeResults,
  TOURNAMENT_RESULTS_FORMAT,
  type TournamentResults,
  TournamentResultsSchema,
  tallyToMatchup,
  tallyToRun,
} from "./results";
import { alternatingSides, mirroredSeating } from "./simulator";
import { TOURNAMENT_SIMULATORS } from "./simulators";
import type { WorkerJob, WorkerReply } from "./worker";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

interface Matchup {
  readonly playerCount: number;
  readonly a: string;
  /** Equal to `a` in a benchmark: the strategy plays alone. */
  readonly b: string;
}

interface Job extends WorkerJob {
  readonly matchup: Matchup;
  /** Seats `a` holds in this game (every seat, in a benchmark). */
  readonly aSeats: readonly number[];
  /** The game's place in the run, stable across reruns: the journal's key. */
  readonly key: string;
}

/** One finished game in the journal. */
interface JournalEntry {
  readonly key: string;
  readonly seed: number;
  readonly strategies: readonly string[];
  readonly outcome: GameOutcome;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Seed shared by games 2k and 2k+1 — the mirrored pair. */
function pairSeed(gameIndex: number): number {
  return (Math.imul((gameIndex >> 1) + 1, 0x9e3779b1) ^ 0x7a11) >>> 0;
}

function list(value: string | undefined): string[] | undefined {
  return value
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      games: { type: "string", default: "100" },
      players: { type: "string" },
      strategies: { type: "string" },
      workers: { type: "string" },
      out: { type: "string" },
      fresh: { type: "boolean", default: false },
      "min-free-mb": { type: "string", default: "1500" },
    },
  });

  const slug = positionals[0];
  if (!slug)
    fail(`Usage: tournament <slug>   (one of: ${Object.keys(TOURNAMENT_SIMULATORS).join(", ")})`);
  const manifest = getManifest(slug);
  const load = TOURNAMENT_SIMULATORS[slug];
  if (!manifest || !load) {
    fail(
      `No tournament simulator for "${slug}" (have: ${Object.keys(TOURNAMENT_SIMULATORS).join(", ")})`,
    );
  }
  const simulator = await load();

  const gamesArg = Number(values.games);
  if (!Number.isInteger(gamesArg) || gamesArg < 1) fail("--games must be a positive integer");
  const games = gamesArg + (gamesArg % 2);

  const playerCounts = (list(values.players) ?? simulator.playerCounts.map(String)).map(Number);
  for (const n of playerCounts) {
    if (!simulator.playerCounts.includes(n)) {
      fail(`${slug} tournaments play at ${simulator.playerCounts.join(", ")} players, not ${n}`);
    }
  }
  const only = list(values.strategies);
  const benchmark = simulator.format === "benchmark";

  const matchups: Matchup[] = [];
  for (const playerCount of playerCounts) {
    const ids = strategiesFor(manifest, playerCount)
      .map((s) => s.id)
      .filter((id) => !only || only.includes(id));
    if (benchmark) {
      for (const id of ids) matchups.push({ playerCount, a: id, b: id });
      continue;
    }
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) matchups.push({ playerCount, a: ids[i], b: ids[j] });
    }
  }
  if (matchups.length === 0) {
    fail(
      benchmark
        ? "Nothing to play: no strategy selected"
        : "Nothing to play: fewer than two strategies selected",
    );
  }

  const jobs: Job[] = [];
  for (const matchup of matchups) {
    for (let g = 0; g < games; g++) {
      if (benchmark) {
        // Every strategy meets the same deals; no pairing to mirror.
        jobs.push({
          id: jobs.length,
          strategies: Array.from({ length: matchup.playerCount }, () => matchup.a),
          seed: pairSeed(2 * g),
          matchup,
          aSeats: Array.from({ length: matchup.playerCount }, (_, s) => s),
          key: gameKey(matchup, g),
        });
        continue;
      }
      const seed = pairSeed(g);
      const sides =
        simulator.sides?.(matchup.playerCount, seed) ?? alternatingSides(matchup.playerCount);
      const seats = mirroredSeating(sides, matchup.a, matchup.b, g);
      jobs.push({
        id: jobs.length,
        strategies: seats,
        seed,
        matchup,
        aSeats: seats.flatMap((id, s) => (id === matchup.a ? [s] : [])),
        key: gameKey(matchup, g),
      });
    }
  }

  const minFreeMb = Number(values["min-free-mb"]);
  if (!Number.isFinite(minFreeMb) || minFreeMb < 0) fail("--min-free-mb must be a number");

  const out =
    values.out ?? `${REPO_ROOT}packages/web/src/games/${slug}/tournament-results.generated.ts`;
  const previous = await readPrevious(out);

  // ── Journal: every finished game, so an interrupted run picks up where it stopped.
  const journalDir = `${REPO_ROOT}scratch/tournaments`;
  const journalPath = `${journalDir}/${slug}.jsonl`;
  mkdirSync(journalDir, { recursive: true });
  if (values.fresh) rmSync(journalPath, { force: true });
  const byKey = new Map(jobs.map((j) => [j.key, j]));
  const journal = readJournal(journalPath);
  const resumed = new Map<string, JournalEntry>();
  for (const entry of journal) {
    const job = byKey.get(entry.key);
    // A line from another run's settings (other seats or deal) is not this game.
    if (
      job &&
      job.seed === entry.seed &&
      job.strategies.length === entry.strategies.length &&
      job.strategies.every((id, s) => id === entry.strategies[s])
    ) {
      resumed.set(entry.key, entry);
    }
  }

  const remaining = jobs.filter((j) => !resumed.has(j.key));
  const workerCount = Math.max(
    1,
    Math.min(
      Number(values.workers ?? availableParallelism() - 1),
      simulator.maxWorkers ?? Number.POSITIVE_INFINITY,
      Math.max(1, remaining.length),
    ),
  );
  console.log(
    `${slug}: ${matchups.length} ${benchmark ? "strategies" : "matchups"} × ${games} games = ${jobs.length} games on ${workerCount} workers`,
  );
  if (resumed.size > 0) {
    console.log(
      `  resuming: ${resumed.size} games already in ${journalPath} (--fresh to start over)`,
    );
  }

  const tallies = new Map<Matchup, MatchupTally>(matchups.map((m) => [m, emptyTally()]));
  const benchTallies = new Map<Matchup, BenchmarkTally>(
    matchups.map((m) => [m, emptyBenchmarkTally()]),
  );
  const done = new Map<Matchup, number>(matchups.map((m) => [m, 0]));
  const broken = new Set<Matchup>();
  const written = new Set<Matchup>();
  const failures: string[] = [];

  const header: Pick<TournamentResults, "formatVersion" | "slug" | "generatedAt" | "strategies"> = {
    formatVersion: TOURNAMENT_RESULTS_FORMAT,
    slug,
    generatedAt: new Date().toISOString(),
    strategies: manifest.strategies.map(({ id, label }) => ({ id, label })),
  };

  /** Merge every complete matchup into the results file (the earlier file's others kept). */
  const writeResults = () => {
    const atSize = (playerCount: number) =>
      matchups.filter((m) => m.playerCount === playerCount && written.has(m));
    const sizes = playerCounts.filter((n) => atSize(n).length > 0);
    const fresh: TournamentResults = benchmark
      ? {
          ...header,
          generatedAt: new Date().toISOString(),
          kind: "benchmark",
          tables: sizes.map((playerCount) => ({
            playerCount,
            runs: atSize(playerCount).map((m) =>
              tallyToRun(m.a, benchTallies.get(m) ?? emptyBenchmarkTally()),
            ),
          })),
        }
      : {
          ...header,
          generatedAt: new Date().toISOString(),
          kind: "head-to-head",
          tables: sizes.map((playerCount) => ({
            playerCount,
            matchups: atSize(playerCount).map((m) =>
              tallyToMatchup(m.a, m.b, tallies.get(m) ?? emptyTally()),
            ),
          })),
        };
    const merged = TournamentResultsSchema.parse(mergeResults(previous, fresh));
    writeFileSync(
      out,
      [
        `// Generated by \`pnpm --filter @boardgames/core tournament ${slug}\` — do not edit by hand.`,
        `import type { TournamentResults } from "@boardgames/core/tournament/results";`,
        "",
        `const results: TournamentResults = ${JSON.stringify(merged, null, 2)};`,
        "",
        "export default results;",
        "",
      ].join("\n"),
    );
    // House formatting for files inside the repo; a path outside it is left as written.
    execFileSync(
      `${REPO_ROOT}node_modules/.bin/biome`,
      ["format", "--write", "--no-errors-on-unmatched", out],
      { cwd: REPO_ROOT, stdio: "ignore" },
    );
  };

  const tally = (job: Job, outcome: GameOutcome) => {
    if (benchmark) {
      const t = benchTallies.get(job.matchup) ?? emptyBenchmarkTally();
      t.games++;
      if (seatResult(outcome, 0) === "win") t.wins++;
      const score = seatScore(outcome, 0);
      if (score !== null) {
        t.score += score;
        t.scored++;
      }
      return;
    }
    const t = tallies.get(job.matchup) ?? emptyTally();
    const bSeats = job.strategies.flatMap((_, s) => (job.aSeats.includes(s) ? [] : [s]));
    const side = compareSeatGroups(outcome, job.aSeats, bSeats);
    t.games++;
    if (side === "a") t.aWins++;
    else if (side === "b") t.bWins++;
    else t.draws++;
    const mean = (seats: readonly number[]) => {
      const scores = seats.map((s) => seatScore(outcome, s));
      return scores.every((x): x is number => x !== null)
        ? scores.reduce((sum, x) => sum + x, 0) / scores.length
        : null;
    };
    const a = mean(job.aSeats);
    const b = mean(bSeats);
    if (a !== null && b !== null) {
      t.scoreA += a;
      t.scoreB += b;
      t.scored++;
    }
  };

  /** A matchup's last game is in: write it now. Returns whether the file changed. */
  const settle = (matchup: Matchup): boolean => {
    if (written.has(matchup) || broken.has(matchup) || done.get(matchup) !== games) return false;
    written.add(matchup);
    return true;
  };

  // Games the journal already holds count first; matchups they complete are written at once.
  for (const job of jobs) {
    const entry = resumed.get(job.key);
    if (!entry) continue;
    tally(job, entry.outcome);
    done.set(job.matchup, (done.get(job.matchup) ?? 0) + 1);
  }
  if (matchups.map(settle).some(Boolean)) writeResults();

  // Progress: ETA from the recent pace (big tables are slower than the first ones).
  let finished = 0;
  const startedAt = Date.now();
  const recent: number[] = [];
  const window = Math.max(8, workerCount * 4);
  const report = () => {
    const now = Date.now();
    const seconds = (now - startedAt) / 1000;
    const first = recent[0] ?? startedAt;
    const pace =
      recent.length > 1 ? (now - first) / 1000 / (recent.length - 1) : seconds / finished;
    const eta = pace * (remaining.length - finished);
    console.log(
      `  ${resumed.size + finished}/${jobs.length}  ${fmt(seconds)} elapsed, ~${fmt(eta)} left`,
    );
  };

  const record = (job: Job, reply: WorkerReply) => {
    finished++;
    recent.push(Date.now());
    if (recent.length > window) recent.shift();
    if (reply.kind === "failed") {
      failures.push(`game ${job.id} (${job.strategies.join(" vs ")}): ${reply.error}`);
      broken.add(job.matchup);
    } else if (reply.kind === "done") {
      appendFileSync(
        journalPath,
        `${JSON.stringify({ key: job.key, seed: job.seed, strategies: job.strategies, outcome: reply.outcome } satisfies JournalEntry)}\n`,
      );
      tally(job, reply.outcome);
      done.set(job.matchup, (done.get(job.matchup) ?? 0) + 1);
      if (settle(job.matchup)) {
        writeResults();
        const m = job.matchup;
        console.log(`  ✓ ${m.playerCount}p ${m.a}${benchmark ? "" : ` vs ${m.b}`} written`);
      }
    }
    if (
      finished % Math.max(1, Math.floor(remaining.length / 40)) === 0 ||
      finished === remaining.length
    ) {
      report();
    }
  };

  // Memory brake: no new game starts while the machine is short of memory, so
  // a run waits for room instead of tipping the machine into the OOM killer.
  let pausedSince = 0;
  const roomToStart = async () => {
    while (freemem() / 2 ** 20 < minFreeMb) {
      if (!pausedSince) {
        pausedSince = Date.now();
        console.log(
          `  ⏸ ${Math.round(freemem() / 2 ** 20)} MB free (< ${minFreeMb}): holding new games`,
        );
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (pausedSince) {
      console.log(`  ▶ memory back after ${fmt((Date.now() - pausedSince) / 1000)}`);
      pausedSince = 0;
    }
  };

  const queue = [...remaining];
  const workerPath = fileURLToPath(new URL("./worker.ts", import.meta.url));
  // A worker that dies (a crash, the OOM killer) fails the game it held; the
  // rest of the queue carries on in the surviving workers.
  if (queue.length > 0) {
    await Promise.all(
      Array.from(
        { length: workerCount },
        () =>
          new Promise<void>((resolve) => {
            const child = fork(workerPath, [slug], {
              execArgv: ["--import", "tsx"],
              serialization: "advanced",
              stdio: ["ignore", "inherit", "inherit", "ipc"],
            });
            let current: Job | undefined;
            const next = async () => {
              current = undefined;
              if (queue.length > 0) await roomToStart();
              current = queue.shift();
              if (current) {
                const { id, strategies, seed } = current;
                child.send({ id, strategies, seed } satisfies WorkerJob);
              } else child.disconnect();
            };
            child.on("message", (reply: WorkerReply) => {
              if (reply.kind !== "ready" && current) record(current, reply);
              void next();
            });
            child.on("exit", (code, signal) => {
              if (current && (code !== 0 || signal)) {
                record(current, {
                  kind: "failed",
                  id: current.id,
                  error: `worker died (${signal ?? `exit ${code}`})`,
                });
              }
              resolve();
            });
          }),
      ),
    );
  }

  if (failures.length > 0) {
    const kept = matchups.filter((m) => broken.has(m));
    console.error(
      `${failures.length} of ${remaining.length} games failed — ${kept.length} matchups not written (the rest are). Run the same command again to retry only those:`,
    );
    for (const f of failures.slice(0, 10)) console.error(`  ${f}`);
    process.exit(1);
  }

  // Every game of this run is in the file: its journal lines have done their job.
  const others = readJournal(journalPath).filter((e) => !byKey.has(e.key));
  if (others.length > 0) {
    writeFileSync(journalPath, others.map((e) => `${JSON.stringify(e)}\n`).join(""));
  } else rmSync(journalPath, { force: true });
  console.log(`Wrote ${out}`);
}

/** Matchup + game number: the same game in any run with the same strategies. */
function gameKey(m: Matchup, game: number): string {
  return `${m.playerCount}|${m.a}|${m.b}|${game}`;
}

/** The journal's finished games; a torn last line (the process killed mid-write) is skipped. */
function readJournal(path: string): JournalEntry[] {
  if (!existsSync(path)) return [];
  const entries: JournalEntry[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const e: unknown = JSON.parse(line);
      if (
        typeof e === "object" &&
        e !== null &&
        "key" in e &&
        typeof e.key === "string" &&
        "seed" in e &&
        typeof e.seed === "number" &&
        "strategies" in e &&
        Array.isArray(e.strategies) &&
        "outcome" in e &&
        typeof e.outcome === "object" &&
        e.outcome !== null
      ) {
        entries.push(e as JournalEntry);
      }
    } catch {
      // A line cut off by a kill: that game is simply played again.
    }
  }
  return entries;
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds)) return "?";
  const s = Math.round(seconds);
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 90 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
}

/** The earlier results file, if any — the runner runs under tsx, so it just imports it. */
async function readPrevious(path: string): Promise<TournamentResults | null> {
  if (!existsSync(path)) return null;
  const mod: { default?: unknown } = await import(pathToFileURL(path).href);
  const parsed = TournamentResultsSchema.safeParse(mod.default);
  if (!parsed.success) fail(`${path} is not a valid results file; move it aside to start over`);
  return parsed.data;
}

await main();
