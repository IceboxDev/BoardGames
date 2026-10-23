/**
 * The lichess opening explorer for the analysis farm: the most played moves at
 * a position (every rating and speed — the trainer's "popular"), so the farm
 * pads opponent replies exactly like the trainer does, and how many games
 * reached the position (the farm's claim order). Needs `LICHESS_TOKEN`
 * (a personal token, no scopes) on the server; one request at a time, at least
 * three seconds apart (lichess refuses faster), a minute's wait after a 429
 * (lichess's rule), a dropped connection retried. Every answer goes into the
 * shared explorer cache (`explorer-cache.ts`), which is read first, so a
 * position is fetched once for the farm and every member's trainer.
 */
import { parseFen } from "@boardgames/core/games/chess/engine/fen";
import { legalMoves } from "@boardgames/core/games/chess/engine/movegen";
import { moveToUci } from "@boardgames/core/games/chess/engine/uci";
import type { ExplorerAnswer as CachedAnswer } from "@boardgames/core/protocol";
import { z } from "zod";
import { getDb } from "../../db.ts";
import { lookupExplorer, saveExplorer } from "./explorer-cache.ts";

const EXPLORER = "https://explorer.lichess.org/lichess";
const ExplorerSchema = z.object({
  white: z.number(),
  draws: z.number(),
  black: z.number(),
  moves: z.array(
    z.object({ uci: z.string(), white: z.number(), draws: z.number(), black: z.number() }),
  ),
});
/** lichess writes castling as the king taking its rook. */
const CASTLE_AS_ROOK: Record<string, string> = {
  e1h1: "e1g1",
  e1a1: "e1c1",
  e8h8: "e8g8",
  e8a8: "e8c8",
};

export interface PopularMove {
  readonly uci: string;
  readonly games: number;
}

/** One explorer answer: the position's game count and its most played moves. */
interface ExplorerAnswer {
  readonly games: number;
  readonly moves: PopularMove[];
}

/** lichess refuses explorer requests faster than about one every three seconds. */
const MIN_GAP_MS = 3_000;
const cache = new Map<string, Promise<ExplorerAnswer>>();
let tail: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

/** The farm pads replies from the top 12, as the trainer does. */
const toPopular = (a: CachedAnswer): ExplorerAnswer => ({
  games: a.games,
  moves: a.moves
    .map((m) => ({ uci: m.uci, games: m.white + m.draws + m.black }))
    .sort((x, y) => y.games - x.games)
    .slice(0, 12),
});

/** Whether the server can ask the explorer at all. */
export const explorerConfigured = () => Boolean(process.env.LICHESS_TOKEN);

async function fetchOnce(fen: string, token: string): Promise<CachedAnswer> {
  const url = new URL(EXPLORER);
  url.search = new URLSearchParams({
    variant: "standard",
    fen,
    moves: "30",
    topGames: "0",
    recentGames: "0",
  }).toString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      // A dropped connection or a timeout: try again shortly.
      if (attempt === 4) throw err;
      await new Promise((r) => setTimeout(r, 15_000));
      continue;
    }
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 60_000));
      continue;
    }
    if (!res.ok) throw new Error(`lichess explorer ${res.status}`);
    const legal = new Set(legalMoves(parseFen(fen)).map(moveToUci));
    const answer = ExplorerSchema.parse(await res.json());
    const moves = answer.moves
      .map((m) => {
        const castle = CASTLE_AS_ROOK[m.uci];
        const uci = !legal.has(m.uci) && castle && legal.has(castle) ? castle : m.uci;
        return { uci, white: m.white, draws: m.draws, black: m.black };
      })
      .filter((m) => legal.has(m.uci));
    return { games: answer.white + answer.draws + answer.black, moves };
  }
  throw new Error("lichess explorer kept rate-limiting");
}

function explore(fen: string): Promise<ExplorerAnswer> {
  const token = process.env.LICHESS_TOKEN;
  if (!token) return Promise.reject(new Error("LICHESS_TOKEN is not set"));
  const key = fen.split(" ").slice(0, 4).join(" ");
  const hit = cache.get(key);
  if (hit) return hit;
  // The shared cache first; lichess only for a position nobody has fetched.
  const fromLichess = () => {
    const run = () => fetchOnce(fen, token);
    const fetched = tail.then(run, run);
    tail = fetched.catch(() => undefined);
    return fetched.then(async (a) => {
      await saveExplorer(getDb(), [{ fen, ...a }]).catch((err: unknown) =>
        console.error("[chess-farm] explorer cache save failed", err),
      );
      return a;
    });
  };
  const next = lookupExplorer(getDb(), [fen])
    .catch(() => new Map<string, CachedAnswer>())
    .then((found) => found.get(fen) ?? fromLichess())
    .then(toPopular);
  cache.set(key, next);
  next.catch(() => cache.delete(key));
  return next;
}

/** The most played moves at `fen`, most first. Throws when not configured or lichess fails. */
export async function popularMoves(fen: string): Promise<PopularMove[]> {
  return (await explore(fen)).moves;
}

/** How many lichess games reached `fen`. Throws when not configured or lichess fails. */
export async function positionGames(fen: string): Promise<number> {
  return (await explore(fen)).games;
}
