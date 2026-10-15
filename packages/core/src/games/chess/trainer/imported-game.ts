/**
 * A game imported from lichess for the opening trainer, stored compactly: the
 * moves as space-separated UCI (`e2e4 e7e5 g1f3`), seen from the account that
 * imported it.
 */
import { z } from "zod";
import { applyMove } from "../engine/apply";
import { parseFen, START_FEN } from "../engine/fen";
import { parseSan } from "../engine/san";
import { moveToUci } from "../engine/uci";

export const TRAINER_SPEEDS = [
  "ultraBullet",
  "bullet",
  "blitz",
  "rapid",
  "classical",
  "correspondence",
] as const;
export const TrainerSpeedSchema = z.enum(TRAINER_SPEEDS);
export type TrainerSpeed = z.infer<typeof TrainerSpeedSchema>;

/** A UCI move list: board moves only (no drops), at most 600 plies. */
export const UciLineSchema = z
  .string()
  .max(600 * 6)
  .regex(/^([a-h][1-8][a-h][1-8][qrbn]?)?( [a-h][1-8][a-h][1-8][qrbn]?)*$/);

export const ImportedGameSchema = z.object({
  /** The lichess game id. */
  id: z.string().regex(/^[A-Za-z0-9]{8}$/),
  /** The colour the importing account played. */
  color: z.enum(["w", "b"]),
  uci: UciLineSchema,
  /** When the game was created on lichess (ms since epoch). */
  playedAt: z.number().int().nonnegative(),
  speed: TrainerSpeedSchema,
  rated: z.boolean(),
  /** From the importing account's side. */
  result: z.enum(["win", "loss", "draw"]),
  opponent: z.string().max(40),
  opponentRating: z.number().int().nullable(),
});
export type ImportedGame = z.infer<typeof ImportedGameSchema>;

/** The fields of a lichess NDJSON game export line this module reads. */
const LichessPlayerSchema = z.object({
  user: z.object({ id: z.string(), name: z.string() }).optional(),
  rating: z.number().optional(),
  aiLevel: z.number().optional(),
});
const LichessGameSchema = z.object({
  id: z.string(),
  rated: z.boolean().optional(),
  variant: z.string(),
  speed: z.string(),
  createdAt: z.number(),
  status: z.string(),
  players: z.object({ white: LichessPlayerSchema, black: LichessPlayerSchema }),
  winner: z.enum(["white", "black"]).optional(),
  moves: z.string().optional(),
  initialFen: z.string().optional(),
});

/** Why `fromLichessJson` skipped a line (for the import's counters). */
export type SkipReason = "variant" | "position" | "no-moves" | "not-mine" | "unreadable";

export type LichessParse = { game: ImportedGame } | { skipped: SkipReason };

/**
 * One NDJSON line of `GET /api/games/user/{name}` → an imported game, or why
 * it doesn't belong in an opening tree: another variant, a game from a set-up
 * position, no moves (aborted), or one the account didn't play.
 */
export function fromLichessJson(line: unknown, myId: string): LichessParse {
  const parsed = LichessGameSchema.safeParse(line);
  if (!parsed.success) return { skipped: "unreadable" };
  const g = parsed.data;
  if (g.variant !== "standard") return { skipped: "variant" };
  if (g.initialFen && g.initialFen !== START_FEN) return { skipped: "position" };
  const speed = TrainerSpeedSchema.safeParse(g.speed);
  if (!speed.success) return { skipped: "variant" };
  const me = myId.toLowerCase();
  const color =
    g.players.white.user?.id === me ? "w" : g.players.black.user?.id === me ? "b" : null;
  if (!color) return { skipped: "not-mine" };
  const san = (g.moves ?? "").split(" ").filter(Boolean);
  if (san.length === 0 || g.status === "aborted" || g.status === "noStart") {
    return { skipped: "no-moves" };
  }
  const uci: string[] = [];
  let pos = parseFen(START_FEN);
  for (const token of san) {
    const move = parseSan(pos, token);
    if (!move) break; // keep the legal prefix
    uci.push(moveToUci(move));
    pos = applyMove(pos, move);
  }
  if (uci.length === 0) return { skipped: "unreadable" };
  const opp = color === "w" ? g.players.black : g.players.white;
  const winner = g.winner === "white" ? "w" : g.winner === "black" ? "b" : null;
  return {
    game: {
      id: g.id,
      color,
      uci: uci.join(" "),
      playedAt: g.createdAt,
      speed: speed.data,
      rated: g.rated ?? false,
      result: winner === null ? "draw" : winner === color ? "win" : "loss",
      opponent: (
        opp.user?.name ?? (opp.aiLevel ? `Stockfish level ${opp.aiLevel}` : "Anonymous")
      ).slice(0, 40),
      opponentRating: opp.rating ?? null,
    },
  };
}
