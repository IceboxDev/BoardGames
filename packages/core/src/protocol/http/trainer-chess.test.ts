import { describe, expect, it } from "vitest";
import {
  ChessDrillReviewBodySchema,
  ChessGamesQuerySchema,
  ChessUploadGamesBodySchema,
  CreateRepertoireBodySchema,
  LibraryResponseSchema,
  UpdateLibraryBodySchema,
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
      handpickMoves: 0,
      engineDepth: 18,
      evalSpec: "BEST_MOVE_V2",
      speeds: [],
      minReplies: 3,
    });
    expect(UpdateRepertoireBodySchema.safeParse({ name: "x" }).success).toBe(false);
  });

  it("parses a library and refuses a bad line or a missing version", () => {
    const library = {
      formatVersion: 1,
      roots: {
        w: [
          {
            kind: "folder",
            id: "sicilian",
            name: "vs Sicilian",
            children: [{ kind: "line", id: "alapin01", name: "Alapin", moves: "e2e4 c7c5 c2c3" }],
          },
        ],
        b: [],
      },
    };
    expect(LibraryResponseSchema.parse({ library, version: 3 }).version).toBe(3);
    const badLine = UpdateLibraryBodySchema.safeParse({
      expectedVersion: 0,
      library: {
        ...library,
        roots: { w: [{ kind: "line", id: "alapin01", name: "x", moves: "e2e4 Nf3" }], b: [] },
      },
    });
    expect(badLine.error?.issues[0]?.path).toEqual(["library", "roots", "w", 0, "moves"]);
    const noVersion = UpdateLibraryBodySchema.safeParse({ library });
    expect(noVersion.error?.issues[0]?.path).toEqual(["expectedVersion"]);
  });

  it("parses a drill review and refuses a bad card or grade", () => {
    const review = {
      clientId: "c-12345678",
      color: "w",
      cardId: "rnbqkbnr/ppppppp1/8/7p/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
      grade: "good",
      localDate: "2026-10-20",
      outcome: { played: "d2d4", expected: "d2d4", hinted: false },
    };
    expect(ChessDrillReviewBodySchema.parse(review).source).toBe("trainer");
    const badCard = ChessDrillReviewBodySchema.safeParse({ ...review, cardId: "not a key" });
    expect(badCard.success).toBe(false);
    if (!badCard.success) expect(badCard.error.issues[0]?.path).toEqual(["cardId"]);
    const badGrade = ChessDrillReviewBodySchema.safeParse({ ...review, grade: "perfect" });
    expect(badGrade.success).toBe(false);
    if (!badGrade.success) expect(badGrade.error.issues[0]?.path).toEqual(["grade"]);
  });
});
