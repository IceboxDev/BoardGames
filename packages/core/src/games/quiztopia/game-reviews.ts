// A finished co-op table as trainer reviews: which seat is graded on which
// judged question. Pure — the server feeds it the persisted replay log and
// the seat → account map at game over (`server/src/lib/quiztopia/
// game-reviews.ts`), so nothing here trusts a client.
//
// Who gets a review for a judged question:
//   - nobody for a redrawn question (`correct === null`) — it was never answered;
//   - never the reader — they held the card with the answer on it;
//   - in Expert mode outside a plenum, only the active seat — they answered alone;
//   - otherwise every seat — the table discussed it together.
// The grade is the table's verdict: right → "good", wrong → "again".
//
// Each review's id is `game:<gameId>:<turn>`, unique per game and turn and
// idempotent per member, so re-running this for one game never grades twice.

import { z } from "zod";

/** The fields of the persisted replay log (`QuiztopiaReplayLog`) this reads. */
export const GameReviewLogSchema = z.object({
  slug: z.literal("quiztopia"),
  config: z.object({ expert: z.boolean() }),
  questions: z.array(
    z.object({
      turn: z.number().int().nonnegative(),
      questionId: z.string(),
      activeSeat: z.number().int().nonnegative(),
      readerSeat: z.number().int().nonnegative().nullable(),
      correct: z.boolean().nullable(),
      plenum: z.boolean(),
    }),
  ),
});
export type GameReviewLog = z.infer<typeof GameReviewLogSchema>;
type LoggedQuestion = GameReviewLog["questions"][number];

export interface GameReview {
  /** Seat index the review belongs to. */
  seat: number;
  clientId: string;
  questionId: string;
  grade: "good" | "again";
}

/** The seats graded on one logged question (see the rules above). */
export function seatsGradedOn(entry: LoggedQuestion, expert: boolean, seatCount: number): number[] {
  if (entry.correct === null) return [];
  if (expert && !entry.plenum)
    return entry.activeSeat === entry.readerSeat ? [] : [entry.activeSeat];
  return Array.from({ length: seatCount }, (_, seat) => seat).filter(
    (seat) => seat !== entry.readerSeat,
  );
}

/** The `clientId` of one game question's review (≤ 64 chars for a UUID-sized `gameId`). */
export function gameReviewClientId(gameId: string, turn: number): string {
  return `game:${gameId}:${turn}`;
}

/** Every review a finished game yields, for every seat (the caller keeps the human ones). */
export function gameReviews(log: GameReviewLog, gameId: string, seatCount: number): GameReview[] {
  const out: GameReview[] = [];
  for (const entry of log.questions) {
    for (const seat of seatsGradedOn(entry, log.config.expert, seatCount)) {
      out.push({
        seat,
        clientId: gameReviewClientId(gameId, entry.turn),
        questionId: entry.questionId,
        grade: entry.correct ? "good" : "again",
      });
    }
  }
  return out;
}
