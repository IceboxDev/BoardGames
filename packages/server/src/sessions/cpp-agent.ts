/**
 * Server-side C++ search agent for 7 Wonders (the v1 AI). Auto-enables whenever
 * the `sw7` binary is present (build it with `make cli` in cpp/seven-wonders);
 * set SW7_ENABLE=0 to force the random stub. Calls `sw7 move` (position on stdin
 * -> canonical move) and maps the result back to a legal action; any failure
 * returns null so the machine falls back to random (see ai/agent.ts). Server-only
 * so core stays free of subprocess/native dependencies.
 *
 * Env: SW7_BIN (binary path; defaults to the repo build), SW7_WEIGHTS ("-" =
 * search-only, or a blueprint from train/loop.py), SW7_ITERS, SW7_DETS. On
 * Railway, build the binary in the image and set SW7_BIN — see the C++ README.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { setAiAgent } from "@boardgames/core/games/7-wonders/ai/agent";
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

function chooseCppMove(gs: GameState, seat: number): SevenWondersAction | null {
  try {
    const pos = serializePosition(gs, seat);
    const out = execFileSync(SW7, ["move", WEIGHTS, ITERS, DETS], {
      input: pos,
      timeout: 8000,
      maxBuffer: 1 << 20,
    })
      .toString()
      .trim();
    const canon = out.split(/\s+/).map(Number);
    if (canon.length !== 5 || canon.some(Number.isNaN)) return null;
    return matchCanon(gs, seat, canon as [number, number, number, number, number]);
  } catch {
    return null;
  }
}

/** Install the C++ agent for all 7 Wonders AI seats (auto-on when the binary exists). */
export function maybeEnableCppAgent(): void {
  if (process.env.SW7_ENABLE === "0") return; // explicit opt-out
  if (!existsSync(SW7)) {
    if (process.env.SW7_ENABLE === "1")
      console.warn(`[7w] SW7_ENABLE=1 but no binary at ${SW7} — keeping the random AI`);
    return;
  }
  setAiAgent(chooseCppMove);
  console.log(`[7w] C++ agent enabled: ${SW7} (weights=${WEIGHTS}, iters=${ITERS}, dets=${DETS})`);
}
