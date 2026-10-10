/**
 * The C solver's engine (native/c4core.h) as WebAssembly: `BitSolver`'s
 * search, about twice as fast as its own JS. The module is tiny (a few KB,
 * embedded in wasm/c4-wasm.gen.ts — regenerate with
 * `pnpm --filter @boardgames/core c4-wasm`), so it compiles synchronously,
 * once per thread, wherever a solver runs: the browser's worker, the
 * server's AI workers, the CLI. Where WebAssembly is missing or fails, the
 * solver searches in JS — same answers, just slower.
 */

import { C4_WASM_BASE64 } from "./wasm/c4-wasm.gen";

// The server compiles core against lib ES2023 without DOM, where the
// WebAssembly global has no types. Declare the slice used here (module-local:
// it shadows the DOM typings where they exist; at runtime it is the global).
declare namespace WebAssembly {
  class Module {
    constructor(bytes: Uint8Array);
  }
  class Instance {
    constructor(module: Module, imports: Record<string, Record<string, unknown>>);
    readonly exports: Record<string, unknown>;
  }
}

/** What `negamax` returns when the node budget ran out (no score is ever this big). */
const ABORTED = 1000;

/** A search engine for one board size, with its own transposition table. */
export interface SearchEngine {
  /**
   * The side to move's bound on `[alpha, beta]` for the position (the side to
   * move's discs, every disc, as 32-bit halves), searching at most `budget`
   * nodes: null when that wasn't enough.
   */
  negamax(
    pLo: number,
    pHi: number,
    maskLo: number,
    maskHi: number,
    moves: number,
    alpha: number,
    beta: number,
    budget: number,
  ): number | null;
  /** Nodes the last `negamax` searched. */
  nodes(): number;
  /** Forget everything the table learned. */
  clear(): void;
}

interface Exports {
  init(cols: number, rows: number): number;
  clear(): void;
  negamax(
    pLo: number,
    pHi: number,
    maskLo: number,
    maskHi: number,
    moves: number,
    alpha: number,
    beta: number,
    budget: number,
  ): number;
  nodes(): number;
}

let compiled: WebAssembly.Module | null | undefined;

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function module(): WebAssembly.Module | null {
  if (compiled === undefined) {
    try {
      compiled = new WebAssembly.Module(decodeBase64(C4_WASM_BASE64));
    } catch {
      compiled = null;
    }
  }
  return compiled;
}

/** A WebAssembly engine for a board, or null where WebAssembly can't run. */
export function wasmEngine(cols: number, rows: number): SearchEngine | null {
  const mod = typeof WebAssembly === "undefined" ? null : module();
  if (!mod) return null;
  let raw: Exports;
  try {
    raw = new WebAssembly.Instance(mod, {}).exports as unknown as Exports;
  } catch {
    return null;
  }
  if (!raw.init(cols, rows)) return null;
  return {
    negamax(pLo, pHi, maskLo, maskHi, moves, alpha, beta, budget) {
      const score = raw.negamax(pLo, pHi, maskLo, maskHi, moves, alpha, beta, budget);
      return score === ABORTED ? null : score;
    },
    nodes: () => raw.nodes(),
    clear: () => raw.clear(),
  };
}
