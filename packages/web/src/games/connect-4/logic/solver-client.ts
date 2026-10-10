/**
 * The page's one solver worker and what it has answered. Every board on the
 * page (the live game, a replay, the game-over analysis) shares it, so the
 * worker's tables and opening book stay warm, and its answers are cached:
 * evaluations and column outcomes by position, grades by move.
 *
 * A move's grade depends only on the game up to it, so grades are cached by
 * that prefix: the ones worked out in the background while a game is played
 * (`prefetchGame`) are the very ones its game-over analysis asks for.
 *
 * Jobs run one at a time, smallest first: one position or one move each, so
 * nothing waits long. By priority —
 *   0. what the viewer is looking at (an evaluation, a board's columns): a
 *      newer one replaces any older one still waiting (the board moved on);
 *   1. the grades of an analysis on screen;
 *   2. columns the viewer will likely want next (only the newest few wait);
 *   3. background work while a game is played.
 *
 * React reads it through `useSyncExternalStore` (useSolver.ts): entries are
 * immutable and replaced on change, so a snapshot is the entry itself.
 */

import type {
  MoveGrade,
  PositionEval,
  PositionInput,
  Verdict,
} from "@boardgames/core/games/connect-4/solver/analysis";
import type { MoveRecord } from "@boardgames/core/games/connect-4/types";
import type { SolverReply, SolverRequest } from "./solver-protocol";

/** ~4M solver nodes a second in a browser: a couple of seconds at most. */
const EVAL_NODES = 6_000_000;
const GRADE_NODES = 3_000_000;
/** Per column: seven of these is the worst case for one position. */
const COLUMN_NODES = 2_000_000;
const MAX_EVALUATIONS = 400;
const MAX_COLUMNS = 400;
/** Grades by move: a few dozen games' worth. */
const MAX_GRADES = 3_000;
const MAX_ANALYSES = 12;
/** Likely-next columns waiting at most; the oldest give way (the viewer moved on). */
const MAX_PREFETCHES = 8;

export type EvaluationState =
  | { status: "off" }
  | { status: "thinking" }
  /** `final: false` — a quick win/draw/loss answer; the exact one is still coming. */
  | { status: "ready"; evaluation: PositionEval; final: boolean }
  | { status: "error" };

export interface GameAnalysis {
  /** Grades by move index, as they arrive. */
  grades: Readonly<Record<number, MoveGrade>>;
  done: boolean;
  error: boolean;
}

/** Each column's outcome for the side to move: `undefined` until answered, null when full. */
export interface ColumnsState {
  columns: readonly (Verdict | null | undefined)[];
  done: boolean;
  error: boolean;
}

export interface GradedGame {
  cols: number;
  rows: number;
  moves: readonly MoveRecord[];
}

export const EVALUATION_OFF: EvaluationState = { status: "off" };
export const EVALUATION_THINKING: EvaluationState = { status: "thinking" };
export const NO_ANALYSIS: GameAnalysis = { grades: {}, done: false, error: false };
export const NO_COLUMNS: ColumnsState = { columns: [], done: false, error: false };

export function positionKey(input: PositionInput): string {
  const board = input.board.map((col) => col.map((v) => (v === null ? "." : v)).join("")).join("/");
  return `${input.cols}x${input.rows}:${input.popOut ? "p" : ""}:${input.toMove}:${board}`;
}

export function gameKey(game: GradedGame): string {
  return `${game.cols}x${game.rows}:${game.moves.map((m) => `${m.type[0]}${m.column}`).join("")}`;
}

/** The key of move `index`'s grade: the game up to and including it. */
function moveKey(game: GradedGame, index: number): string {
  return gameKey({ ...game, moves: game.moves.slice(0, index + 1) });
}

type Priority = 0 | 1 | 2 | 3;

type Job = { priority: Priority } & (
  | { kind: "evaluate"; key: string; input: PositionInput }
  | { kind: "columns"; key: string; input: PositionInput }
  /** One move's grade; `game` is the game up to and including it. */
  | { kind: "grade"; key: string; game: GradedGame; index: number }
);

/** A Map that forgets its oldest entries past `limit`. */
function remember<V>(map: Map<string, V>, key: string, value: V, limit: number): void {
  map.delete(key);
  map.set(key, value);
  while (map.size > limit) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

export class SolverClient {
  private worker: Worker | null = null;
  private running: (Job & { id: number }) | null = null;
  private queue: Job[] = [];
  private nextId = 1;
  private readonly evaluations = new Map<string, EvaluationState>();
  private readonly columnStates = new Map<string, ColumnsState>();
  /** Grades by move key; a failed move is `null`. */
  private readonly grades = new Map<string, MoveGrade | null>();
  /** The analyses being shown, by game key: their game and their latest snapshot. */
  private readonly analyses = new Map<string, { game: GradedGame; state: GameAnalysis }>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly spawn: () => Worker | null) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  evaluation(key: string): EvaluationState | undefined {
    return this.evaluations.get(key);
  }

  columns(key: string): ColumnsState | undefined {
    return this.columnStates.get(key);
  }

  analysis(key: string): GameAnalysis | undefined {
    return this.analyses.get(key)?.state;
  }

  /** Solve a position unless it is solved, being solved, or waiting. */
  requestEvaluation(input: PositionInput): void {
    const key = positionKey(input);
    const known = this.evaluations.get(key);
    if (known && known.status !== "error") return;
    this.dropWaiting("evaluate");
    this.enqueue({ kind: "evaluate", key, input, priority: 0 });
    this.setEvaluation(key, EVALUATION_THINKING);
    this.pump();
  }

  /** Every column's outcome for the position on screen, ahead of anything else waiting. */
  requestColumns(input: PositionInput): void {
    const key = positionKey(input);
    const queued = this.findQueued("columns", key);
    if (queued) {
      // Asked for ahead of time and still waiting: it's wanted now.
      this.dropWaiting("columns");
      this.reprioritise(queued, 0);
      return;
    }
    const known = this.columnStates.get(key);
    if (known && !known.error) return;
    this.dropWaiting("columns");
    this.enqueue({ kind: "columns", key, input, priority: 0 });
    this.setColumns(key, NO_COLUMNS);
    this.pump();
  }

  /** Column outcomes the viewer is likely to want soon, behind the analysis on screen. */
  prefetchColumns(inputs: readonly PositionInput[]): void {
    for (const input of inputs) this.queueColumns(input, 2);
    const waiting = this.queue.filter((job) => job.kind === "columns" && job.priority === 2);
    for (const stale of waiting.slice(0, Math.max(0, waiting.length - MAX_PREFETCHES))) {
      this.queue.splice(this.queue.indexOf(stale), 1);
      this.columnStates.delete(stale.key);
    }
    this.pump();
  }

  /** Grade a finished game, move by move from its end, unless it is graded or being graded. */
  requestAnalysis(game: GradedGame): void {
    const key = gameKey(game);
    const known = this.analyses.get(key);
    if (known && !known.state.error) return;
    // A failed move is tried again.
    for (let i = 0; i < game.moves.length; i++) {
      const mk = moveKey(game, i);
      if (this.grades.get(mk) === null) this.grades.delete(mk);
    }
    this.analyses.set(key, { game, state: this.assemble(game) });
    while (this.analyses.size > MAX_ANALYSES) {
      const oldest = this.analyses.keys().next().value;
      if (oldest === undefined) break;
      this.analyses.delete(oldest);
    }
    for (let i = game.moves.length - 1; i >= 0; i--) this.queueGrade(game, i, 1);
    this.emit();
    this.pump();
  }

  /**
   * While a game is played: grade its moves so far and solve each position's
   * columns in the background, so its analysis is ready when it ends. Nothing
   * is shown until asked for.
   */
  prefetchGame(game: GradedGame, positions: readonly PositionInput[]): void {
    for (let i = game.moves.length - 1; i >= 0; i--) this.queueGrade(game, i, 3);
    for (const input of positions) this.queueColumns(input, 3);
    this.pump();
  }

  private queueGrade(game: GradedGame, index: number, priority: Priority): void {
    const key = moveKey(game, index);
    if (this.grades.has(key)) return;
    const queued = this.findQueued("grade", key);
    if (queued) {
      if (queued.priority > priority) this.reprioritise(queued, priority);
      return;
    }
    if (this.running?.kind === "grade" && this.running.key === key) return;
    const prefix = { ...game, moves: game.moves.slice(0, index + 1) };
    this.enqueue({ kind: "grade", key, game: prefix, index, priority });
  }

  private queueColumns(input: PositionInput, priority: Priority): void {
    const key = positionKey(input);
    const queued = this.findQueued("columns", key);
    if (queued) {
      if (queued.priority > priority) this.reprioritise(queued, priority);
      return;
    }
    const known = this.columnStates.get(key);
    if (known && !known.error) return;
    this.enqueue({ kind: "columns", key, input, priority });
    this.setColumns(key, NO_COLUMNS);
  }

  /** Behind every job of its priority or more urgent; a viewer's request goes first of all. */
  private enqueue(job: Job): void {
    const at =
      job.priority === 0 ? 0 : this.queue.findIndex((queued) => queued.priority > job.priority);
    if (at === -1) this.queue.push(job);
    else this.queue.splice(at, 0, job);
  }

  private reprioritise(job: Job, priority: Priority): void {
    this.queue.splice(this.queue.indexOf(job), 1);
    this.enqueue({ ...job, priority });
    this.pump();
  }

  private findQueued(kind: Job["kind"], key: string): Job | undefined {
    return this.queue.find((job) => job.kind === kind && job.key === key);
  }

  /** The viewer moved on: their waiting requests of this kind would answer nobody. */
  private dropWaiting(kind: "evaluate" | "columns"): void {
    this.queue = this.queue.filter((job) => {
      if (job.kind !== kind || job.priority !== 0) return true;
      if (job.kind === "evaluate") this.evaluations.delete(job.key);
      else this.columnStates.delete(job.key);
      return false;
    });
  }

  /** An analysis's snapshot from the grades in hand. */
  private assemble(game: GradedGame): GameAnalysis {
    const grades: Record<number, MoveGrade> = {};
    let settled = 0;
    let error = false;
    for (let i = 0; i < game.moves.length; i++) {
      const grade = this.grades.get(moveKey(game, i));
      if (grade === undefined) continue;
      settled++;
      if (grade === null) error = true;
      else grades[i] = grade;
    }
    return { grades, done: settled === game.moves.length, error };
  }

  /** Move `index`'s grade landed (or failed): refresh every analysis it belongs to. */
  private settleGrade(key: string, index: number, grade: MoveGrade | null): void {
    remember(this.grades, key, grade, MAX_GRADES);
    for (const [gk, entry] of this.analyses) {
      if (index < entry.game.moves.length && moveKey(entry.game, index) === key) {
        this.analyses.set(gk, { ...entry, state: this.assemble(entry.game) });
      }
    }
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private setEvaluation(key: string, state: EvaluationState): void {
    remember(this.evaluations, key, state, MAX_EVALUATIONS);
    this.emit();
  }

  private setColumns(key: string, state: ColumnsState): void {
    remember(this.columnStates, key, state, MAX_COLUMNS);
    this.emit();
  }

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    const worker = this.spawn();
    if (!worker) return null;
    worker.onmessage = (e: MessageEvent<SolverReply>) => this.onReply(e.data);
    worker.onerror = () => this.failRunning();
    this.worker = worker;
    return worker;
  }

  private request(job: Job, id: number): SolverRequest {
    switch (job.kind) {
      case "evaluate":
        return { id, kind: "evaluate", input: job.input, nodeBudget: EVAL_NODES };
      case "columns":
        return { id, kind: "columns", input: job.input, nodeBudget: COLUMN_NODES };
      case "grade":
        return {
          id,
          kind: "grade",
          cols: job.game.cols,
          rows: job.game.rows,
          moves: [...job.game.moves],
          from: job.index,
          to: job.index + 1,
          nodeBudget: GRADE_NODES,
        };
    }
  }

  private pump(): void {
    if (this.running) return;
    const job = this.queue.shift();
    if (!job) return;
    const worker = this.ensureWorker();
    if (!worker) {
      this.fail(job);
      this.pump();
      return;
    }
    const id = this.nextId++;
    this.running = { ...job, id };
    worker.postMessage(this.request(job, id));
  }

  private onReply(reply: SolverReply): void {
    const job = this.running;
    if (!job || reply.id !== job.id) return;
    switch (reply.kind) {
      case "evaluation":
        if (job.kind !== "evaluate") return;
        this.setEvaluation(job.key, {
          status: "ready",
          evaluation: reply.evaluation,
          final: reply.final,
        });
        if (reply.final) this.finish();
        return;
      case "column": {
        if (job.kind !== "columns") return;
        const current = this.columnStates.get(job.key) ?? NO_COLUMNS;
        const columns = [...current.columns];
        columns[reply.column] = reply.verdict;
        this.setColumns(job.key, { ...current, columns });
        return;
      }
      case "grade":
        if (job.kind === "grade") this.settleGrade(job.key, job.index, reply.grade);
        return;
      case "done":
        if (job.kind === "columns") {
          this.setColumns(job.key, {
            ...(this.columnStates.get(job.key) ?? NO_COLUMNS),
            done: true,
          });
        }
        this.finish();
        return;
      case "error":
        this.fail(job);
        this.finish();
        return;
    }
  }

  private finish(): void {
    this.running = null;
    this.pump();
  }

  private fail(job: Job): void {
    switch (job.kind) {
      case "evaluate":
        this.setEvaluation(job.key, { status: "error" });
        return;
      case "columns":
        this.setColumns(job.key, {
          ...(this.columnStates.get(job.key) ?? NO_COLUMNS),
          done: true,
          error: true,
        });
        return;
      case "grade":
        this.settleGrade(job.key, job.index, null);
        return;
    }
  }

  /** The worker died: fail what it was doing and start a fresh one for the rest. */
  private failRunning(): void {
    this.worker?.terminate();
    this.worker = null;
    if (this.running) this.fail(this.running);
    this.finish();
  }
}

function spawnWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  return new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" });
}

/** The page's solver. */
export const solverClient = new SolverClient(spawnWorker);
