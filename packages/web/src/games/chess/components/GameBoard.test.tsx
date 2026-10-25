import type { ChessPlayerView } from "@boardgames/core/games/chess/schemas";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import GameBoard from "./GameBoard";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function view(moves: { uci: string; san: string; fen: string }[]): ChessPlayerView {
  return {
    fen: moves.at(-1)?.fen ?? START,
    startFen: START,
    color: "w",
    seatColors: ["w", "b"],
    aiSeats: [1],
    history: moves.map((m, i) => ({
      uci: m.uci,
      san: m.san,
      by: i % 2 === 0 ? ("w" as const) : ("b" as const),
      clockMs: null,
      captured: null,
    })),
    clock: null,
    drawOffer: null,
    takebackRequest: null,
    claimableDraw: null,
    disconnected: [],
    abandoned: [],
    aiThinking: false,
    result: null,
    timeControl: null,
  };
}

const E4 = {
  uci: "e2e4",
  san: "e4",
  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
};
const E5 = {
  uci: "e7e5",
  san: "e5",
  fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
};
const NF3 = {
  uci: "g1f3",
  san: "Nf3",
  fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
};

const board = (v: ChessPlayerView) => (
  <GameBoard
    view={v}
    color="w"
    names={{ w: "You", b: "AI" }}
    legal={[]}
    send={() => {}}
    orientation="w"
    onOrientationChange={() => {}}
  />
);

describe("GameBoard browsing", () => {
  it("shows where you are while browsing, says when a move arrives, and returns to live", () => {
    const { rerender } = render(board(view([E4, E5])));
    expect(screen.queryByText(/Back to live/)).toBeNull();

    act(() => {
      fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    });
    expect(screen.getByText(/Move 1 of 1/)).toBeTruthy();

    rerender(board(view([E4, E5, NF3])));
    expect(screen.getByText(/New move/)).toBeTruthy();

    act(() => {
      fireEvent.click(screen.getByText(/Back to live/));
    });
    expect(screen.queryByText(/Back to live/)).toBeNull();
  });
});
