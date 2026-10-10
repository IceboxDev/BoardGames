/**
 * The stored record of a finished Go game. Positions are not stored: the
 * moves replay deterministically through `game.ts`.
 */

import { z } from "zod";
import { TimeControlSchema } from "../../machines/clock";
import type { GoSession } from "./session";

export const GoReplayLogSchema = z.object({
  formatVersion: z.literal(1),
  size: z.number().int().min(5).max(19),
  komi: z.number(),
  handicap: z.number().int().min(0).max(9),
  rules: z.literal("chinese"),
  timeControl: TimeControlSchema,
  /** Strategy per colour; `null` for a person. */
  players: z.tuple([z.string().nullable(), z.string().nullable()]),
  /** `p`: point or `null` for a pass; `ms`: thinking time. Colours alternate from `toMoveFirst`. */
  moves: z.array(
    z.object({
      c: z.union([z.literal(0), z.literal(1)]),
      p: z.number().int().nullable(),
      ms: z.number(),
    }),
  ),
  undos: z.array(z.object({ atMove: z.number().int(), by: z.union([z.literal(0), z.literal(1)]) })),
  end: z.object({
    reason: z.enum(["score", "resign", "timeout"]),
    winner: z.union([z.literal(0), z.literal(1)]).nullable(),
    result: z.string(),
    dead: z.array(z.number().int()),
    blackTotal: z.number().optional(),
    whiteTotal: z.number().optional(),
  }),
});
export type GoReplayLog = z.infer<typeof GoReplayLogSchema>;

export function buildReplayLog(s: GoSession): GoReplayLog | null {
  if (!s.end) return null;
  const { game } = s;
  return {
    formatVersion: 1,
    size: game.size,
    komi: game.komi,
    handicap: game.handicap,
    rules: "chinese",
    timeControl: s.timeControl,
    players: [s.seats[0], s.seats[1]],
    moves: game.moves.map((m, i) => ({ c: m.color, p: m.point, ms: Math.round(s.moveMs[i] ?? 0) })),
    undos: s.undos.map((u) => ({ atMove: u.atMove, by: u.by })),
    end: {
      reason: s.end.reason,
      winner: s.end.winner,
      result: s.end.result,
      dead: [...s.end.dead],
      ...(s.end.breakdown
        ? { blackTotal: s.end.breakdown.black.total, whiteTotal: s.end.breakdown.white.total }
        : {}),
    },
  };
}
