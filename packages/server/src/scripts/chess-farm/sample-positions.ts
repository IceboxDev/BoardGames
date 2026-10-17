/**
 * Phase 0 of the analysis farm: build the member's trees with a stand-in
 * engine (agreeing with their own most-played move with probability P, as a
 * real engine roughly would) to learn how many positions each depth tier
 * holds, and write a stratified sample of real tree positions for
 * `calibrate.ts` to time on the farm machine.
 *
 *   pnpm --filter @boardgames/server exec tsx src/scripts/chess-farm/sample-positions.ts \
 *     --user <lichess name> [--p 0.65] [--per-tier 8] [--scale 1] > positions.json
 *
 * Reads the staging database (`.env`).
 */
import "dotenv/config";
import { applyMove } from "@boardgames/core/games/chess/engine/apply";
import { parseFen, positionKey } from "@boardgames/core/games/chess/engine/fen";
import { legalMoves } from "@boardgames/core/games/chess/engine/movegen";
import { moveToUci } from "@boardgames/core/games/chess/engine/uci";
import { buildTree } from "@boardgames/core/games/chess/trainer/builder";
import { tierOf } from "@boardgames/core/games/chess/trainer/eval-policy";
import {
  hashKey,
  legalPrefix,
  PositionIndex,
  type TrainerGame,
} from "@boardgames/core/games/chess/trainer/position-index";
import { TreeSettingsSchema } from "@boardgames/core/games/chess/trainer/tree";
import { createClient } from "@libsql/client";

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const USER = arg("user");
const P = Number(arg("p", "0.65"));
const PER_TIER = Number(arg("per-tier", "8"));
/** Multiply counts to project a bigger import (e.g. 10k / games imported, sub-linear growth applied by the caller). */
const SCALE = Number(arg("scale", "1"));

async function main() {
  if (!USER) throw new Error("--user <lichess name> is required");
  const db = createClient({
    url: process.env.TURSO_DATABASE_URL as string,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  const out = {
    p: P,
    games: { w: 0, b: 0 },
    workload: { user: { trunk: 0, main: 0, rare: 0, leaf: 0 }, opp: 0 },
    /** Deviation leaves: distinct positions right after your own move left the tree. */
    leaves: { w: 0, b: 0 },
    positions: [] as {
      fen: string;
      kind: "user" | "opp";
      reach: number;
      tier: string;
      ply: number;
    }[],
  };
  for (const color of ["w", "b"] as const) {
    const games: TrainerGame[] = [];
    for (let off = 0; ; off += 500) {
      const r = await db.execute({
        sql: `SELECT g.game_id, g.uci, g.result FROM chess_imported_games g
              JOIN chess_lichess_links l USING (user_id)
              WHERE lower(l.lichess_username) = lower(?) AND g.color = ?
              ORDER BY g.played_at_ms, g.game_id LIMIT 500 OFFSET ?`,
        args: [USER, color, off],
      });
      for (const x of r.rows) {
        games.push({
          id: String(x.game_id),
          moves: legalPrefix(String(x.uci)),
          result: String(x.result) as TrainerGame["result"],
        });
      }
      if (r.rows.length < 500) break;
    }
    out.games[color] = games.length;
    const index = PositionIndex.build(games);
    const tree = await buildTree(
      index,
      color,
      TreeSettingsSchema.parse({ handpickMoves: 0, engineDepth: 8 }),
      null,
      {
        engineLines: async (fen, n, depth) => {
          const pos = parseFen(fen);
          const key = positionKey(pos);
          const legal = legalMoves(pos).map(moveToUci);
          const mine = index
            .movesFrom(key)
            .map((m) => m.uci)
            .filter((u) => legal.includes(u));
          const agree = (hashKey(`${key}x`) % 1000) / 1000 < P;
          const others = legal.filter((u) => !mine.includes(u));
          const order = agree && mine[0] ? [mine[0], ...others] : [...others, ...mine];
          return order.slice(0, n).map((uci) => ({ uci, cp: 0, mate: null, depth }));
        },
        popularMoves: async () => [],
      },
    );
    const leafKeys = new Set<string>();
    for (const node of Object.values(tree.nodes)) {
      if (node.side !== "user" || !node.deviations) continue;
      const pos = parseFen(node.fen);
      const legal = legalMoves(pos);
      for (const d of node.deviations) {
        const move = legal.find((m) => moveToUci(m) === d.uci);
        if (!move) continue;
        const next = applyMove(pos, move);
        const key = positionKey(next);
        if (!tree.nodes[key] && legalMoves(next).length > 0) leafKeys.add(key);
      }
    }
    out.leaves[color] = Math.round(leafKeys.size * SCALE);
    const byTier = new Map<string, typeof out.positions>();
    for (const node of Object.values(tree.nodes)) {
      if (!node.engine) continue; // no engine was needed here
      const kind = node.side === "user" ? "user" : "opp";
      const reach = node.following;
      const tier = kind === "opp" ? "opp" : tierOf(reach).name;
      if (kind === "opp") out.workload.opp += SCALE;
      else out.workload.user[tier as "trunk"] += SCALE;
      const list = byTier.get(tier) ?? [];
      list.push({ fen: node.fen, kind, reach, tier, ply: node.ply });
      byTier.set(tier, list);
    }
    for (const list of byTier.values()) {
      // A spread over plies, deterministic.
      list.sort((a, b) => hashKey(a.fen) - hashKey(b.fen));
      out.positions.push(...list.slice(0, Math.ceil(PER_TIER / 2)));
    }
  }
  for (const k of Object.keys(out.workload.user) as (keyof typeof out.workload.user)[]) {
    out.workload.user[k] = Math.round(out.workload.user[k]);
  }
  out.workload.opp = Math.round(out.workload.opp);
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
