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
 *
 * Seating: A takes the even seats in even-numbered games and the odd seats in
 * odd-numbered ones. Games 2k and 2k+1 share one deal (seed), so each pair is
 * the same cards with the sides swapped — seat and deal luck cancel out.
 * A rerun replaces only the matchups it played; the rest of the file is kept.
 */

import { execFileSync, fork } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { getManifest } from "../games/manifests";
import { strategiesFor } from "../machines/manifest";
import { compareSeatGroups, seatScore } from "../machines/outcome";
import {
  emptyTally,
  type MatchupTally,
  mergeResults,
  TOURNAMENT_RESULTS_FORMAT,
  type TournamentResults,
  TournamentResultsSchema,
  tallyToMatchup,
} from "./results";
import { TOURNAMENT_SIMULATORS } from "./simulators";
import type { WorkerJob, WorkerReply } from "./worker";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

interface Matchup {
  readonly playerCount: number;
  readonly a: string;
  readonly b: string;
}

interface Job extends WorkerJob {
  readonly matchup: Matchup;
  /** Seats `a` holds in this game. */
  readonly aSeats: readonly number[];
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

  const matchups: Matchup[] = [];
  for (const playerCount of playerCounts) {
    const ids = strategiesFor(manifest, playerCount)
      .map((s) => s.id)
      .filter((id) => !only || only.includes(id));
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) matchups.push({ playerCount, a: ids[i], b: ids[j] });
    }
  }
  if (matchups.length === 0) fail("Nothing to play: fewer than two strategies selected");

  const jobs: Job[] = [];
  for (const matchup of matchups) {
    for (let g = 0; g < games; g++) {
      const seats = Array.from({ length: matchup.playerCount }, (_, s) =>
        (s + g) % 2 === 0 ? matchup.a : matchup.b,
      );
      jobs.push({
        id: jobs.length,
        strategies: seats,
        seed: pairSeed(g),
        matchup,
        aSeats: seats.flatMap((id, s) => (id === matchup.a ? [s] : [])),
      });
    }
  }

  const workerCount = Math.max(
    1,
    Math.min(
      Number(values.workers ?? availableParallelism() - 1),
      simulator.maxWorkers ?? Number.POSITIVE_INFINITY,
      jobs.length,
    ),
  );
  console.log(
    `${slug}: ${matchups.length} matchups × ${games} games = ${jobs.length} games on ${workerCount} workers`,
  );

  const tallies = new Map<Matchup, MatchupTally>(matchups.map((m) => [m, emptyTally()]));
  const failures: string[] = [];
  let finished = 0;
  const startedAt = Date.now();

  const record = (job: Job, reply: WorkerReply) => {
    finished++;
    if (reply.kind === "failed") {
      failures.push(`game ${job.id} (${job.strategies.join(" vs ")}): ${reply.error}`);
    } else if (reply.kind === "done") {
      const tally = tallies.get(job.matchup) ?? emptyTally();
      const bSeats = job.strategies.flatMap((_, s) => (job.aSeats.includes(s) ? [] : [s]));
      const side = compareSeatGroups(reply.outcome, job.aSeats, bSeats);
      tally.games++;
      if (side === "a") tally.aWins++;
      else if (side === "b") tally.bWins++;
      else tally.draws++;
      const mean = (seats: readonly number[]) => {
        const scores = seats.map((s) => seatScore(reply.outcome, s));
        return scores.every((x): x is number => x !== null)
          ? scores.reduce((sum, x) => sum + x, 0) / scores.length
          : null;
      };
      const a = mean(job.aSeats);
      const b = mean(bSeats);
      if (a !== null && b !== null) {
        tally.scoreA += a;
        tally.scoreB += b;
        tally.scored++;
      }
    }
    if (finished % Math.max(1, Math.floor(jobs.length / 20)) === 0 || finished === jobs.length) {
      const seconds = (Date.now() - startedAt) / 1000;
      const eta = (seconds / finished) * (jobs.length - finished);
      console.log(
        `  ${finished}/${jobs.length}  ${seconds.toFixed(0)}s elapsed, ~${eta.toFixed(0)}s left`,
      );
    }
  };

  const queue = [...jobs];
  const workerPath = fileURLToPath(new URL("./worker.ts", import.meta.url));
  // A worker that dies (a crash, the OOM killer) fails the game it held; the
  // rest of the queue carries on in the surviving workers.
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
          const next = () => {
            current = queue.shift();
            if (current) {
              const { id, strategies, seed } = current;
              child.send({ id, strategies, seed } satisfies WorkerJob);
            } else child.disconnect();
          };
          child.on("message", (reply: WorkerReply) => {
            if (reply.kind !== "ready" && current) record(current, reply);
            next();
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

  if (failures.length > 0) {
    console.error(`${failures.length} of ${jobs.length} games failed — nothing written:`);
    for (const f of failures.slice(0, 10)) console.error(`  ${f}`);
    process.exit(1);
  }

  const fresh: TournamentResults = {
    formatVersion: TOURNAMENT_RESULTS_FORMAT,
    slug,
    generatedAt: new Date().toISOString(),
    strategies: manifest.strategies.map(({ id, label }) => ({ id, label })),
    tables: playerCounts.map((playerCount) => ({
      playerCount,
      matchups: matchups
        .filter((m) => m.playerCount === playerCount)
        .map((m) => tallyToMatchup(m.a, m.b, tallies.get(m) ?? emptyTally())),
    })),
  };

  const out =
    values.out ?? `${REPO_ROOT}packages/web/src/games/${slug}/tournament-results.generated.ts`;
  const merged = TournamentResultsSchema.parse(mergeResults(await readPrevious(out), fresh));
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
  console.log(`Wrote ${out}`);
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
