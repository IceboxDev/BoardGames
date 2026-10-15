/**
 * Evaluations that already exist, asked before any search: lichess's cloud
 * evaluations (depth 50–65 on main lines) and ChessDB's ranking of every
 * move (backed-up Stockfish scores). Both are free and keyless; both are
 * asked politely — one request at a time, with a pause between them.
 */
import { z } from "zod";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** lichess and ChessDB write castling as the king taking its rook. */
const CASTLE_AS_ROOK: Record<string, string> = {
  e1h1: "e1g1",
  e1a1: "e1c1",
  e8h8: "e8g8",
  e8a8: "e8c8",
};

export function fixCastle(uci: string, legal: ReadonlySet<string>): string {
  const castle = CASTLE_AS_ROOK[uci];
  return !legal.has(uci) && castle && legal.has(castle) ? castle : uci;
}

class Pacer {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly gapMs: number) {}
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(async () => {
      try {
        return await fn();
      } finally {
        await sleep(this.gapMs);
      }
    });
    this.tail = next.catch(() => undefined);
    return next;
  }
}

const lichessPacer = new Pacer(1_100);
const chessdbPacer = new Pacer(1_000);

export interface LookupLine {
  readonly uci: string;
  readonly cp: number | null;
  readonly mate: number | null;
  readonly depth: number;
  readonly pv: readonly string[];
}

const CloudSchema = z.object({
  depth: z.number(),
  knodes: z.number().optional(),
  pvs: z.array(
    z.object({ moves: z.string(), cp: z.number().optional(), mate: z.number().optional() }),
  ),
});

/** lichess's cloud evaluation (side-to-move scores), or `null` when it has none. */
export async function lichessCloud(
  fen: string,
  multipv: number,
  legal: ReadonlySet<string>,
): Promise<LookupLine[] | null> {
  return lichessPacer.run(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const url = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=${multipv}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
      if (!res) continue;
      if (res.status === 404) return null;
      if (res.status === 429) {
        await sleep(60_000);
        continue;
      }
      if (!res.ok) return null;
      const body = CloudSchema.safeParse(await res.json().catch(() => null));
      if (!body.success) return null;
      const sign = fen.split(" ")[1] === "b" ? -1 : 1; // lichess scores from White's side
      return body.data.pvs.flatMap((pv) => {
        const moves = pv.moves.split(" ").filter(Boolean);
        const first = moves[0];
        if (!first) return [];
        return [
          {
            uci: fixCastle(first, legal),
            cp: pv.cp === undefined ? null : sign * pv.cp,
            mate: pv.mate === undefined ? null : sign * pv.mate,
            depth: body.data.depth,
            pv: moves.slice(0, 24),
          },
        ];
      });
    }
    return null;
  });
}

export interface ChessDbMove {
  readonly uci: string;
  /** Centipawns from the side to move. */
  readonly score: number;
  /** 2 good, 1 acceptable, 0 bad. */
  readonly rank: number;
}

const QueryAllSchema = z.object({
  status: z.string(),
  moves: z
    .array(
      z.object({ uci: z.string(), score: z.union([z.number(), z.string()]), rank: z.number() }),
    )
    .optional(),
});

/** ChessDB's every known move here, best first, or `null` when unknown. */
export async function chessdbMoves(
  fen: string,
  legal: ReadonlySet<string>,
): Promise<ChessDbMove[] | null> {
  return chessdbPacer.run(async () => {
    const url = `https://www.chessdb.cn/cdb.php?action=queryall&board=${encodeURIComponent(fen)}&json=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!res?.ok) return null;
    const body = QueryAllSchema.safeParse(await res.json().catch(() => null));
    if (!body.success || body.data.status !== "ok" || !body.data.moves) return null;
    return body.data.moves
      .flatMap((m) => {
        const score = typeof m.score === "number" ? m.score : Number(m.score);
        if (!Number.isFinite(score)) return [];
        return [{ uci: fixCastle(m.uci, legal), score, rank: m.rank }];
      })
      .filter((m) => legal.has(m.uci))
      .sort((a, b) => b.score - a.score);
  });
}
