/**
 * KataGo as a Go opponent:
 *   - `katago-max` searches (`GO_KATAGO_MAX_VISITS`, default 400) and plays its best move;
 *   - `katago-5k / -1k / -5d` sample a move from the human-style network's
 *     policy for that rank (`humanSLProfile`) — one visit is enough, so these
 *     tiers are cheap and play like people of that strength, mistakes included.
 * Every move is checked against the game's own legal list before it is played.
 */

import type { GoMoveRequest } from "@boardgames/core/games/go/ai/services";
import { fromGtp, toGtp } from "@boardgames/core/games/go/coords";
import { deadStonesFrom } from "@boardgames/core/games/go/estimate";
import { legalPoints } from "@boardgames/core/games/go/game";
import type { GoStrategy } from "@boardgames/core/games/go/manifest";
import type { GoGame } from "@boardgames/core/games/go/types";
import { createRng } from "@boardgames/core/lib/rng";
import { kataGoEngine } from "./engine.ts";
import { GO_RULES, type KataGoEngine, type KataGoQuery } from "./protocol.ts";

const HUMAN_PROFILE: Partial<Record<GoStrategy, string>> = {
  "katago-5k": "rank_5k",
  "katago-1k": "rank_1k",
  "katago-5d": "rank_5d",
};

const MOVE_PRIORITY = 10;
const OWNERSHIP_VISITS = 200;

/** The position as a KataGo query (handicap stones as setup, moves as played). */
export function baseQuery(
  game: Pick<GoGame, "size" | "komi" | "handicapStones" | "moves">,
): KataGoQuery {
  return {
    rules: GO_RULES,
    komi: game.komi,
    boardXSize: game.size,
    boardYSize: game.size,
    initialStones: game.handicapStones.map((p) => ["B", toGtp(game.size, p)]),
    moves: game.moves.map((m) => [m.color === 0 ? "B" : "W", toGtp(game.size, m.point)]),
  };
}

export interface KataGoMover {
  move(req: GoMoveRequest): Promise<number | null>;
  deadStones(game: GoGame): Promise<number[]>;
}

/** Sample a legal point (or pass) from a policy over `size*size + 1` entries (last = pass). */
export function samplePolicy(
  policy: readonly number[],
  legal: ReadonlySet<number>,
  seed: number,
): number | null {
  const n = policy.length - 1;
  let total = 0;
  const weights: [number | null, number][] = [];
  for (let i = 0; i <= n; i++) {
    const w = policy[i] ?? -1;
    if (w <= 0) continue;
    const point = i === n ? null : i;
    if (point !== null && !legal.has(point)) continue;
    weights.push([point, w]);
    total += w;
  }
  if (total <= 0) return null;
  let r = createRng(seed)() * total;
  for (const [point, w] of weights) {
    r -= w;
    if (r <= 0) return point;
  }
  return weights.at(-1)?.[0] ?? null;
}

export function createKataGoMover(engine: KataGoEngine): KataGoMover {
  return {
    async move(req) {
      const { game } = req;
      const legal = new Set(legalPoints(game));
      const profile = HUMAN_PROFILE[req.strategy];
      const timeout = Math.max(5_000, req.timeMs * 3);
      if (profile) {
        const [r] = await engine.query(
          {
            ...baseQuery(game),
            maxVisits: 1,
            includePolicy: true,
            priority: MOVE_PRIORITY,
            overrideSettings: { humanSLProfile: profile },
          },
          timeout,
        );
        const policy = r?.humanPolicy ?? r?.policy;
        if (!policy) throw new Error("KataGo returned no policy (is the human model loaded?)");
        return samplePolicy(policy, legal, req.seed);
      }
      const visits = Number(process.env.GO_KATAGO_MAX_VISITS ?? 400);
      const [r] = await engine.query(
        {
          ...baseQuery(game),
          maxVisits: visits,
          priority: MOVE_PRIORITY,
          overrideSettings: { maxTime: Math.max(0.5, req.timeMs / 1000) },
        },
        timeout,
      );
      const ranked = [...(r?.moveInfos ?? [])].sort((a, b) => a.order - b.order);
      for (const info of ranked) {
        const point = fromGtp(game.size, info.move);
        if (point === null) return null;
        if (point !== undefined && legal.has(point)) return point;
      }
      throw new Error("KataGo offered no legal move");
    },
    async deadStones(game) {
      const [r] = await engine.query(
        {
          ...baseQuery(game),
          maxVisits: OWNERSHIP_VISITS,
          includeOwnership: true,
          priority: MOVE_PRIORITY,
        },
        15_000,
      );
      if (!r?.ownership) throw new Error("KataGo returned no ownership");
      return deadStonesFrom(game, r.ownership);
    },
  };
}

export function kataGoMover(): KataGoMover | null {
  const engine = kataGoEngine();
  return engine ? createKataGoMover(engine) : null;
}
