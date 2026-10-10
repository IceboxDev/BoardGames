import {
  evaluateColumns,
  evaluatePosition,
  gradeGame,
  solverSupport,
} from "@boardgames/core/games/connect-4/solver/analysis";
import { loadOpeningBook } from "@boardgames/core/games/connect-4/solver/book";
import type { SolverReply, SolverRequest } from "./solver-protocol";

// Off the main thread: the exact solver for hints, the evaluation bar and
// post-game analysis (grades, every column's outcome). Its tables stay warm between requests, and a board's
// opening book is fetched the first time that board is solved. The client
// (solver-client.ts) sends one request at a time.

/** The worker's global, typed without pulling the webworker lib into the app. */
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<SolverRequest>) => void) | null;
  postMessage: (message: SolverReply) => void;
};

async function handle(req: SolverRequest): Promise<void> {
  const { cols, rows } = req.kind === "grade" ? req : req.input;
  // Without its book a board is still solved — the opening just takes longer.
  await loadOpeningBook(cols, rows).catch(() => null);

  if (req.kind === "grade") {
    const range = { from: req.from, to: req.to };
    gradeGame(
      cols,
      rows,
      req.moves,
      req.nodeBudget,
      (grade) => {
        scope.postMessage({ id: req.id, kind: "grade", grade });
      },
      range,
    );
    scope.postMessage({ id: req.id, kind: "done" });
    return;
  }

  if (req.kind === "columns") {
    evaluateColumns(req.input, req.nodeBudget, (column, verdict) => {
      scope.postMessage({ id: req.id, kind: "column", column, verdict });
    });
    scope.postMessage({ id: req.id, kind: "done" });
    return;
  }

  const { input, nodeBudget } = req;
  const discs = input.board.reduce((n, col) => n + col.filter((v) => v !== null).length, 0);
  if (solverSupport(cols, rows, input.popOut, discs) === "ok") {
    // A quick win/draw/loss first, then the exact count.
    const quick = evaluatePosition(input, nodeBudget, null, true);
    if (quick.solved)
      scope.postMessage({ id: req.id, kind: "evaluation", evaluation: quick, final: false });
  }
  // Where the solver can't answer (PopOut, 8×7's opening) the deep search suggests a move.
  const evaluation = evaluatePosition(input, nodeBudget);
  scope.postMessage({ id: req.id, kind: "evaluation", evaluation, final: true });
}

scope.onmessage = (e) => {
  const req = e.data;
  handle(req).catch((err: unknown) => {
    scope.postMessage({
      id: req.id,
      kind: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  });
};
