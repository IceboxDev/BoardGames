/**
 * Build an opening book: the exact score of every drop-only position up to
 * `--depth` discs (one of each mirror pair), written to `books/<board>.gen.ts`.
 *
 *   pnpm --filter @boardgames/core c4-book -- --board 7x6 --depth 10 [--jobs 12]
 *
 * Only the deepest level is searched — by the native solver
 * (`native/c4solve.c`, compiled with gcc on the fly; the JS solver when
 * there is no gcc), fanned over `--jobs` processes. Every shallower position
 * is then exact by negamax over its children's book scores, which costs
 * nothing. The deepest level is the expensive part (7×6 to 10 discs: ~809k
 * positions, a few CPU-hours), so its work is checkpointed under
 * `scratch/c4-book/<board>-d<depth>/` and an interrupted run resumes.
 *
 * Finally the book is packed as a perfect hash (see book.ts), every entry is
 * read back through the same lookup the solver uses, and a sample of the
 * deepest level is re-solved by the JS solver as a parity check.
 */

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join, resolve } from "node:path";
import { BitSolver } from "./bitboard-solver";
import {
  type BookData,
  bookLookup,
  bucketOf,
  canonicalKey,
  EMPTY_SLOT,
  encodeSlot,
  encodeWords,
  slotOf,
} from "./book";

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const board = arg("board", "6x5");
const [cols, rows] = board.split("x").map(Number);
const depth = Number(arg("depth", "8"));
const jobs = Number(arg("jobs", String(Math.max(1, availableParallelism() - 2))));
if ((rows + 1) * cols > 53) throw new Error("Book keys must fit 53 bits");

/** Positions per checkpointed chunk of the deepest level. */
const CHUNK = 1_000;
const repoRoot = resolve(import.meta.dirname, "../../../../../..");
const cacheDir = join(repoRoot, "scratch/c4-book", `${board}-d${depth}`);
const solver = new BitSolver(cols, rows, 10);
const cells = cols * rows;

const numKey = (lo: number, hi: number) => (hi >>> 0) * 0x1_0000_0000 + (lo >>> 0);

/** The loaded position's canonical key, as a pair and as a number. */
function canonical(): { lo: number; hi: number; key: number } {
  const k = solver.key();
  const [lo, hi] = canonicalKey(k.lo, k.hi, k.mirrorLo, k.mirrorHi);
  return { lo, hi, key: numKey(lo, hi) };
}

// ── 1. Every position up to `depth` discs with no four yet ─────────────────

const levels: Map<number, string>[] = Array.from({ length: depth + 1 }, () => new Map());
const walk = (moves: number[]) => {
  solver.setMoves(moves);
  const { key } = canonical();
  const level = levels[moves.length];
  if (level.has(key)) return;
  level.set(key, moves.join(""));
  if (moves.length === depth) return;
  for (let c = 0; c < cols; c++) {
    solver.setMoves(moves);
    if (!solver.canPlay(c) || solver.isWinningMove(c)) continue;
    walk([...moves, c]);
  }
};
walk([]);
for (const [d, level] of levels.entries()) console.log(`depth ${d}: ${level.size} positions`);

// ── 2. Solve the deepest level (checkpointed) ──────────────────────────────

async function solveDeepest(): Promise<Map<number, number>> {
  mkdirSync(cacheDir, { recursive: true });
  const positionsFile = join(cacheDir, "positions.txt");
  const deepest = [...levels[depth].values()];
  if (existsSync(positionsFile)) {
    const cached = readFileSync(positionsFile, "utf8").trim().split("\n");
    if (cached.length !== deepest.length) {
      throw new Error(
        `${positionsFile} has ${cached.length} positions, expected ${deepest.length}`,
      );
    }
  } else {
    writeFileSync(positionsFile, `${deepest.join("\n")}\n`);
    // Small chunks, many more than processes: hard positions cluster in the
    // enumeration order, so a few big parts would leave most cores idle.
    for (let j = 0; j * CHUNK < deepest.length; j++) {
      const part = deepest.slice(j * CHUNK, (j + 1) * CHUNK);
      writeFileSync(join(cacheDir, `part-${String(j).padStart(4, "0")}`), `${part.join("\n")}\n`);
    }
  }
  const parts = readdirSync(cacheDir)
    .filter((f) => /^part-\d+$/.test(f))
    .sort();
  const native = nativeSolver();
  // A pool of `jobs` processes drains the chunks.
  const queue = [...parts];
  let solved = 0;
  await Promise.all(
    Array.from({ length: jobs }, async () => {
      for (let part = queue.shift(); part !== undefined; part = queue.shift()) {
        await solvePart(part, native);
        solved++;
        if (solved % 25 === 0) console.log(`${solved}/${parts.length} chunks`);
      }
    }),
  );

  const scores = new Map<number, number>();
  for (const part of parts) {
    const moves = readFileSync(join(cacheDir, part), "utf8").trim().split("\n");
    const out = readFileSync(join(cacheDir, `${part}.out`), "utf8")
      .trim()
      .split("\n");
    if (out.length !== moves.length)
      throw new Error(`${part}: ${out.length}/${moves.length} solved`);
    moves.forEach((m, i) => {
      solver.setMoves([...m].map(Number));
      scores.set(canonical().key, Number(out[i]));
    });
  }
  return scores;
}

/** The compiled native solver, or null without gcc (the JS solver steps in). */
function nativeSolver(): string | null {
  const binary = join(cacheDir, "c4solve");
  if (existsSync(binary)) return binary;
  try {
    execFileSync("gcc", [
      "-O3",
      "-march=native",
      "-o",
      binary,
      join(import.meta.dirname, "native/c4solve.c"),
    ]);
    return binary;
  } catch {
    console.warn("gcc not found — solving with the JS solver (several times slower)");
    return null;
  }
}

/** Solve the lines of one part not yet in its `.out` file. */
function solvePart(part: string, native: string | null): Promise<void> {
  const inFile = join(cacheDir, part);
  const outFile = join(cacheDir, `${part}.out`);
  const lines = readFileSync(inFile, "utf8").trim().split("\n");
  const done = existsSync(outFile) ? readFileSync(outFile, "utf8").split("\n").length - 1 : 0;
  const todo = lines.slice(done);
  if (todo.length === 0) return Promise.resolve();
  if (native === null) {
    const js = new BitSolver(cols, rows, 24);
    const out = todo.map((m) => {
      js.setMoves([...m].map(Number));
      return js.solve();
    });
    writeFileSync(outFile, `${out.join("\n")}\n`, { flag: "a" });
    return Promise.resolve();
  }
  return new Promise((ok, fail) => {
    const child = spawn("nice", ["-n", "10", native, String(cols), String(rows)], {
      stdio: ["pipe", "pipe", "inherit"],
    });
    let buffered = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buffered += chunk.toString();
      const end = buffered.lastIndexOf("\n");
      if (end < 0) return;
      writeFileSync(outFile, buffered.slice(0, end + 1), { flag: "a" });
      buffered = buffered.slice(end + 1);
    });
    child.on("error", fail);
    child.on("close", (code) => (code === 0 ? ok() : fail(new Error(`${part}: exit ${code}`))));
    child.stdin.end(`${todo.join("\n")}\n`);
  });
}

// ── 3. Back up to the root ─────────────────────────────────────────────────

/** Exact scores of every level: the deepest searched, the rest by negamax over the book. */
function propagate(deepest: Map<number, number>): Map<number, number>[] {
  const scored: Map<number, number>[] = Array.from({ length: depth + 1 }, () => new Map());
  scored[depth] = deepest;
  for (let d = depth - 1; d >= 0; d--) {
    for (const [key, moveString] of levels[d]) {
      const moves = [...moveString].map(Number);
      solver.setMoves(moves);
      if (solver.canWinNext()) {
        scored[d].set(key, (cells + 1 - d) >> 1);
        continue;
      }
      let best = Number.NEGATIVE_INFINITY;
      for (let c = 0; c < cols; c++) {
        solver.setMoves(moves);
        if (!solver.canPlay(c)) continue;
        solver.playColumn(c);
        const child = scored[d + 1].get(canonical().key);
        if (child === undefined) throw new Error(`missing child ${moveString}${c}`);
        best = Math.max(best, -child);
      }
      scored[d].set(key, best);
    }
    console.log(`depth ${d}: backed up`);
  }
  return scored;
}

// ── 4. Pack as a perfect hash ──────────────────────────────────────────────

const BUCKET_SIZE = 5;
const LOAD = 0.95;
const MAX_DISPLACEMENT = 0xffff;

function pack(scored: Map<number, number>[]): BookData {
  const entries: { lo: number; hi: number; score: number }[] = [];
  for (const level of scored) {
    for (const [key, score] of level) {
      entries.push({
        lo: (key % 0x1_0000_0000) | 0,
        hi: Math.floor(key / 0x1_0000_0000) | 0,
        score,
      });
    }
  }
  const buckets = Math.ceil(entries.length / BUCKET_SIZE);
  const slots = Math.ceil(entries.length / LOAD);
  const members: number[][] = Array.from({ length: buckets }, () => []);
  entries.forEach((e, i) => {
    members[bucketOf(e.lo, e.hi, buckets)].push(i);
  });
  const order = [...members.keys()].sort((a, b) => members[b].length - members[a].length);
  const displacement = new Uint16Array(buckets);
  const table = new Uint16Array(slots).fill(EMPTY_SLOT);
  const taken = new Uint8Array(slots);
  for (const b of order) {
    const group = members[b];
    if (group.length === 0) continue;
    let placed = false;
    for (let d = 0; d <= MAX_DISPLACEMENT && !placed; d++) {
      const at = group.map((i) => slotOf(entries[i].lo, entries[i].hi, d, slots));
      if (at.some((s, k) => taken[s] || at.indexOf(s) !== k)) continue;
      at.forEach((s, k) => {
        const e = entries[group[k]];
        taken[s] = 1;
        table[s] = encodeSlot(e.lo, e.hi, e.score);
      });
      displacement[b] = d;
      placed = true;
    }
    if (!placed) throw new Error(`bucket ${b} found no displacement; lower LOAD`);
  }
  const words = new Uint16Array(buckets + slots);
  words.set(displacement, 0);
  words.set(table, buckets);
  return { format: 2, cols, rows, maxMoves: depth, buckets, slots, data: encodeWords(words) };
}

// ── 5. Check and write ─────────────────────────────────────────────────────

function verify(book: BookData, scored: Map<number, number>[]): void {
  const lookup = bookLookup(book);
  scored.forEach((level, d) => {
    for (const [key, score] of level) {
      const lo = (key % 0x1_0000_0000) | 0;
      const hi = Math.floor(key / 0x1_0000_0000) | 0;
      if (lookup(lo, hi, lo, hi, d) !== score)
        throw new Error(`book misreads ${key} at depth ${d}`);
    }
  });
  // Parity: the JS solver agrees with a sample of the searched level.
  const js = new BitSolver(cols, rows, 22);
  const sample = [...levels[depth].entries()].filter((_, i) => i % 9973 === 0).slice(0, 25);
  for (const [key, moves] of sample) {
    js.setMoves([...moves].map(Number));
    const expected = scored[depth].get(key);
    if (js.solve() !== expected) throw new Error(`JS solver disagrees on ${moves}`);
  }
  console.log(
    `verified ${scored.reduce((n, l) => n + l.size, 0)} entries, ${sample.length} re-solved`,
  );
}

const deepest = await solveDeepest();
const scored = propagate(deepest);
const book = pack(scored);
verify(book, scored);
const file = join(import.meta.dirname, "books", `${board}.gen.ts`);
mkdirSync(join(import.meta.dirname, "books"), { recursive: true });
writeFileSync(
  file,
  `// GENERATED by \`pnpm --filter @boardgames/core c4-book -- --board ${board} --depth ${depth}\` — DO NOT EDIT.
// Every ${board} position up to ${depth} discs with its exact score; see ../book.ts.
import type { BookData } from "../book";

export const BOOK: BookData = {
  format: ${book.format},
  cols: ${cols},
  rows: ${rows},
  maxMoves: ${depth},
  buckets: ${book.buckets},
  slots: ${book.slots},
  data: "${book.data}",
};
`,
);
console.log(`${file}: ${((book.data.length * 3) / 4 / 1024).toFixed(0)} KiB`);
