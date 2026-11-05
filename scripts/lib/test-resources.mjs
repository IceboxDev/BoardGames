// How many vitest workers this machine can afford right now — scheduling for
// speed, never part of a verdict (docs/testing.md): a starved run is slower,
// not red.
//
// Each worker costs memory (a whole module graph; web's carries a jsdom, the
// server's can start chess/Go engines). Measured 2026-11-05 as the peak of a
// suite's process tree at 2 workers, minus the main process: core ~250 MB,
// server ~550 MB, web ~450 MB a worker, plus ~500 MB for vitest itself. The
// numbers below round those up. A worker is never more than half the cores:
// the laptop is shared with editors, browsers and other sessions.

import { readFileSync } from "node:fs";
import { availableParallelism, freemem } from "node:os";

const WORKER_MB = { core: 350, server: 650, web: 550 };
const BASE_MB = 500;
/** Left for everything else on the machine. */
const HEADROOM_MB = 1024;

/** MemAvailable (what can be allocated without swapping), in MB. */
export function availableMb() {
  try {
    const kb = /MemAvailable:\s+(\d+) kB/.exec(readFileSync("/proc/meminfo", "utf8"))?.[1];
    if (kb) return Math.round(Number(kb) / 1024);
  } catch {
    // not Linux
  }
  return Math.round(freemem() / 1024 / 1024);
}

/** Workers for one package's suite, given what is free now. */
export function workersFor(pkg) {
  const perWorker = WORKER_MB[pkg] ?? 500;
  const byMemory = Math.floor((availableMb() - BASE_MB - HEADROOM_MB) / perWorker);
  const byCores = Math.max(1, Math.floor(availableParallelism() / 2));
  return Math.max(1, Math.min(byMemory, byCores));
}
