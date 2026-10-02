// ---------------------------------------------------------------------------
// The C++ search (cpp/the-hunger) called from TS through WebAssembly.
//
// The state crosses as canonical text (canon.ts ↔ canon.cpp + canon_parse.cpp),
// the C++ side enumerates the legal actions itself — in the SAME order as
// rules.ts — and returns an index into that list, so no action ever has to be
// serialized. The caller's legal list length is checked against the count the
// C++ side saw.
//
// The module is embedded as base64 (wasm/hunger-wasm.gen.ts, regenerate with
// `pnpm build-hunger-wasm`) and instantiated synchronously, once per thread,
// on first use: each worker_thread / forked process gets its own instance.
// A trap (a C++ abort) throws here and drops the instance; the next call
// starts a fresh one.
// ---------------------------------------------------------------------------

import type { Action, GameState } from "../types";
import { canonicalState } from "./canon";
import { HUNGER_WASM_BASE64 } from "./wasm/hunger-wasm.gen";

// The server compiles core against lib ES2023 without DOM, where the
// WebAssembly global has no types. Declare the slice used here (module-local:
// it shadows the DOM typings where they exist; at runtime it is Node's global).
declare namespace WebAssembly {
  class Module {
    constructor(bytes: Uint8Array);
  }
  class Instance {
    constructor(module: Module, imports: Record<string, Record<string, unknown>>);
    readonly exports: Exports;
  }
  class Memory {
    readonly buffer: ArrayBuffer;
  }
  class RuntimeError extends Error {}
  type Exports = Record<string, unknown>;
}

export type WasmStrategy = "heuristic" | "strigoi" | "dracula";

const STRATEGY_CODE: Record<WasmStrategy, number> = { heuristic: 0, strigoi: 1, dracula: 2 };

/** Positional layout of the config array per strategy (wasm/agent.cpp). Append only. */
export const STRIGOI_CONFIG_FIELDS = ["rollouts", "minPerArm"] as const;
export const DRACULA_CONFIG_FIELDS = [
  "rollouts",
  "minPerArm",
  "timeMs",
  "tierMargin",
  "turnPlans",
  "maxPlans",
  "survival",
  "rivals",
  "goals",
  "followPlan",
  "execBias",
  "goalArms",
  ...Array.from({ length: 14 }, (_, k) => `exec${k}` as const),
] as const;

/**
 * A config object as the positional array `wasmPick` takes; a missing field
 * becomes NaN, which the C++ side reads as "keep the default".
 */
export function configArray(
  fields: readonly string[],
  cfg: Readonly<Record<string, number | boolean | undefined>>,
): number[] {
  return fields.map((f) => {
    const v = cfg[f];
    return v === undefined ? Number.NaN : Number(v);
  });
}

const ABI_VERSION = 2;
const HG_ERRORS: Record<number, string> = {
  [-1]: "parse",
  [-2]: "seat",
  [-3]: "no-legal",
  [-4]: "strategy",
  [-5]: "bad-pick",
};

interface HungerExports {
  memory: WebAssembly.Memory;
  _initialize: () => void;
  hg_alloc: (n: number) => number;
  hg_free: (p: number) => void;
  hg_abi_version: () => number;
  hg_legal_count: () => number;
  hg_error_ptr: () => number;
  hg_error_len: () => number;
  hg_pick: (
    text: number,
    len: number,
    seat: number,
    strategy: number,
    cfg: number,
    cfgLen: number,
  ) => number;
  hg_canon: (text: number, len: number) => number;
  hg_playouts: (text: number, len: number, n: number) => number;
}

const EXPORT_NAMES = [
  "_initialize",
  "hg_alloc",
  "hg_free",
  "hg_abi_version",
  "hg_legal_count",
  "hg_error_ptr",
  "hg_error_len",
  "hg_pick",
  "hg_canon",
  "hg_playouts",
] as const;

let compiled: WebAssembly.Module | null = null;
let live: { ex: HungerExports; stderr: string[] } | null = null;
let unavailable: unknown = null;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function asExports(raw: WebAssembly.Exports): HungerExports {
  if (!(raw.memory instanceof WebAssembly.Memory)) throw new Error("hunger wasm: no memory export");
  for (const name of EXPORT_NAMES) {
    if (typeof raw[name] !== "function") throw new Error(`hunger wasm: missing export ${name}`);
  }
  return raw as unknown as HungerExports;
}

/** The WASI calls the module imports (see `make wasm`); all others are absent. */
function wasiShim(getMemory: () => WebAssembly.Memory, stderr: string[]) {
  const ERRNO_SUCCESS = 0;
  const ERRNO_BADF = 8;
  const ERRNO_SPIPE = 70;
  return {
    clock_time_get(id: number, _precision: bigint, out: number): number {
      const view = new DataView(getMemory().buffer);
      // 0 = realtime; anything else (monotonic, cputime) from the high-res clock.
      const ns =
        id === 0
          ? BigInt(Date.now()) * 1_000_000n
          : BigInt(Math.round(performance.now() * 1_000_000));
      view.setBigUint64(out, ns, true);
      return ERRNO_SUCCESS;
    },
    fd_write(fd: number, iovs: number, iovsLen: number, nwritten: number): number {
      const mem = getMemory();
      const view = new DataView(mem.buffer);
      let total = 0;
      for (let i = 0; i < iovsLen; i++) {
        const ptr = view.getUint32(iovs + i * 8, true);
        const len = view.getUint32(iovs + i * 8 + 4, true);
        // stdout/stderr: kept (bounded) for the error message after a trap.
        if ((fd === 1 || fd === 2) && stderr.length < 64) {
          stderr.push(decoder.decode(new Uint8Array(mem.buffer, ptr, len)));
        }
        total += len;
      }
      view.setUint32(nwritten, total, true);
      return fd === 1 || fd === 2 ? ERRNO_SUCCESS : ERRNO_BADF;
    },
    fd_seek(): number {
      return ERRNO_SPIPE;
    },
    fd_close(): number {
      return ERRNO_SUCCESS;
    },
    proc_exit(code: number): never {
      throw new Error(`hunger wasm: proc_exit(${code})`);
    },
  };
}

function instance(): { ex: HungerExports; stderr: string[] } {
  if (live) return live;
  if (!compiled) compiled = new WebAssembly.Module(decodeBase64(HUNGER_WASM_BASE64));
  const stderr: string[] = [];
  let memory: WebAssembly.Memory | null = null;
  const getMemory = () => {
    if (!memory) throw new Error("hunger wasm: memory used before instantiation");
    return memory;
  };
  const inst = new WebAssembly.Instance(compiled, {
    wasi_snapshot_preview1: wasiShim(getMemory, stderr),
  });
  const ex = asExports(inst.exports);
  memory = ex.memory;
  ex._initialize();
  if (ex.hg_abi_version() !== ABI_VERSION) {
    throw new Error(`hunger wasm: ABI ${ex.hg_abi_version()}, expected ${ABI_VERSION}`);
  }
  live = { ex, stderr };
  return live;
}

/** True when the module instantiates on this thread (false: use the TS AI). */
export function wasmAvailable(): boolean {
  if (live) return true;
  if (unavailable) return false;
  try {
    instance();
    return true;
  } catch (err) {
    unavailable = err;
    return false;
  }
}

/** Run `fn` on the instance; a trap drops the instance and throws with its stderr. */
function call<T>(fn: (ex: HungerExports) => T): T {
  const cur = instance();
  cur.stderr.length = 0;
  try {
    return fn(cur.ex);
  } catch (err) {
    if (err instanceof WebAssembly.RuntimeError) {
      live = null;
      const msg = cur.stderr.join("").trim();
      const wrapped = new Error(`hunger wasm trapped: ${err.message}${msg ? ` (${msg})` : ""}`);
      Object.assign(wrapped, { cause: err });
      throw wrapped;
    }
    throw err;
  }
}

function withText<T>(ex: HungerExports, text: string, fn: (p: number, len: number) => T): T {
  const bytes = encoder.encode(text);
  const p = ex.hg_alloc(bytes.length);
  try {
    new Uint8Array(ex.memory.buffer, p, bytes.length).set(bytes);
    return fn(p, bytes.length);
  } finally {
    ex.hg_free(p);
  }
}

/** The module's text buffer: the error after a failed call, or hg_canon's output. */
function lastText(ex: HungerExports): string {
  return decoder.decode(new Uint8Array(ex.memory.buffer, ex.hg_error_ptr(), ex.hg_error_len()));
}

/**
 * The C++ AI's choice for `seat` among `legal` (= getLegalActions(state, seat)).
 * `config` is positional — build it with `configArray(STRIGOI_CONFIG_FIELDS, …)`
 * or `configArray(DRACULA_CONFIG_FIELDS, …)`; Nosferatu takes none.
 */
export function wasmPick(
  state: GameState,
  seat: number,
  legal: readonly Action[],
  strategy: WasmStrategy,
  config: readonly number[] = [],
): Action {
  const text = canonicalState(state);
  const { index, count } = call((ex) =>
    withText(ex, text, (p, len) => {
      const cfg = ex.hg_alloc(8 * Math.max(1, config.length));
      try {
        new Float64Array(ex.memory.buffer, cfg, config.length).set(config);
        const index = ex.hg_pick(p, len, seat, STRATEGY_CODE[strategy], cfg, config.length);
        if (index < 0) {
          throw new Error(`hunger wasm: ${HG_ERRORS[index] ?? index}: ${lastText(ex)}`);
        }
        return { index, count: ex.hg_legal_count() };
      } finally {
        ex.hg_free(cfg);
      }
    }),
  );
  if (count !== legal.length) {
    throw new Error(`hunger wasm: C++ saw ${count} legal actions, TS has ${legal.length}`);
  }
  return legal[index];
}

/** Parse + re-serialize canonical text in C++ (tests: the bridge's round trip). */
export function wasmCanonicalRoundTrip(text: string): string {
  return call((ex) =>
    withText(ex, text, (p, len) => {
      const n = ex.hg_canon(p, len);
      if (n < 0) throw new Error(`hunger wasm: parse: ${lastText(ex)}`);
      return lastText(ex);
    }),
  );
}

/** Benches: `n` C++ Nosferatu playouts from `state`; the sum of the final scores. */
export function wasmPlayouts(state: GameState, n: number): number {
  return call((ex) =>
    withText(ex, canonicalState(state), (p, len) => {
      const sum = ex.hg_playouts(p, len, n);
      if (sum < 0) throw new Error(`hunger wasm: parse: ${lastText(ex)}`);
      return sum;
    }),
  );
}
