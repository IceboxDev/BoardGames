// Interception bench: real transmissions from the whole-game bench's
// transcripts (the team's public table before that round, the three clues,
// the true code), guessed by every interceptor variant. The items never
// change, so variants are compared on exactly the same transmissions — far
// less noise than whole games. BILLS the model.
//
//   cd packages/server
//   DECRYPTO_BENCH_VARIANTS=1 pnpm exec tsx src/scripts/decrypto-intercepts.ts --yes \
//     --variants=decrypto-expert,decrypto-expert:khyp --items=160 --label=i1
//
// Results append to scratch/bench/decrypto/intercepts.jsonl.

import "../env.ts";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GuessInput } from "@boardgames/core/games/decrypto/ai/agent";
import type { Digit } from "@boardgames/core/games/decrypto/types";
import { guessAs } from "../games/decrypto-agent.ts";
import { aiSpendTotals } from "../lib/ai";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../../../../scratch/bench/decrypto");
const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const variants = (flag("variants") ?? "decrypto-expert").split(",");
const count = Number(flag("items") ?? 160);
const label = flag("label") ?? "intercepts";
const parallel = Number(flag("parallel") ?? 8);

if (!args.includes("--yes")) {
  console.error("This bills the model. Re-run with --yes.");
  process.exit(1);
}

interface TxLine {
  round: number;
  team: 0 | 1;
  code: string;
  clues: [string, string, string] | null;
}

interface Item {
  key: string;
  round: number;
  code: number[];
  input: GuessInput;
}

function items(): Item[] {
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const line of readFileSync(resolve(OUT, "games.jsonl"), "utf8").split("\n")) {
    if (!line) continue;
    const g = JSON.parse(line) as { seed: number; label: string; transcript?: TxLine[] };
    for (const tx of g.transcript ?? []) {
      if (tx.round < 2 || !tx.clues) continue;
      const before = (g.transcript ?? []).filter((t) => t.team === tx.team && t.round < tx.round);
      if (before.some((t) => !t.clues)) continue;
      const key = `${g.label}-${g.seed}-${tx.team}-${tx.round}-${tx.clues.join("|")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        round: tx.round,
        code: tx.code.split("").map(Number),
        input: {
          model: "",
          purpose: "intercept",
          keywords: null,
          currentClues: tx.clues,
          targetRevealedClues: before.flatMap((t) =>
            (t.clues ?? []).map((clue, i) => ({
              round: t.round,
              clue,
              digit: Number(t.code[i]) as Digit,
            })),
          ),
          pastDecodeMistakes: [],
          round: tx.round,
        },
      });
    }
  }
  const step = Math.max(1, Math.floor(out.length / count));
  return out.filter((_, i) => i % step === 0).slice(0, count);
}

const list = items();
console.log(`${list.length} items × ${variants.length} variants`);
const totals = new Map<string, { hits: number; digits: number; n: number; failed: number }>();
const queue = list.flatMap((item) => variants.map((v) => ({ item, v })));
await Promise.all(
  Array.from({ length: parallel }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const t = totals.get(job.v) ?? { hits: 0, digits: 0, n: 0, failed: 0 };
      totals.set(job.v, t);
      try {
        const guess = await guessAs(job.v, { ...job.item.input, model: job.v });
        const digits = guess.filter((d, i) => d === job.item.code[i]).length;
        t.n++;
        t.digits += digits;
        if (digits === 3) t.hits++;
        appendFileSync(
          resolve(OUT, "intercepts.jsonl"),
          `${JSON.stringify({ label, item: job.item.key, round: job.item.round, variant: job.v, guess: guess.join(""), code: job.item.code.join(""), hit: digits === 3, digits })}\n`,
        );
      } catch (err) {
        t.failed++;
        console.error(`${job.v} failed:`, String(err).slice(0, 200));
      }
    }
  }),
);
console.log(`\n${label}`);
for (const [v, t] of totals) {
  console.log(
    `  ${v}: n ${t.n}, exact ${t.hits} (${Math.round((100 * t.hits) / t.n)}%), digits ${(t.digits / t.n).toFixed(2)}/3, failed ${t.failed}`,
  );
}
console.log("  spend:", JSON.stringify(aiSpendTotals().decrypto ?? {}));
process.exit(0);
