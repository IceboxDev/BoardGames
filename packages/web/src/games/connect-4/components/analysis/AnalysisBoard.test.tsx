import { evaluateColumns } from "@boardgames/core/games/connect-4/solver/analysis";
import { loadOpeningBook } from "@boardgames/core/games/connect-4/solver/book";
import type { GameRecord, MoveRecord, Seat } from "@boardgames/core/games/connect-4/types";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { type BoardGame, derive } from "../../logic/useAnalysisBoard";
import { AnalysisBoard } from "./AnalysisBoard";

// The real solver, answering inline the way the worker would (solver.worker.ts).
vi.mock("../../logic/solver-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../logic/solver-client")>();
  const { evaluateColumns, evaluatePosition, gradeGame } = await import(
    "@boardgames/core/games/connect-4/solver/analysis"
  );
  type Req = import("../../logic/solver-protocol").SolverRequest;
  type Reply = import("../../logic/solver-protocol").SolverReply;
  class InlineWorker {
    onmessage: ((e: MessageEvent<Reply>) => void) | null = null;
    onerror: (() => void) | null = null;
    postMessage(req: Req) {
      setTimeout(() => {
        const reply = (r: Reply) => this.onmessage?.({ data: r } as MessageEvent<Reply>);
        if (req.kind === "grade") {
          gradeGame(
            req.cols,
            req.rows,
            req.moves,
            req.nodeBudget,
            (grade) => reply({ id: req.id, kind: "grade", grade }),
            { from: req.from, to: req.to },
          );
          reply({ id: req.id, kind: "done" });
        } else if (req.kind === "columns") {
          evaluateColumns(req.input, req.nodeBudget, (column, verdict) =>
            reply({ id: req.id, kind: "column", column, verdict }),
          );
          reply({ id: req.id, kind: "done" });
        } else {
          const evaluation = evaluatePosition(req.input, req.nodeBudget);
          reply({ id: req.id, kind: "evaluation", evaluation, final: true });
        }
      }, 0);
    }
    terminate() {}
  }
  return {
    ...mod,
    solverClient: new mod.SolverClient(() => new InlineWorker() as unknown as Worker),
  };
});

/** Red stacks column 1 while Yellow looks elsewhere: Red's 4th disc there wins on move 7. */
function stackedGame(): GameRecord {
  const columns = [0, 1, 0, 1, 0, 2, 0];
  const heights: number[] = [];
  const moves: MoveRecord[] = columns.map((column, i) => {
    const row = heights[column] ?? 0;
    heights[column] = row + 1;
    return { type: "drop", column, row, player: (i % 2) as Seat };
  });
  return {
    firstPlayer: 0,
    moves,
    winner: 0,
    reason: "connect",
    winningCells: [0, 1, 2, 3].map((row) => ({ column: 0, row })),
  };
}

const boardGameOf = (game: GameRecord): BoardGame => ({
  cols: 6,
  rows: 5,
  firstPlayer: game.firstPlayer,
  moves: game.moves,
  endedInFour: true,
});

function renderBoard(practiceSeats: Seat[] = [1]) {
  return render(
    <AnalysisBoard
      game={stackedGame()}
      cols={6}
      rows={5}
      popOut={false}
      names={["Ann", "Bo"]}
      practiceSeats={practiceSeats}
    />,
  );
}

/** The ply on show, as the transport's slider reports it. */
const shownPly = () => screen.getByRole("slider", { name: "Move" }).getAttribute("aria-valuenow");

const moveCell = (n: number) => screen.getByRole("button", { name: new RegExp(`^Move ${n}:`) });

beforeAll(async () => {
  Element.prototype.scrollIntoView = vi.fn();
  await loadOpeningBook(6, 5);
});

describe("AnalysisBoard", () => {
  it("opens on the final position and grades every move", async () => {
    renderBoard();
    expect(shownPly()).toBe("7");
    // Yellow's 6th move left column 1 open: a blunder, with the block as best.
    expect(await screen.findByRole("button", { name: /^Move 6:.*Blunder/ })).toBeTruthy();
  });

  it("shows the position after the picked move and tells what it did", async () => {
    renderBoard();
    await screen.findByRole("button", { name: /^Move 6:.*Blunder/ });
    fireEvent.click(moveCell(6));
    expect(shownPly()).toBe("6");
    expect(moveCell(6).getAttribute("aria-current")).toBe("step");
    const inCard = within(screen.getByRole("region", { name: "Analysis of the position shown" }));
    expect(inCard.getByText("Move 6")).toBeTruthy();
    expect(inCard.getByText(/Blunder/)).toBeTruthy();
    expect(inCard.getByText(/Best: column 1\./)).toBeTruthy();
  });

  it("steps with the arrow keys", () => {
    renderBoard();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(shownPly()).toBe("6");
    fireEvent.keyDown(window, { key: "Home" });
    expect(shownPly()).toBe("0");
    expect(screen.getByText("Start position")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(shownPly()).toBe("1");
  });

  it("plays a side line from the shown position and goes back to the game", () => {
    renderBoard();
    fireEvent.click(moveCell(2));
    fireEvent.click(screen.getByRole("button", { name: "Drop in column 6" }));
    expect(screen.getByText("line +1")).toBeTruthy();
    expect(screen.getByText("from move 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to game" }));
    expect(shownPly()).toBe("2");
  });

  it("practises the viewer's mistakes: a miss, then the find", async () => {
    renderBoard([1]);
    const learn = await screen.findByRole("button", { name: /^Practise/ });
    fireEvent.click(learn);
    // Bo's first slip: move 2, which let a draw become a loss.
    const card = within(screen.getByRole("region", { name: "Analysis of the position shown" }));
    expect(card.getByText(/^Move 2: Bo played column 2 — draw → loss\./)).toBeTruthy();
    // Which columns would have held, by the solver itself.
    const { board } = derive(boardGameOf(stackedGame()), { ply: 1, line: [], practice: null });
    const columns = evaluateColumns(
      { cols: 6, rows: 5, popOut: false, board, toMove: 1 },
      5_000_000,
    );
    const holds = columns.findIndex((v) => v?.kind === "draw");
    const loses = columns.findIndex((v) => v?.kind === "loss");
    const drop = (column: number) =>
      screen.findByRole("button", { name: `Drop in column ${column + 1}` });
    // Answers wait for the position's columns to be solved.
    await waitFor(() => expect(card.queryByText(/Solving the position/)).toBeNull());
    fireEvent.click(await drop(loses));
    expect(await card.findByText(/Try again\./)).toBeTruthy();
    fireEvent.click(await drop(holds));
    expect(await card.findByText(new RegExp(`Column ${holds + 1} — the best move`))).toBeTruthy();
  });
});
