import { describe, expect, it } from "vitest";
import { fromLichessJson, ImportedGameSchema } from "./imported-game";
import { legalPrefix } from "./position-index";

const base = {
  id: "q7ZvsdUF",
  rated: true,
  variant: "standard",
  speed: "blitz",
  perf: "blitz",
  createdAt: 1700000000000,
  lastMoveAt: 1700000300000,
  status: "mate",
  players: {
    white: { user: { name: "Trainee", id: "trainee" }, rating: 1650 },
    black: { user: { name: "Rival", id: "rival" }, rating: 1700 },
  },
  winner: "white",
  moves: "e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#",
};

describe("fromLichessJson", () => {
  it("reads a game as UCI from the account's side", () => {
    const r = fromLichessJson(base, "Trainee");
    if (!("game" in r)) throw new Error("skipped");
    expect(r.game).toEqual({
      id: "q7ZvsdUF",
      color: "w",
      uci: "e2e4 e7e5 f1c4 b8c6 d1h5 g8f6 h5f7",
      playedAt: 1700000000000,
      speed: "blitz",
      rated: true,
      result: "win",
      opponent: "Rival",
      opponentRating: 1700,
    });
    expect(ImportedGameSchema.parse(r.game)).toEqual(r.game);
    expect(fromLichessJson(base, "rival")).toMatchObject({ game: { color: "b", result: "loss" } });
  });

  it("skips what doesn't belong in an opening tree", () => {
    expect(fromLichessJson({ ...base, variant: "chess960" }, "trainee")).toEqual({
      skipped: "variant",
    });
    expect(
      fromLichessJson(
        { ...base, variant: "standard", initialFen: "8/8/8/8/8/8/8/K1k5 w - - 0 1" },
        "trainee",
      ),
    ).toEqual({ skipped: "position" });
    expect(fromLichessJson({ ...base, moves: "", status: "aborted" }, "trainee")).toEqual({
      skipped: "no-moves",
    });
    expect(fromLichessJson(base, "someone")).toEqual({ skipped: "not-mine" });
    expect(fromLichessJson({ nonsense: true }, "trainee")).toEqual({ skipped: "unreadable" });
  });

  it("names a computer opponent and scores draws", () => {
    const r = fromLichessJson(
      {
        ...base,
        status: "draw",
        winner: undefined,
        players: { white: { aiLevel: 4 }, black: base.players.white },
      },
      "trainee",
    );
    expect(r).toMatchObject({
      game: { color: "b", result: "draw", opponent: "Stockfish level 4" },
    });
  });
});

describe("legalPrefix", () => {
  it("keeps the legal start of a stored line", () => {
    expect(legalPrefix("e2e4 e7e5 e1e3 g8f6")).toEqual(["e2e4", "e7e5"]);
  });
});
