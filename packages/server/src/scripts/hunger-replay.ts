// READ-ONLY: rebuild a stored The Hunger game move by move and report what
// every seat did. The replay row keeps only the seed and the engine's log; the
// actions are recovered by core's `rebuildReplay` (a search over legal actions
// that matches the log). Every AI decision position is written as canonical
// text so the C++ agent can re-examine it:
//
//   pnpm --filter @boardgames/server exec tsx src/scripts/hunger-replay.ts [replayId|latest] [--prod]
//   make -C cpp/the-hunger agent && cpp/the-hunger/build/hg probe <position file> dracula
//
// Output: scratch/bench/hunger/replays/<id>/ — behaviour.json, decisions.tsv,
// positions/t<turn>-s<seat>-<n>.txt.
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyActionPure } from "@boardgames/core/games/the-hunger/game-engine";
import {
  behaviourOf,
  rebuildReplay,
  type StoredReplay,
} from "@boardgames/core/games/the-hunger/replay";
import { canonicalAction, canonicalState } from "@boardgames/core/games/the-hunger/search/canon";
import { createClient } from "@libsql/client";
import { z } from "zod";
import { resolveDbTarget } from "../lib/db-target.ts";

const StoredSchema = z.object({
  seed: z.number(),
  options: z.record(z.string(), z.unknown()),
  strategies: z.array(z.string().nullable()),
  log: z.array(z.record(z.string(), z.unknown())),
  breakdown: z.array(z.object({ missions: z.array(z.object({ id: z.string() })) })),
  scores: z.array(z.number()),
});

const target = resolveDbTarget({ argv: process.argv, env: process.env, writes: false });
console.log(`[hunger-replay] reading ${target.kind} (${target.host})`);
const db = createClient({ url: target.url, authToken: target.authToken });
const arg = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "latest";
const row = (
  await db.execute(
    arg === "latest"
      ? "SELECT id, replay_json FROM session_replays WHERE game_slug = 'the-hunger' ORDER BY id DESC LIMIT 1"
      : { sql: "SELECT id, replay_json FROM session_replays WHERE id = ?", args: [Number(arg)] },
  )
).rows[0];
if (!row) throw new Error(`no The Hunger replay ${arg}`);
const stored = StoredSchema.parse(JSON.parse(String(row.replay_json)));
const replay = stored as unknown as StoredReplay;

const t0 = Date.now();
const steps = rebuildReplay(replay);
if (!steps) throw new Error("could not match the log (engine rules changed since this game?)");
const last = steps[steps.length - 1];
const end = applyActionPure(last.state, last.seat, last.action);
console.log(
  `[hunger-replay] replay ${row.id}: ${steps.length} actions rebuilt in ${Date.now() - t0} ms`,
);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const out = resolve(root, "scratch/bench/hunger/replays", String(row.id));
mkdirSync(resolve(out, "positions"), { recursive: true });
const lines = ["turn\tseat\tstrategy\toptions\taction\tposition"];
const counters = new Map<string, number>();
for (const step of steps) {
  const strategy = replay.strategies[step.seat] ?? "human";
  let file = "";
  if (step.options > 1 && strategy !== "human") {
    const key = `t${step.state.turn}-s${step.seat}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    file = `positions/${key}-${String(n).padStart(2, "0")}.txt`;
    writeFileSync(resolve(out, file), canonicalState(step.state));
  }
  lines.push(
    [step.state.turn, step.seat, strategy, step.options, canonicalAction(step.action), file].join(
      "\t",
    ),
  );
}
writeFileSync(resolve(out, "decisions.tsv"), `${lines.join("\n")}\n`);
// Scores come from the stored result: a Mission swap the log never shows may differ in the rebuild.
const behaviour = behaviourOf(steps, end).map((b, i) => ({ ...b, score: stored.scores[i] }));
writeFileSync(resolve(out, "behaviour.json"), JSON.stringify(behaviour, null, 2));
behaviour.forEach((b, i) => {
  const who = replay.strategies[i] ?? "human";
  const draws = Object.entries(b.missionDraws)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");
  console.log(
    `seat ${i} (${who}): score ${b.score}${b.survived ? "" : " (burnt)"} · Rose ${b.roseTurn ?? "—"} · ` +
      `Tavern ${b.tavernCards} cards · Chests ${b.chests} · digested ${b.digests} · Missions [${draws}] · ` +
      `hunts ${b.hunts} (Fam ${b.familiars}, Pow ${b.powers}, Confuse ${b.confuse}) · furthest ${b.maxCastleDist}`,
  );
});
console.log(`[hunger-replay] wrote ${out}`);
