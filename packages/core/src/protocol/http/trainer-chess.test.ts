import { describe, expect, it } from "vitest";
import {
  ChessGamesQuerySchema,
  ChessUploadGamesBodySchema,
  CreateRepertoireBodySchema,
  UpdateRepertoireBodySchema,
} from "./trainer-chess.ts";

const game = {
  id: "q7ZvsdUF",
  color: "w",
  uci: "e2e4 e7e5 g1f3",
  playedAt: 1700000000000,
  speed: "blitz",
  rated: true,
  result: "win",
  opponent: "Rival",
  opponentRating: 1700,
};

describe("chess trainer protocol", () => {
  it("parses an upload", () => {
    expect(ChessUploadGamesBodySchema.parse({ games: [game] }).games).toHaveLength(1);
  });

  it("rejects a malformed game", () => {
    const bad = (patch: object, path: string) => {
      const r = ChessUploadGamesBodySchema.safeParse({ games: [{ ...game, ...patch }] });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.path.join(".")).toBe(path);
    };
    bad({ uci: "e2e4 P@e5" }, "games.0.uci");
    bad({ id: "../etc" }, "games.0.id");
    bad({ speed: "atomic" }, "games.0.speed");
    expect(ChessUploadGamesBodySchema.safeParse({ games: [] }).success).toBe(false);
  });

  it("checks page cursors", () => {
    expect(
      ChessGamesQuerySchema.parse({ color: "b", cursor: "1700000000000:q7ZvsdUF" }).cursor,
    ).toBe("1700000000000:q7ZvsdUF");
    expect(ChessGamesQuerySchema.safeParse({ color: "b", cursor: "x' OR 1" }).success).toBe(false);
  });

  it("fills tree settings with defaults and needs a version to update", () => {
    const body = CreateRepertoireBodySchema.parse({ name: " My e4 ", color: "w", settings: {} });
    expect(body.name).toBe("My e4");
    expect(body.settings).toEqual({
      handpickMoves: 3,
      engineDepth: 18,
      evalSpec: "BEST_MOVE_V1",
      speeds: [],
      minReplies: 3,
    });
    expect(UpdateRepertoireBodySchema.safeParse({ name: "x" }).success).toBe(false);
  });
});
