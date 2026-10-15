/**
 * A native UCI engine (Stockfish, Lc0) as a long-lived child process: one
 * search at a time, every `info` line parsed as it arrives.
 */
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface } from "node:readline";

export interface InfoLine {
  readonly depth: number;
  readonly seldepth: number | null;
  readonly multipv: number;
  readonly cp: number | null;
  readonly mate: number | null;
  /** `lowerbound` / `upperbound` lines are fail-high/low guesses, not results. */
  readonly bound: boolean;
  readonly nodes: number | null;
  readonly nps: number | null;
  readonly timeMs: number | null;
  readonly pv: readonly string[];
  /** Win/draw/loss per mille, side to move (`UCI_ShowWDL`). */
  readonly wdl: readonly [number, number, number] | null;
}

const num = (line: string, key: string): number | null => {
  const m = new RegExp(` ${key} (-?\\d+)`).exec(line);
  return m ? Number(m[1]) : null;
};

/** One `info … score …` line, or `null` for other lines. */
export function parseInfo(line: string): InfoLine | null {
  if (!line.startsWith("info ") || !line.includes(" score ")) return null;
  const depth = num(line, "depth");
  if (depth === null) return null;
  const wdl = / wdl (\d+) (\d+) (\d+)/.exec(line);
  const pv = / pv (.+)$/.exec(line)?.[1]?.trim().split(/\s+/) ?? [];
  return {
    depth,
    seldepth: num(line, "seldepth"),
    multipv: num(line, "multipv") ?? 1,
    cp: / score cp -?\d+/.test(line) ? num(line, "score cp") : null,
    mate: / score mate -?\d+/.test(line) ? num(line, "score mate") : null,
    bound: / (lowerbound|upperbound)/.test(line),
    nodes: num(line, "nodes"),
    nps: num(line, "nps"),
    timeMs: num(line, "time"),
    pv,
    wdl: wdl ? [Number(wdl[1]), Number(wdl[2]), Number(wdl[3])] : null,
  };
}

export interface SearchResult {
  /** Every exact `info` line, in arrival order. */
  readonly infos: readonly InfoLine[];
  /** Other `info string …` lines (Lc0's VerboseMoveStats). */
  readonly strings: readonly string[];
  readonly bestmove: string | null;
  readonly ms: number;
}

export class UciEngine {
  private readonly proc: ChildProcessWithoutNullStreams;
  private listener: ((line: string) => void) | null = null;
  private exited = false;
  readonly name: string;

  constructor(
    readonly path: string,
    args: readonly string[] = [],
    private readonly log: (line: string) => void = () => {},
  ) {
    this.name = path.split("/").at(-1) ?? path;
    this.proc = spawn(path, [...args], { stdio: ["pipe", "pipe", "pipe"] });
    createInterface({ input: this.proc.stdout }).on("line", (line) => this.listener?.(line));
    createInterface({ input: this.proc.stderr }).on("line", (line) =>
      this.log(`[${this.name}] ${line}`),
    );
    this.proc.on("exit", (code) => {
      this.exited = true;
      this.log(`[${this.name}] exited (${code})`);
    });
  }

  get alive(): boolean {
    return !this.exited;
  }

  send(command: string): void {
    if (this.exited) throw new Error(`${this.name} has exited`);
    this.proc.stdin.write(`${command}\n`);
  }

  /** Send `command` and resolve on the first line `done` accepts. */
  private until(
    command: string | null,
    done: (line: string) => boolean,
    timeoutMs: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listener = null;
        reject(new Error(`${this.name}: timed out after ${command ?? "wait"}`));
      }, timeoutMs);
      this.listener = (line) => {
        if (done(line)) {
          clearTimeout(timer);
          this.listener = null;
          resolve();
        }
      };
      if (command) this.send(command);
    });
  }

  async init(options: Readonly<Record<string, string | number | boolean>>): Promise<void> {
    await this.until("uci", (l) => l === "uciok", 30_000);
    for (const [k, v] of Object.entries(options)) this.send(`setoption name ${k} value ${v}`);
    await this.ready();
  }

  ready(timeoutMs = 120_000): Promise<void> {
    return this.until("isready", (l) => l === "readyok", timeoutMs);
  }

  setOption(name: string, value: string | number | boolean): void {
    this.send(`setoption name ${name} value ${value}`);
  }

  /**
   * Search `fen` with `go …`, collecting every exact score line, until
   * `bestmove`. `onInfo` sees each line (for live progress or early stops).
   */
  search(
    fen: string,
    go: string,
    opts: { timeoutMs: number; onInfo?: (info: InfoLine) => void } = { timeoutMs: 3_600_000 },
  ): Promise<SearchResult> {
    const infos: InfoLine[] = [];
    const strings: string[] = [];
    let bestmove: string | null = null;
    const start = Date.now();
    this.send(`position fen ${fen}`);
    return this.until(
      `go ${go}`,
      (line) => {
        if (line.startsWith("bestmove")) {
          const b = line.split(/\s+/)[1];
          bestmove = b && b !== "(none)" ? b : null;
          return true;
        }
        if (line.startsWith("info string ")) {
          strings.push(line.slice("info string ".length));
          return false;
        }
        const info = parseInfo(line);
        if (info && !info.bound) {
          infos.push(info);
          opts.onInfo?.(info);
        }
        return false;
      },
      opts.timeoutMs,
    ).then(() => ({ infos, strings, bestmove, ms: Date.now() - start }));
  }

  stop(): void {
    if (!this.exited) this.send("stop");
  }

  quit(): void {
    if (this.exited) return;
    try {
      this.send("quit");
    } catch {
      // already gone
    }
    setTimeout(() => this.proc.kill("SIGKILL"), 3_000).unref();
  }
}

/**
 * The deepest exact line per MultiPV index from a search's `info` lines —
 * what the engine settled on for each of its top moves.
 */
export function finalLines(infos: readonly InfoLine[]): InfoLine[] {
  const deepest = new Map<number, InfoLine>();
  for (const info of infos) {
    if (info.pv.length === 0) continue;
    const prev = deepest.get(info.multipv);
    if (!prev || info.depth >= prev.depth) deepest.set(info.multipv, info);
  }
  // Keep only lines from the last fully completed depth of MultiPV 1.
  const top = deepest.get(1);
  return [...deepest.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, l]) => l)
    .filter((l) => !top || l.depth >= top.depth - 1);
}

/** Lc0 `VerboseMoveStats` line → per-move WDL (side to move) and visits. */
export function parseLc0MoveStat(
  text: string,
): { uci: string; visits: number; w: number; d: number; l: number } | null {
  const m =
    /^([a-h][1-8][a-h][1-8][qrbn]?)\s.*?N:\s*(\d+).*?\(WL:\s*(-?[\d.]+)\).*?\(D:\s*([\d.]+)\)/.exec(
      text,
    );
  if (!m) return null;
  const wl = Number(m[3]);
  const d = Number(m[4]);
  return {
    uci: m[1] as string,
    visits: Number(m[2]),
    w: Math.max(0, (1 - d + wl) / 2),
    d,
    l: Math.max(0, (1 - d - wl) / 2),
  };
}
