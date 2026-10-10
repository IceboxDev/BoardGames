import type { PositionInput } from "@boardgames/core/games/connect-4/solver/analysis";
import type { Seat } from "@boardgames/core/games/connect-4/types";
import { describe, expect, it } from "vitest";
import { gameKey, positionKey, SolverClient } from "./solver-client";
import type { SolverReply, SolverRequest } from "./solver-protocol";

/** A worker the test answers by hand. */
class FakeWorker {
  sent: SolverRequest[] = [];
  onmessage: ((e: MessageEvent<SolverReply>) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  postMessage(request: SolverRequest) {
    this.sent.push(request);
  }
  reply(reply: SolverReply) {
    this.onmessage?.({ data: reply } as MessageEvent<SolverReply>);
  }
  terminate() {
    this.terminated = true;
  }
}

function harness() {
  const workers: FakeWorker[] = [];
  const client = new SolverClient(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w as unknown as Worker;
  });
  return { client, workers };
}

const position = (column: number, toMove: Seat = 0): PositionInput => {
  const board = Array.from({ length: 7 }, () => Array<Seat | null>(6).fill(null));
  board[column][0] = 1;
  return { cols: 7, rows: 6, popOut: false, board, toMove };
};

const solved = { solved: true as const, verdict: { kind: "draw" as const }, exact: true, best: [] };

/** A drop-only game of `n` moves, Red first. */
const drops = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    type: "drop" as const,
    column: i % 7,
    row: Math.floor(i / 7),
    player: (i % 2) as Seat,
  }));

const gradeOf = (index: number) => ({
  index,
  player: (index % 2) as Seat,
  column: index % 7,
  grade: "best" as const,
  before: { kind: "draw" as const },
  after: { kind: "draw" as const },
  bestColumns: [index % 7],
});

describe("SolverClient", () => {
  it("answers a position once, quick answer first, and caches it", () => {
    const { client, workers } = harness();
    const input = position(3);
    client.requestEvaluation(input);
    expect(client.evaluation(positionKey(input))).toEqual({ status: "thinking" });
    const [worker] = workers;
    const { id } = worker.sent[0];
    worker.reply({ id, kind: "evaluation", evaluation: solved, final: false });
    expect(client.evaluation(positionKey(input))).toMatchObject({ status: "ready", final: false });
    worker.reply({ id, kind: "evaluation", evaluation: solved, final: true });
    expect(client.evaluation(positionKey(input))).toMatchObject({ status: "ready", final: true });
    client.requestEvaluation(input);
    expect(worker.sent).toHaveLength(1); // cached
  });

  it("runs one job at a time, and drops positions the board has moved past", () => {
    const { client, workers } = harness();
    client.requestEvaluation(position(0));
    client.requestEvaluation(position(1)); // waits…
    client.requestEvaluation(position(2)); // …and replaces it
    const [worker] = workers;
    expect(worker.sent).toHaveLength(1);
    expect(client.evaluation(positionKey(position(1)))).toBeUndefined();
    worker.reply({ id: worker.sent[0].id, kind: "evaluation", evaluation: solved, final: true });
    expect(worker.sent).toHaveLength(2);
    expect(worker.sent[1]).toMatchObject({ kind: "evaluate", input: position(2) });
  });

  it("collects a game's grades and keeps them for when it's shown again", () => {
    const { client, workers } = harness();
    const game = {
      cols: 7,
      rows: 6,
      moves: [{ type: "drop" as const, column: 3, row: 0, player: 0 as Seat }],
    };
    client.requestAnalysis(game);
    const [worker] = workers;
    const { id } = worker.sent[0];
    expect(worker.sent[0]).toMatchObject({ kind: "grade", from: 0, to: 1 });
    const grade = {
      index: 0,
      player: 0 as Seat,
      column: 3,
      grade: "best" as const,
      before: { kind: "win" as const, discs: 18 },
      after: { kind: "win" as const, discs: 18 },
      bestColumns: [3],
    };
    worker.reply({ id, kind: "grade", grade });
    worker.reply({ id, kind: "done" });
    client.requestAnalysis(game);
    expect(worker.sent).toHaveLength(1);
  });

  it("grades a game move by move from its end, letting the viewer's questions in between", () => {
    const { client, workers } = harness();
    const moves = drops(4);
    client.requestAnalysis({ cols: 7, rows: 6, moves });
    const [worker] = workers;
    expect(worker.sent[0]).toMatchObject({ kind: "grade", from: 3, to: 4 });
    expect((worker.sent[0] as { moves: unknown[] }).moves).toHaveLength(4);
    client.requestColumns(position(3));
    worker.reply({ id: worker.sent[0].id, kind: "grade", grade: gradeOf(3) });
    worker.reply({ id: worker.sent[0].id, kind: "done" });
    // The columns cut in ahead of the next move.
    expect(worker.sent[1]).toMatchObject({ kind: "columns", input: position(3) });
    worker.reply({ id: worker.sent[1].id, kind: "column", column: 3, verdict: { kind: "draw" } });
    expect(client.columns(positionKey(position(3)))?.columns[3]).toEqual({ kind: "draw" });
    worker.reply({ id: worker.sent[1].id, kind: "done" });
    expect(client.columns(positionKey(position(3)))?.done).toBe(true);
    for (const [n, index] of [2, 1, 0].entries()) {
      const sent = worker.sent[2 + n];
      expect(sent).toMatchObject({ kind: "grade", from: index, to: index + 1 });
      expect(client.analysis(gameKey({ cols: 7, rows: 6, moves }))?.done).toBe(false);
      worker.reply({ id: sent.id, kind: "grade", grade: gradeOf(index) });
      worker.reply({ id: sent.id, kind: "done" });
    }
    const analysis = client.analysis(gameKey({ cols: 7, rows: 6, moves }));
    expect(analysis?.done).toBe(true);
    expect(Object.keys(analysis?.grades ?? {})).toHaveLength(4);
  });

  it("grades a game in the background as it is played, ready when it ends", () => {
    const { client, workers } = harness();
    const game = { cols: 7, rows: 6, moves: drops(2) };
    client.prefetchGame(game, [position(0)]);
    const [worker] = workers;
    // Background work waits behind anything the viewer asks for.
    client.requestEvaluation(position(5));
    const answer = (n: number) => {
      const sent = worker.sent[n];
      if (sent.kind === "grade")
        worker.reply({ id: sent.id, kind: "grade", grade: gradeOf(sent.from) });
      if (sent.kind === "evaluate")
        worker.reply({ id: sent.id, kind: "evaluation", evaluation: solved, final: true });
      else worker.reply({ id: sent.id, kind: "done" });
    };
    answer(0); // the first background move, already running
    expect(worker.sent[1]).toMatchObject({ kind: "evaluate" });
    for (let n = 1; n < 4; n++) answer(n);
    expect(worker.sent).toHaveLength(4); // 2 grades, 1 position's columns, 1 evaluation
    // The game goes on; the same moves aren't graded twice.
    const longer = { ...game, moves: drops(3) };
    client.prefetchGame(longer, []);
    expect(worker.sent[4]).toMatchObject({ kind: "grade", from: 2, to: 3 });
    answer(4);
    // At the end, the analysis is complete without asking the worker again.
    client.requestAnalysis(longer);
    expect(client.analysis(gameKey(longer))).toMatchObject({ done: true, error: false });
    expect(worker.sent).toHaveLength(5);
  });

  it("brings background moves forward when their analysis is wanted", () => {
    const { client, workers } = harness();
    client.requestEvaluation(position(0)); // keeps the worker busy
    client.prefetchColumns([position(6)]);
    const game = { cols: 7, rows: 6, moves: drops(1) };
    client.prefetchGame(game, []);
    client.requestAnalysis(game); // now on screen: ahead of the prefetched columns
    const [worker] = workers;
    worker.reply({ id: worker.sent[0].id, kind: "evaluation", evaluation: solved, final: true });
    expect(worker.sent[1]).toMatchObject({ kind: "grade", from: 0 });
  });

  it("drops columns the viewer moved past, but keeps prefetched ones", () => {
    const { client, workers } = harness();
    client.requestEvaluation(position(0)); // keeps the worker busy
    client.prefetchColumns([position(6)]);
    client.requestColumns(position(1));
    client.requestColumns(position(2)); // replaces 1
    expect(client.columns(positionKey(position(1)))).toBeUndefined();
    const [worker] = workers;
    worker.reply({ id: worker.sent[0].id, kind: "evaluation", evaluation: solved, final: true });
    expect(worker.sent[1]).toMatchObject({ kind: "columns", input: position(2) });
    worker.reply({ id: worker.sent[1].id, kind: "done" });
    expect(worker.sent[2]).toMatchObject({ kind: "columns", input: position(6) });
  });

  it("keeps only the newest prefetches waiting", () => {
    const { client, workers } = harness();
    client.requestEvaluation(position(0)); // keeps the worker busy
    for (let i = 0; i < 12; i++) client.prefetchColumns([position(i % 7, (i % 2) as Seat)]);
    // 7 distinct columns × 2 colours: 12 different positions, the first 4 dropped.
    expect(client.columns(positionKey(position(0, 0)))).toBeUndefined();
    expect(client.columns(positionKey(position(4, 0)))).toBeDefined();
    expect(workers[0].sent).toHaveLength(1);
  });

  it("fails what a crashed worker was doing and starts a fresh one", () => {
    const { client, workers } = harness();
    client.requestEvaluation(position(0));
    client.requestEvaluation(position(5, 1));
    workers[0].onerror?.();
    expect(workers[0].terminated).toBe(true);
    expect(client.evaluation(positionKey(position(0)))).toEqual({ status: "error" });
    expect(workers[1].sent[0]).toMatchObject({ input: position(5, 1) });
  });

  it("reports an error where workers can't run", () => {
    const client = new SolverClient(() => null);
    client.requestEvaluation(position(0));
    expect(client.evaluation(positionKey(position(0)))).toEqual({ status: "error" });
  });
});
