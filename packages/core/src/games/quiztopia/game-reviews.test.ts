import { describe, expect, it } from "vitest";
import {
  type GameReviewLog,
  GameReviewLogSchema,
  gameReviewClientId,
  gameReviews,
  seatsGradedOn,
} from "./game-reviews.ts";
import { buildReplayLog } from "./replay-log.ts";
import { answer, newGame } from "./test-helpers.ts";

type Entry = GameReviewLog["questions"][number];

function entry(over: Partial<Entry> = {}): Entry {
  return {
    turn: 1,
    questionId: "c001-s01-q0",
    activeSeat: 0,
    readerSeat: 1,
    correct: true,
    plenum: false,
    ...over,
  };
}

describe("seatsGradedOn", () => {
  it("grades nobody on a redrawn question", () => {
    expect(seatsGradedOn(entry({ correct: null }), false, 4)).toEqual([]);
  });

  it("grades the whole table except the reader in standard mode", () => {
    expect(seatsGradedOn(entry({ readerSeat: 2 }), false, 4)).toEqual([0, 1, 3]);
    expect(seatsGradedOn(entry({ readerSeat: null }), false, 3)).toEqual([0, 1, 2]);
  });

  it("grades only the active seat in expert mode", () => {
    expect(seatsGradedOn(entry({ activeSeat: 2, readerSeat: 0 }), true, 4)).toEqual([2]);
  });

  it("grades the table on an expert plenum", () => {
    expect(seatsGradedOn(entry({ plenum: true, readerSeat: 3 }), true, 4)).toEqual([0, 1, 2]);
  });
});

describe("gameReviews", () => {
  it("turns judged questions into per-seat reviews with stable ids", () => {
    const log: GameReviewLog = {
      slug: "quiztopia",
      config: { expert: false },
      questions: [
        entry({ turn: 1, questionId: "c001-s01-q0", correct: true, readerSeat: 1 }),
        entry({ turn: 2, questionId: "c002-s03-q1", correct: false, activeSeat: 1, readerSeat: 0 }),
        entry({ turn: 3, correct: null }),
      ],
    };
    expect(gameReviews(log, "g1", 2)).toEqual([
      { seat: 0, clientId: "game:g1:1", questionId: "c001-s01-q0", grade: "good" },
      { seat: 1, clientId: "game:g1:2", questionId: "c002-s03-q1", grade: "again" },
    ]);
  });

  it("keeps a session-sized id within the review id limit", () => {
    const id = gameReviewClientId("session-123e4567-e89b-12d3-a456-426614174000", 999);
    expect(id.length).toBeLessThanOrEqual(64);
  });
});

describe("GameReviewLogSchema", () => {
  it("parses the replay log the engine persists", () => {
    // The schema must keep reading what `buildReplayLog` writes: play two
    // real turns, end the game, and read the reviews back out.
    let g = answer(newGame({ playerCount: 2, expert: true }), true);
    g = answer(g, false);
    const log = GameReviewLogSchema.parse(
      buildReplayLog({ ...g, phase: "game-over", outcome: "loss-deck" }),
    );
    expect(log.config.expert).toBe(true);
    expect(log.questions.map((q) => q.correct)).toEqual([true, false]);
    const reviews = gameReviews(log, "g", 2);
    expect(reviews.map((r) => r.grade)).toEqual(["good", "again"]);
    // Expert, no plenum: one review per question, for whoever answered.
    expect(reviews.map((r) => r.seat)).toEqual(log.questions.map((q) => q.activeSeat));
  });

  it("rejects another game's log", () => {
    expect(
      GameReviewLogSchema.safeParse({ slug: "durak", config: {}, questions: [] }).success,
    ).toBe(false);
  });
});
