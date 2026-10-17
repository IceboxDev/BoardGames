/**
 * What a finished position leads to, worked out on the worker so it can search
 * those positions next. They are the positions the member's next tree rebuild
 * would ask for (`builder.ts`), from their games:
 *
 *   your position P, best move m   → the opponent position Q = P+m (its top three
 *     (on a game line)               pads it or marks the best), and your position
 *                                    after every reply played at Q, reach = games
 *                                    that went P → m → reply.
 *   opponent position Q            → your positions after the replies the
 *     (on a game line)               trainer's padding adds (`padReplies`: the
 *                                    explorer's most popular and the engine's
 *                                    top three, alternating, up to three; reach 0).
 *
 * A line end — your games reached P but none played m — gets a short extension
 * instead (the job's `stage`): 1 the opponent position after m (its three
 * replies), 2 your best answer to each, 3 the opponent position after each of
 * those (its three replies are the tree's leaves). Your answer to a reply no
 * game of yours faced (padding) gets the same last step: the opponent position
 * after it, at stage 3. Nothing follows an opponent position after your own
 * deviation: those aren't analysed.
 */
import { applyMove } from "@boardgames/core/games/chess/engine/apply";
import { parseFen, positionKey, toFen } from "@boardgames/core/games/chess/engine/fen";
import { legalMoves } from "@boardgames/core/games/chess/engine/movegen";
import type { Position } from "@boardgames/core/games/chess/engine/types";
import { moveToUci } from "@boardgames/core/games/chess/engine/uci";
import { padReplies } from "@boardgames/core/games/chess/trainer/padding";
import { MAX_PLIES, type PositionIndex } from "@boardgames/core/games/chess/trainer/position-index";
import type { FarmJob, PositionEval } from "@boardgames/core/protocol";

export interface FollowUp {
  readonly fen: string;
  readonly kind: "user" | "opp";
  readonly reach: number;
  /** 0 on a game line; 1–3 a line end's extension. */
  readonly stage: number;
}

/** Whether `job`'s follow-ups need the explorer's popular moves (they pad its replies). */
export const needsPopular = (job: FarmJob): boolean =>
  job.kind === "opp" && (job.reach > 0 || job.stage === 1);

const MIN_REPLIES = 3;

function play(pos: Position, uci: string): Position | null {
  const move = legalMoves(pos).find((m) => moveToUci(m) === uci);
  return move ? applyMove(pos, move) : null;
}

/** Plies from the start, from the FEN's move number (0 when it has none). */
function plyOf(fen: string): number {
  const [, side, , , , full] = fen.split(" ");
  const n = Number(full ?? 1) || 1;
  return (n - 1) * 2 + (side === "b" ? 1 : 0);
}

/**
 * Positions to search next, most wanted first. `index` holds the member's
 * games as the colour they played (the side to move at a user job).
 */
export function followUps(
  job: FarmJob,
  result: PositionEval,
  index: PositionIndex,
  /** The explorer's most played moves at an opponent position (most first). */
  popular: readonly string[] = [],
): FollowUp[] {
  const pos = parseFen(job.fen);
  const stage = job.stage ?? 0;
  if (plyOf(job.fen) + 2 >= MAX_PLIES) return [];

  if (job.kind === "user") {
    const q = play(pos, result.best);
    // Mate or stalemate: nothing to search after it.
    if (!q || legalMoves(q).length === 0) return [];
    // Your answer off the games (the extension's, or to a reply no game of yours
    // faced) leads to a last opponent position: its replies are leaves.
    if (stage === 2 || (stage === 0 && job.reach === 0))
      return [{ fen: toFen(q), kind: "opp", reach: 0, stage: 3 }];
    if (stage !== 0) return [];
    // Games that stood here and played the best move: what their opponents answered.
    let tookBest = 0;
    const replies = new Map<string, number>();
    for (const { game, ply } of index.occurrences(positionKey(pos))) {
      const moves = index.games[game]?.moves;
      if (moves?.[ply] !== result.best) continue;
      tookBest++;
      const r = moves[ply + 1];
      if (r) replies.set(r, (replies.get(r) ?? 0) + 1);
    }
    // Your games reached P and all left it: the line ends at your move.
    if (tookBest === 0) return [{ fen: toFen(q), kind: "opp", reach: 0, stage: 1 }];
    // Every move played against you at Q, by any route.
    const played = index.movesFrom(positionKey(q)).map((s) => s.uci);
    for (const r of played) if (!replies.has(r)) replies.set(r, 0);
    const out: FollowUp[] = [{ fen: toFen(q), kind: "opp", reach: tookBest, stage: 0 }];
    for (const [r, games] of [...replies].sort((a, b) => b[1] - a[1])) {
      const next = play(q, r);
      if (next) out.push({ fen: toFen(next), kind: "user", reach: games, stage: 0 });
    }
    return out;
  }

  // Opponent positions: on a game line, or the extension's first step.
  if (stage === 3 || (stage === 0 && job.reach === 0) || stage === 2) return [];
  const legal = new Set(legalMoves(pos).map(moveToUci));
  const observed = index
    .movesFrom(positionKey(pos))
    .map((s) => s.uci)
    .filter((u) => legal.has(u));
  // The trainer's reply rule: every played reply, padded to three (`padReplies`:
  // most popular, best, 2nd most popular, 2nd best, …); the first opponent move
  // is never padded.
  const youAreWhite = pos.turn === "b";
  const firstMove = plyOf(job.fen) === (youAreWhite ? 1 : 0) && observed.length > 0;
  const replies =
    observed.length >= MIN_REPLIES || firstMove
      ? observed.map((uci) => ({ uci, source: "played" as const }))
      : padReplies(
          observed,
          result.lines.map((l) => l.uci),
          popular,
          legal,
          MIN_REPLIES,
        );
  return (
    replies
      // On a game line your positions after played replies came with the position before.
      .filter((r) => stage === 1 || r.source !== "played")
      .flatMap((r) => {
        const next = play(pos, r.uci);
        return next
          ? [{ fen: toFen(next), kind: "user" as const, reach: 0, stage: stage === 1 ? 2 : 0 }]
          : [];
      })
  );
}
