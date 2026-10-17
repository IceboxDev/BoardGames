/**
 * The lichess opening explorer for the analysis farm: the most played moves at
 * a position (every rating and speed — the trainer's "popular"), so the farm
 * pads opponent replies exactly like the trainer does. Needs `LICHESS_TOKEN`
 * (a personal token, no scopes) on the server; one request at a time, a minute's
 * wait after a 429 (lichess's rule), a dropped connection retried, answers kept
 * for the life of the process.
 */
import { parseFen } from "@boardgames/core/games/chess/engine/fen";
import { legalMoves } from "@boardgames/core/games/chess/engine/movegen";
import { moveToUci } from "@boardgames/core/games/chess/engine/uci";
import { z } from "zod";

const EXPLORER = "https://explorer.lichess.org/lichess";
const ExplorerSchema = z.object({
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

const cache = new Map<string, Promise<PopularMove[]>>();
let tail: Promise<unknown> = Promise.resolve();

/** Whether the server can ask the explorer at all. */
export const explorerConfigured = () => Boolean(process.env.LICHESS_TOKEN);

async function fetchOnce(fen: string, token: string): Promise<PopularMove[]> {
  const url = new URL(EXPLORER);
  url.search = new URLSearchParams({
    variant: "standard",
    fen,
    moves: "12",
    topGames: "0",
    recentGames: "0",
  }).toString();
  for (let attempt = 0; attempt < 5; attempt++) {
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
    return ExplorerSchema.parse(await res.json())
      .moves.map((m) => {
        const castle = CASTLE_AS_ROOK[m.uci];
        const uci = !legal.has(m.uci) && castle && legal.has(castle) ? castle : m.uci;
        return { uci, games: m.white + m.draws + m.black };
      })
      .filter((m) => legal.has(m.uci))
      .sort((a, b) => b.games - a.games)
      .slice(0, 12);
  }
  throw new Error("lichess explorer kept rate-limiting");
}

/** The most played moves at `fen`, most first. Throws when not configured or lichess fails. */
export function popularMoves(fen: string): Promise<PopularMove[]> {
  const token = process.env.LICHESS_TOKEN;
  if (!token) return Promise.reject(new Error("LICHESS_TOKEN is not set"));
  const key = fen.split(" ").slice(0, 4).join(" ");
  const hit = cache.get(key);
  if (hit) return hit;
  const run = () => fetchOnce(fen, token);
  const next = tail.then(run, run);
  tail = next.catch(() => undefined);
  cache.set(key, next);
  next.catch(() => cache.delete(key));
  return next;
}
