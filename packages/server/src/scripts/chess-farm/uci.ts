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
  /** How full the hash table is, per mille. */
  readonly hashfull: number | null;
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
    hashfull: num(line, "hashfull"),
    timeMs: num(line, "time"),
    pv,
    wdl: wdl ? [Number(wdl[1]), Number(wdl[2]), Number(wdl[3])] : null,
  };
}

/** A running search's progress, for a long search's log line. */
export interface SearchProgress {
  /** The deepest exact depth so far, and when it was reached. */
  depth: number;
  depthAt: number;
  readonly startedAt: number;
  /** The latest score line, a fail-high/low guess included, and when it came. */
  latest: InfoLine | null;
  latestAt: number;
  /** Fail-high/low lines since the depth last went up: the root move keeps changing. */
  bounds: number;
  /** The root move being searched (`currmove`, after the first seconds) and its number. */
  currmove: string | null;
  currmoveNumber: number | null;
}

const hoursText = (ms: number) => `${(ms / 3_600_000).toFixed(1)} h`;

/**
 * One line on a running search: `d48 (6.1 h at it, sel 71) after 77.9 h ·
 * 2.4e+11 nodes 0.9 Mn/s · hash 100% · e2e4 +0.31 · 3 fail-high/low · root move 5
 * c2c3 · engine last spoke 4 min ago`.
 */
export function progressText(p: SearchProgress, now: number): string {
  const l = p.latest;
  const parts = [
    `d${p.depth} (${hoursText(now - p.depthAt)} at it${l?.seldepth ? `, sel ${l.seldepth}` : ""}) after ${hoursText(now - p.startedAt)}`,
  ];
  if (l?.nodes != null)
    parts.push(
      `${l.nodes.toExponential(1)} nodes${l.nps != null ? ` ${(l.nps / 1e6).toFixed(1)} Mn/s` : ""}`,
    );
  if (l?.hashfull != null) parts.push(`hash ${Math.round(l.hashfull / 10)}%`);
  if (l?.pv[0]) {
    const score = l.mate !== null ? `#${l.mate}` : l.cp !== null ? (l.cp / 100).toFixed(2) : "?";
    parts.push(
      `${l.pv[0]} ${score.startsWith("-") || score.startsWith("#") ? score : `+${score}`}`,
    );
  }
  if (p.bounds > 0) parts.push(`${p.bounds} fail-high/low`);
  if (p.currmove) parts.push(`root move ${p.currmoveNumber ?? "?"} ${p.currmove}`);
  parts.push(`engine last spoke ${Math.round((now - p.latestAt) / 60_000)} min ago`);
  return parts.join(" · ");
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

  /** The running search's progress, `null` between searches. */
  progress: SearchProgress | null = null;

  /**
   * Search `fen` with `go …`, collecting every exact score line, until
   * `bestmove`. `onInfo` sees each line (for live progress or early stops).
   * With no `timeoutMs` the search runs as long as it needs; `checkEveryMs`
   * asks the engine `isready` that often meanwhile (it answers mid-search) and
   * fails the search when it doesn't answer within two minutes.
   */
  search(
    fen: string,
    go: string,
    opts: { timeoutMs?: number; checkEveryMs?: number; onInfo?: (info: InfoLine) => void } = {
      timeoutMs: 3_600_000,
    },
  ): Promise<SearchResult> {
    const infos: InfoLine[] = [];
    const strings: string[] = [];
    let bestmove: string | null = null;
    const start = Date.now();
    this.progress = {
      depth: 0,
      depthAt: start,
      startedAt: start,
      latest: null,
      latestAt: start,
      bounds: 0,
      currmove: null,
      currmoveNumber: null,
    };
    this.send(`position fen ${fen}`);
    return new Promise<SearchResult>((resolve, reject) => {
      let asked: number | null = null;
      let onReady = () => {};
      const timers: ReturnType<typeof setTimeout>[] = [];
      const finish = (err: Error | null) => {
        for (const t of timers) clearTimeout(t);
        this.listener = null;
        this.progress = null;
        if (!err) return resolve({ infos, strings, bestmove, ms: Date.now() - start });
        // A search left running blocks the engine's next command (`ucinewgame`
        // waits for it), so every later job on this engine would time out.
        this.stop();
        reject(err);
      };
      if (opts.timeoutMs !== undefined)
        timers.push(
          setTimeout(
            () => finish(new Error(`${this.name}: timed out after go ${go}`)),
            opts.timeoutMs,
          ),
        );
      const every = opts.checkEveryMs;
      if (every !== undefined) {
        let answered = start;
        const beat = setInterval(
          () => {
            const now = Date.now();
            if (asked !== null && now - asked > 120_000)
              finish(new Error(`${this.name}: stopped answering mid-search`));
            else if (asked === null && now - answered >= every) {
              asked = now;
              this.send("isready");
            }
          },
          Math.min(every, 30_000),
        );
        timers.push(beat);
        onReady = () => {
          answered = Date.now();
        };
      }
      this.listener = (line) => {
        if (line === "readyok") {
          asked = null;
          onReady();
          return;
        }
        if (line.startsWith("bestmove")) {
          const b = line.split(/\s+/)[1];
          bestmove = b && b !== "(none)" ? b : null;
          return finish(null);
        }
        if (line.startsWith("info string ")) {
          strings.push(line.slice("info string ".length));
          return;
        }
        const p = this.progress;
        const currmove = / currmove (\S+)/.exec(line);
        if (p && currmove) {
          p.currmove = currmove[1] ?? null;
          p.currmoveNumber = num(line, "currmovenumber");
          return;
        }
        const info = parseInfo(line);
        if (!info) return;
        if (p) {
          p.latest = info;
          p.latestAt = Date.now();
          if (info.bound) p.bounds++;
          else if (info.depth > p.depth) {
            p.depth = info.depth;
            p.depthAt = p.latestAt;
            p.bounds = 0;
          }
        }
        if (!info.bound) {
          infos.push(info);
          opts.onInfo?.(info);
        }
      };
      try {
        this.send(`go ${go}`);
      } catch (err) {
        finish(err instanceof Error ? err : new Error(String(err)));
      }
    });
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
