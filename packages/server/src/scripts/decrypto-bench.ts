// Whole-game bench for Decrypto's AI tiers: tier A v tier B, every seat an AI,
// played through the real machine and the server's agent. Each seed is played
// twice with the sides swapped (same keywords and codes per side), so a pair
// cancels the deal's luck. BILLS the model on every clue and guess.
//
//   cd packages/server
//   pnpm exec tsx src/scripts/decrypto-bench.ts --yes --pairs=4 --a=decrypto-expert --b=decrypto-hard --label=m1
//
// Flags: --pairs (seeds), --parallel (games at once, default 4), --seed0, --label.
// Per-game lines append to scratch/bench/decrypto/games.jsonl; a summary prints.

import "../env.ts";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DecryptoAiAgent } from "@boardgames/core/games/decrypto/ai/agent";
import { decryptoSpec, withDecryptoAgent } from "@boardgames/core/games/decrypto/machine";
import type { DecryptoContext, Transmission } from "@boardgames/core/games/decrypto/types";
import { createActor } from "xstate";
import { guessWithModel, openAiDecryptoAgent } from "../games/decrypto-agent.ts";
import { mastermindTraceFor, peopleModels } from "../games/decrypto-mastermind.ts";
import { aiAvailable, aiSpendTotals } from "../lib/ai";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "../../../../scratch/bench/decrypto");
const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const pairs = Number(flag("pairs") ?? 2);
const parallel = Number(flag("parallel") ?? 4);
const seed0 = Number(flag("seed0") ?? 7001);
const label = flag("label") ?? "bench";
const tierA = flag("a") ?? "decrypto-expert";
const tierB = flag("b") ?? "decrypto-hard";
/** `--people`: every decode is made by a simulated person (fast, balanced, smart in turn), and encryptors know it. */
const people = args.includes("--people");
let personTurn = 0;
const NO_BEATS = { roundStart: 0, aiBeat: 0, reveal: 0, roundEnd: 0, clueTimeout: 0 };
const GAME_TIMEOUT_MS = 90 * 60_000;

if (!args.includes("--yes")) {
  console.error("This bills the model for every clue and guess. Re-run with --yes.");
  process.exit(1);
}
if (!aiAvailable()) {
  console.error("No AI key for the active AI_PROFILE.");
  process.exit(1);
}

/** Time every decision by tier and purpose. */
const timings: Record<string, number[]> = {};
function timed(name: string, ms: number) {
  const list = timings[name] ?? [];
  list.push(ms);
  timings[name] = list;
}
const agent: DecryptoAiAgent = {
  async encrypt(input) {
    const t = Date.now();
    try {
      return await openAiDecryptoAgent.encrypt(people ? { ...input, decoder: null } : input);
    } finally {
      timed(`${input.model}:encrypt`, Date.now() - t);
    }
  },
  async guess(input) {
    const t = Date.now();
    try {
      if (people && input.purpose === "decode") {
        const models = peopleModels();
        const model = models[personTurn++ % models.length] as string;
        return (await guessWithModel(model, input, "low")) as [
          1 | 2 | 3 | 4,
          1 | 2 | 3 | 4,
          1 | 2 | 3 | 4,
        ];
      }
      return await openAiDecryptoAgent.guess(input);
    } finally {
      timed(`${input.model}:${input.purpose}`, Date.now() - t);
    }
  },
};
const machine = withDecryptoAgent(agent);

interface TeamLine {
  tier: string;
  sent: number;
  decoded: number;
  intercepted: number;
  skipped: number;
  /** Rival transmissions this team intercepted (round 2 on). */
  intercepts: number;
  interceptChances: number;
}

function teamLines(ctx: DecryptoContext, tiers: [string, string]): [TeamLine, TeamLine] {
  const lines = tiers.map((tier) => ({
    tier,
    sent: 0,
    decoded: 0,
    intercepted: 0,
    skipped: 0,
    intercepts: 0,
    interceptChances: 0,
  })) as [TeamLine, TeamLine];
  const all: Transmission[] = ctx.history.flatMap((r) => r.transmissions);
  for (const tx of all) {
    if (!tx.resolved) continue;
    const own = lines[tx.team];
    const rival = lines[1 - tx.team] as TeamLine;
    own.sent++;
    if (tx.skipped) own.skipped++;
    if (!tx.resolved.miscommunicated) own.decoded++;
    if (tx.resolved.intercepted) own.intercepted++;
    if (tx.interceptRequired) {
      rival.interceptChances++;
      if (tx.resolved.intercepted) rival.intercepts++;
    }
  }
  return lines;
}

function play(seed: number, tiers: [string, string]): Promise<DecryptoContext> {
  return new Promise((resolvePlay, reject) => {
    const actor = createActor(machine);
    const timer = setTimeout(() => {
      actor.stop();
      reject(new Error(`seed ${seed}: game did not finish`));
    }, GAME_TIMEOUT_MS);
    actor.subscribe({
      next: (snap) => {
        if (!decryptoSpec.isGameOver(snap)) return;
        clearTimeout(timer);
        const ctx = snap.context;
        actor.stop();
        resolvePlay(ctx);
      },
      error: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });
    actor.start();
    const strategies = [tiers[0], tiers[0], tiers[1], tiers[1]];
    const start = decryptoSpec.buildStart({
      seats: strategies.map((strategy) => ({ kind: "ai" as const, strategy })),
      config: decryptoSpec.manifest.config.parse({}),
      seed,
    });
    if (start.type === "START") actor.send({ ...start, beats: NO_BEATS });
  });
}

mkdirSync(OUT_DIR, { recursive: true });
const jobs: { seed: number; tiers: [string, string] }[] = [];
for (let i = 0; i < pairs; i++) {
  jobs.push({ seed: seed0 + i, tiers: [tierA, tierB] });
  jobs.push({ seed: seed0 + i, tiers: [tierB, tierA] });
}

/** Mastermind encrypts that left a search trace vs fell back to the one-call clue, by tier. */
const searches: Record<string, { traced: number; fallback: number }> = {};
const tally = {
  a: { wins: 0, sent: 0, decoded: 0, intercepted: 0, skipped: 0, intercepts: 0, chances: 0 },
  b: { wins: 0, sent: 0, decoded: 0, intercepted: 0, skipped: 0, intercepts: 0, chances: 0 },
  shared: 0,
  games: 0,
  rounds: 0,
};
const started = Date.now();

async function runJob(job: { seed: number; tiers: [string, string] }) {
  const t = Date.now();
  try {
    const ctx = await play(job.seed, job.tiers);
    const lines = teamLines(ctx, job.tiers);
    const winner = ctx.result?.winner;
    const winnerTier = winner === undefined ? null : job.tiers[winner];
    const line = {
      label,
      at: new Date().toISOString(),
      seed: job.seed,
      white: job.tiers[0],
      black: job.tiers[1],
      winnerTier,
      reason: ctx.result?.reason,
      rounds: ctx.result?.rounds,
      teams: lines,
      keywords: ctx.teams.map((team) => team.keywords),
      transcript: ctx.history.flatMap((r) =>
        r.transmissions.map((tx) => {
          const trace = tx.clues ? mastermindTraceFor(tx.clues) : undefined;
          return {
            round: r.round,
            team: tx.team,
            tier: job.tiers[tx.team],
            code: tx.code.join(""),
            clues: tx.clues,
            decode: tx.decodeGuess?.join("") ?? null,
            intercept: tx.interceptGuess?.join("") ?? null,
            ...(trace
              ? {
                  expect: {
                    decode: +trace.picked.decode.toFixed(2),
                    intercept: +trace.picked.intercept.toFixed(2),
                    exposure: +trace.picked.exposure.toFixed(2),
                    candidates: trace.candidates,
                    played: trace.played.map(
                      (p) => `${p.clues.join("/")} d${p.decodeHits} i${p.interceptHits}`,
                    ),
                    ms: trace.ms,
                  },
                }
              : {}),
          };
        }),
      ),
      ms: Date.now() - t,
    };
    appendFileSync(resolve(OUT_DIR, "games.jsonl"), `${JSON.stringify(line)}\n`);
    for (const t of line.transcript) {
      if (!t.tier.startsWith("decrypto-expert") || !t.clues) continue;
      const s = searches[t.tier] ?? { traced: 0, fallback: 0 };
      if ("expect" in t) s.traced++;
      else s.fallback++;
      searches[t.tier] = s;
    }
    tally.games++;
    tally.rounds += ctx.result?.rounds ?? 0;
    if (winnerTier === null) tally.shared++;
    for (const l of lines) {
      const side = l.tier === tierA ? tally.a : tally.b;
      if (winnerTier === l.tier) side.wins++;
      side.sent += l.sent;
      side.decoded += l.decoded;
      side.intercepted += l.intercepted;
      side.skipped += l.skipped;
      side.intercepts += l.intercepts;
      side.chances += l.interceptChances;
    }
    console.log(
      `seed ${job.seed} ${job.tiers.join(" v ")}: ${winnerTier ?? "shared"} (${line.reason}, ${line.rounds} rounds, ${Math.round(line.ms / 1000)} s) ` +
        lines
          .map(
            (l) =>
              `${l.tier} dec ${l.decoded}/${l.sent} lost ${l.intercepted} int ${l.intercepts}/${l.interceptChances}`,
          )
          .join(" | "),
    );
  } catch (err) {
    console.error(`seed ${job.seed} failed:`, err);
  }
}

const queue = [...jobs];
await Promise.all(
  Array.from({ length: Math.min(parallel, queue.length) }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) await runJob(job);
  }),
);

const pct = (n: number, d: number) => (d === 0 ? "—" : `${Math.round((100 * n) / d)}%`);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : (s[Math.floor(s.length / 2)] as number);
};
const p95 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : (s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] as number);
};
console.log(
  `\n${label}: ${tally.games} games, ${tally.rounds} rounds, ${tally.shared} shared, ${Math.round((Date.now() - started) / 60000)} min`,
);
for (const [name, side] of [
  [tierA, tally.a],
  [tierB, tally.b],
] as const) {
  console.log(
    `  ${name}: wins ${side.wins}, decoded ${side.decoded}/${side.sent} (${pct(side.decoded, side.sent)}), intercepted against ${side.intercepted}, intercepts ${side.intercepts}/${side.chances} (${pct(side.intercepts, side.chances)}), skipped ${side.skipped}`,
  );
}
for (const [name, xs] of Object.entries(timings).sort()) {
  console.log(
    `  ${name}: n ${xs.length}, p50 ${(median(xs) / 1000).toFixed(1)} s, p95 ${(p95(xs) / 1000).toFixed(1)} s`,
  );
}
for (const [tier, s] of Object.entries(searches)) {
  console.log(`  ${tier}: searches ${s.traced}, fell back ${s.fallback}`);
}
console.log("  spend:", JSON.stringify(aiSpendTotals().decrypto ?? {}));
process.exit(0);
