/**
 * Stockfish 19 (lite, single-threaded WASM — no cross-origin isolation
 * needed) in a Web Worker, for post-game analysis in the browser. Loaded only
 * when a player asks for an analysis; both files are Vite assets.
 *
 * Stockfish.js takes the .wasm URL from its worker URL's hash.
 * GPL-3.0 — credited, with a link to the source, on the chess rules page.
 */

import engineUrl from "stockfish/bin/stockfish-19-lite-single.js?url";
import wasmUrl from "stockfish/bin/stockfish-19-lite-single.wasm?url";
import type { PositionEval, Score } from "./grade";

/** Parse one `info` line's score and pv (`null` for lines without them). */
export function parseInfo(
  line: string,
): { depth: number; score: Score; pv: string[]; multipv: number } | null {
  if (!line.startsWith("info ") || !line.includes(" score ")) return null;
  const depth = Number(/ depth (\d+)/.exec(line)?.[1] ?? "0");
  const multipv = Number(/ multipv (\d+)/.exec(line)?.[1] ?? "1");
  const cp = / score cp (-?\d+)/.exec(line);
  const mate = / score mate (-?\d+)/.exec(line);
  const pv = / pv (.+)$/.exec(line)?.[1]?.trim().split(/\s+/) ?? [];
  if (cp) return { depth, score: { cp: Number(cp[1]) }, pv, multipv };
  if (mate) return { depth, score: { mate: Number(mate[1]) }, pv, multipv };
  return null;
}

/** Flip a side-to-move score to White's point of view. */
export function whiteScore(score: Score, turn: "w" | "b"): Score {
  // `mate 0`: the side to move IS mated — a sign flip of 0 would lose that.
  if ("mate" in score && score.mate === 0) return { cp: turn === "w" ? -10_000 : 10_000 };
  if (turn === "w") return score;
  return "cp" in score ? { cp: -score.cp } : { mate: -score.mate };
}

interface Job {
  readonly fen: string;
  readonly depth: number;
  readonly multipv: number;
  readonly resolve: (lines: PositionEval[]) => void;
  readonly reject: (e: Error) => void;
}

export class BrowserEngine {
  private readonly worker: Worker;
  private readonly queue: Job[] = [];
  private current: { job: Job; lines: Map<number, PositionEval> } | null = null;
  private ready: Promise<void>;
  private onLine: (line: string) => void = () => {};

  constructor() {
    this.worker = new Worker(`${engineUrl}#${encodeURIComponent(wasmUrl)}`);
    this.worker.onmessage = (e: MessageEvent<unknown>) => {
      if (typeof e.data === "string") this.onLine(e.data);
    };
    this.ready = new Promise((resolve) => {
      this.onLine = (line) => {
        if (line.startsWith("readyok")) {
          this.onLine = (l) => this.handle(l);
          resolve();
        }
      };
    });
    this.worker.postMessage("uci");
    this.worker.postMessage("setoption name Hash value 32");
    this.worker.postMessage("isready");
  }

  private handle(line: string): void {
    const cur = this.current;
    if (!cur) return;
    const turn = cur.job.fen.split(" ")[1] === "b" ? "b" : "w";
    const info = parseInfo(line);
    if (info) {
      cur.lines.set(info.multipv, {
        score: whiteScore(info.score, turn),
        best: info.pv[0] ?? null,
        pv: info.pv,
        depth: info.depth,
      });
      return;
    }
    if (line.startsWith("bestmove")) {
      const best = line.split(/\s+/)[1];
      const lines = [...cur.lines.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
      // A finished game (mate/stalemate) has no bestmove and no score lines.
      const first = lines[0];
      if (first && best && best !== "(none)") lines[0] = { ...first, best };
      this.current = null;
      cur.job.resolve(lines);
      this.pump();
    }
  }

  private pump(): void {
    if (this.current) return;
    const job = this.queue.shift();
    if (!job) return;
    this.current = { job, lines: new Map() };
    this.worker.postMessage(`setoption name MultiPV value ${job.multipv}`);
    this.worker.postMessage(`position fen ${job.fen}`);
    this.worker.postMessage(`go depth ${job.depth}`);
  }

  /** The engine's top `multipv` lines for `fen`, White's point of view. */
  async analyse(fen: string, depth: number, multipv = 1): Promise<PositionEval[]> {
    await this.ready;
    return new Promise((resolve, reject) => {
      this.queue.push({ fen, depth, multipv, resolve, reject });
      this.pump();
    });
  }

  terminate(): void {
    for (const job of this.queue.splice(0)) job.reject(new Error("engine stopped"));
    this.current?.job.reject(new Error("engine stopped"));
    this.current = null;
    this.worker.terminate();
  }
}
