/**
 * Server-side C++ search agent for 7 Wonders — what the `search` AI seat plays
 * when the `sw7` binary is present (build it with `make cli` in
 * cpp/seven-wonders); set SW7_ENABLE=0 to force random play. Calls `sw7 move`
 * (position on stdin → canonical move) asynchronously, so a search never
 * blocks the event loop, and maps the result back to a legal action; any
 * failure returns null so the seat falls back to random (see core
 * ai/agent.ts). Server-only so core stays free of subprocess dependencies.
 *
 * Env: SW7_BIN (binary path; defaults to the repo build), SW7_WEIGHTS ("-" =
 * search-only, or a blueprint from train/loop.py), SW7_ITERS, SW7_DETS. On
 * Railway, build the binary in the image and set SW7_BIN — see the C++ README.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { SevenWondersAgent } from "@boardgames/core/games/7-wonders/ai/agent";
import { matchCanon, serializePosition } from "@boardgames/core/games/7-wonders/ai/cpp-bridge";
import type { GameState, SevenWondersAction } from "@boardgames/core/games/7-wonders/types";

// Default to the in-repo build (works in dev); prod should set SW7_BIN explicitly.
const DEFAULT_BIN = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../cpp/seven-wonders/build/sw7",
);
const SW7 = process.env.SW7_BIN ?? DEFAULT_BIN;
const WEIGHTS = process.env.SW7_WEIGHTS ?? "-"; // "-" = strong search-only agent (no net)
const ITERS = process.env.SW7_ITERS ?? "1200";
const DETS = process.env.SW7_DETS ?? "4"; // determinizations early-age (fair, not perfect-info)

const execFileAsync = promisify(execFile);

/** Runs `sw7 move` with the position on stdin; resolves to its stdout. */
function runSw7(position: string): Promise<string> {
  const child = execFileAsync(SW7, ["move", WEIGHTS, ITERS, DETS], {
    timeout: 8000,
    maxBuffer: 1 << 20,
  });
  child.child.stdin?.end(position);
  return child.then(({ stdout }) => stdout);
}

async function chooseCppMove(gs: GameState, seat: number): Promise<SevenWondersAction | null> {
  try {
    const out = (await runSw7(serializePosition(gs, seat))).trim();
    const canon = out.split(/\s+/).map(Number);
    if (canon.length !== 5 || canon.some(Number.isNaN)) return null;
    return matchCanon(gs, seat, canon as [number, number, number, number, number]);
  } catch {
    return null;
  }
}

let resolved: SevenWondersAgent | null | undefined;

/**
 * The C++ agent, or `null` when the binary is missing or SW7_ENABLE=0. Checked
 * once, on the first 7 Wonders session.
 */
export function sevenWondersSearchAgent(): SevenWondersAgent | null {
  if (resolved !== undefined) return resolved;
  if (process.env.SW7_ENABLE === "0") {
    resolved = null;
  } else if (!existsSync(SW7)) {
    if (process.env.SW7_ENABLE === "1") {
      console.warn(`[7w] SW7_ENABLE=1 but no binary at ${SW7} — search seats play randomly`);
    }
    resolved = null;
  } else {
    console.log(`[7w] C++ search agent: ${SW7} (weights=${WEIGHTS}, iters=${ITERS}, dets=${DETS})`);
    resolved = chooseCppMove;
  }
  return resolved;
}
