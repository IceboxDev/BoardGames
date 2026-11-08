import { describe, expect, it } from "vitest";
import {
  EvalQueueBodySchema,
  EvalQueueResponseSchema,
  FarmClaimBodySchema,
  FarmEnqueueBodySchema,
  FarmGamesQuerySchema,
  FarmJobSchema,
  FarmPopularQuerySchema,
  FarmPopularResponseSchema,
} from "./chess-farm.ts";

const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

describe("chess farm schemas", () => {
  it("parses a claim with preferred positions and a job with its requester", () => {
    expect(
      FarmClaimBodySchema.parse({ worker: "ws21", max: 1, prefer: [AFTER_E4] }).prefer,
    ).toEqual([AFTER_E4]);
    expect(
      FarmJobSchema.parse({
        id: 1,
        fen: AFTER_E4,
        kind: "opp",
        reach: 3,
        spec: "BEST_MOVE_V2",
        attempts: 1,
        requestedBy: null,
      }).requestedBy,
    ).toBeNull();
  });

  it("rejects a preferred position that isn't a FEN", () => {
    const r = FarmClaimBodySchema.safeParse({ worker: "ws21", max: 1, prefer: ["e2e4"] });
    expect(r.error?.issues[0]?.path).toEqual(["prefer", 0]);
    const o = FarmClaimBodySchema.safeParse({ worker: "aws-1", max: 1, order: "dfs" });
    expect(o.error?.issues[0]?.path).toEqual(["order"]);
  });

  it("parses the explorer's popular moves and rejects a bad one", () => {
    const ok = FarmPopularResponseSchema.parse({ moves: [{ uci: "e7e5", games: 120 }] });
    expect(ok.moves[0]?.uci).toBe("e7e5");
    const bad = FarmPopularResponseSchema.safeParse({ moves: [{ uci: "O-O", games: 1 }] });
    expect(bad.error?.issues[0]?.path).toEqual(["moves", 0, "uci"]);
    expect(FarmPopularQuerySchema.safeParse({ fen: "x" }).success).toBe(false);
  });

  it("rejects an empty enqueue and a bad games cursor", () => {
    const empty = FarmEnqueueBodySchema.safeParse({ requestedBy: "u", items: [] });
    expect(empty.error?.issues[0]?.path).toEqual(["items"]);
    const cursor = FarmGamesQuerySchema.safeParse({ user: "u", color: "w", cursor: "x" });
    expect(cursor.error?.issues[0]?.path).toEqual(["cursor"]);
  });
});

describe("queue places", () => {
  it("takes waiting positions and answers with places, lanes and the job time", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    expect(EvalQueueBodySchema.parse({ items: [{ fen, kind: "opp" }] }).items).toHaveLength(1);
    expect(() => EvalQueueBodySchema.parse({ items: [] })).toThrow();
    expect(() => EvalQueueBodySchema.parse({ items: [{ fen, kind: "both" }] })).toThrow();
    const ok = EvalQueueResponseSchema.parse({
      places: { [fen]: { status: "queued", ahead: 12 } },
      lanes: 24,
      avgSeconds: 410,
    });
    expect(ok.places[fen]?.ahead).toBe(12);
    expect(() =>
      EvalQueueResponseSchema.parse({
        places: { [fen]: { status: "done", ahead: 0 } },
        lanes: 1,
        avgSeconds: null,
      }),
    ).toThrow();
  });
});
