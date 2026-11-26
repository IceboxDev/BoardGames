// Position bench for Decrypto encryptors: fixed mid-game positions taken from
// the whole-game bench's transcripts (real keywords, the team's real clue
// history, the real code of the next round), each encrypted by every variant
// and judged by the same readers — the Mastermind teammate decodes, two
// Mastermind and two Analyst interceptors try to intercept. Paired by
// position, so it sees smaller effects than whole games. BILLS the model.
//
//   cd packages/server
//   DECRYPTO_BENCH_VARIANTS=1 pnpm exec tsx src/scripts/decrypto-positions.ts --yes \
//     --variants=decrypto-expert,decrypto-expert:joint --positions=40 --label=p1
//
// Results append to scratch/bench/decrypto/positions.jsonl.

import "../env.ts";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { EncryptInput, GuessInput } from "@boardgames/core/games/decrypto/ai/agent";
import { normalizeClue } from "@boardgames/core/games/decrypto/rules";
import type { Code, Digit } from "@boardgames/core/games/decrypto/types";
import { guessAs, openAiDecryptoAgent } from "../games/decrypto-agent.ts";
import { aiSpendTotals } from "../lib/ai";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../../../../scratch/bench/decrypto");
const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const variants = (flag("variants") ?? "decrypto-expert").split(",");
const count = Number(flag("positions") ?? 40);
const label = flag("label") ?? "positions";
const parallel = Number(flag("parallel") ?? 6);

if (!args.includes("--yes")) {
  console.error("This bills the model. Re-run with --yes.");
  process.exit(1);
}

interface TxLine {
  round: number;
  team: 0 | 1;
  code: string;
  clues: [string, string, string] | null;
  decode: string | null;
  intercept: string | null;
}
interface GameLine {
  seed: number;
  keywords: [string[], string[]];
  transcript?: TxLine[];
}

/** Positions at rounds 2–4: the team's history so far and the code it really drew next. */
function positions(): EncryptInput[] {
  const games = readFileSync(resolve(OUT, "games.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as GameLine)
    .filter((g) => g.transcript && g.keywords?.[0] && g.keywords[1]);
  const seen = new Set<string>();
  const out: EncryptInput[] = [];
  for (const g of games) {
    for (const team of [0, 1] as const) {
      for (const round of [2, 3, 4]) {
        const key = `${g.seed}-${team}-${round}`;
        if (seen.has(key)) continue;
        const tx = g.transcript?.find((t) => t.team === team && t.round === round);
        const before = (g.transcript ?? []).filter((t) => t.team === team && t.round < round);
        if (!tx || before.length !== round - 1 || before.some((t) => !t.clues)) continue;
        seen.add(key);
        const tableOf = (rows: TxLine[]) =>
          rows.flatMap((t) =>
            (t.clues ?? []).map((clue, i) => ({
              round: t.round,
              clue,
              digit: Number(t.code[i]) as Digit,
            })),
          );
        const opp = (g.transcript ?? []).filter((t) => t.team !== team && t.round < round);
        const tokens = { interceptions: 0, miscommunications: 0 };
        const oppTokens = { interceptions: 0, miscommunications: 0 };
        for (const t of before) {
          if (t.decode !== t.code) tokens.miscommunications++;
          if (t.intercept === t.code) oppTokens.interceptions++;
        }
        for (const t of opp) {
          if (t.decode !== t.code) oppTokens.miscommunications++;
          if (t.intercept === t.code) tokens.interceptions++;
        }
        out.push({
          model: "",
          keywords: g.keywords[team] as EncryptInput["keywords"],
          code: tx.code.split("").map(Number) as unknown as Code,
          round,
          ownRevealedClues: tableOf(before),
          oppRevealedClues: tableOf(opp),
          forbiddenClues: before.flatMap((t) => (t.clues ?? []).map(normalizeClue)),
          ownDecodeMistakes: [],
          tokens: { own: tokens, opp: oppTokens },
          variant: "standard",
          decoder: "decrypto-expert",
          interceptor: "decrypto-expert",
        });
      }
    }
  }
  // A fixed, spread-out sample: every k-th position.
  const step = Math.max(1, Math.floor(out.length / count));
  return out.filter((_, i) => i % step === 0).slice(0, count);
}

function guessInput(p: EncryptInput, clues: [string, string, string], decode: boolean): GuessInput {
  return {
    model: "",
    purpose: decode ? "decode" : "intercept",
    keywords: decode ? p.keywords : null,
    currentClues: clues,
    targetRevealedClues: p.ownRevealedClues,
    pastDecodeMistakes: [],
    round: p.round,
  };
}

const same = (a: readonly number[], b: readonly number[]) => a.every((d, i) => d === b[i]);

interface Score {
  decoded: number;
  intercepts: number;
  tries: number;
}

async function judge(p: EncryptInput, clues: [string, string, string]): Promise<Score> {
  const [dec, ...ints] = await Promise.all([
    guessAs("decrypto-expert", guessInput(p, clues, true)),
    guessAs("decrypto-expert", guessInput(p, clues, false)),
    guessAs("decrypto-expert", guessInput(p, clues, false)),
    guessAs("decrypto-hard", guessInput(p, clues, false)),
    guessAs("decrypto-hard", guessInput(p, clues, false)),
  ]);
  return {
    decoded: same(dec, p.code) ? 1 : 0,
    intercepts: ints.filter((g) => same(g, p.code)).length,
    tries: ints.length,
  };
}

const list = positions();
console.log(`${list.length} positions × ${variants.length} variants`);
const totals = new Map<string, { decoded: number; intercepts: number; tries: number; n: number }>();
const jobs = list.flatMap((p, i) => variants.map((v) => ({ p, i, v })));
const queue = [...jobs];
await Promise.all(
  Array.from({ length: parallel }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const input = { ...job.p, model: job.v };
      try {
        const { clues } = await openAiDecryptoAgent.encrypt(input);
        const s = await judge(input, clues);
        const t = totals.get(job.v) ?? { decoded: 0, intercepts: 0, tries: 0, n: 0 };
        t.decoded += s.decoded;
        t.intercepts += s.intercepts;
        t.tries += s.tries;
        t.n++;
        totals.set(job.v, t);
        appendFileSync(
          resolve(OUT, "positions.jsonl"),
          `${JSON.stringify({ label, position: job.i, variant: job.v, round: input.round, keywords: input.keywords, code: input.code.join(""), clues, ...s })}\n`,
        );
      } catch (err) {
        console.error(`position ${job.i} ${job.v} failed:`, err);
      }
    }
  }),
);
console.log(`\n${label}`);
for (const [v, t] of totals) {
  console.log(
    `  ${v}: n ${t.n}, decoded ${t.decoded}/${t.n} (${Math.round((100 * t.decoded) / t.n)}%), intercepted ${t.intercepts}/${t.tries} (${Math.round((100 * t.intercepts) / t.tries)}%)`,
  );
}
console.log("  spend:", JSON.stringify(aiSpendTotals().decrypto ?? {}));
process.exit(0);
