/**
 * The KataGo engine this process uses, from the environment:
 *   KATAGO_URL + KATAGO_BRIDGE_SECRET — the `katago` service (production);
 *   KATAGO_BIN + KATAGO_MODEL [+ KATAGO_HUMAN_MODEL, KATAGO_CONFIG] — a local
 *     child process (dev, ws21, and the bridge service itself);
 *   neither — no KataGo: its tiers fall back to MCTS, analysis is unavailable.
 */
import { join } from "node:path";
import { createChildEngine } from "./child-engine.ts";
import { createHttpEngine } from "./http-engine.ts";
import type { KataGoEngine } from "./protocol.ts";

/** The analysis config shipped with the repo (docker/katago/analysis.cfg). */
function defaultConfig(): string {
  return join(import.meta.dirname, "..", "..", "..", "..", "docker", "katago", "analysis.cfg");
}

let engine: KataGoEngine | null | undefined;

export function localKataGo(): KataGoEngine | null {
  const bin = process.env.KATAGO_BIN;
  const model = process.env.KATAGO_MODEL;
  if (!bin || !model) return null;
  return createChildEngine({
    bin,
    model,
    humanModel: process.env.KATAGO_HUMAN_MODEL,
    config: process.env.KATAGO_CONFIG ?? defaultConfig(),
  });
}

export function kataGoEngine(): KataGoEngine | null {
  if (engine !== undefined) return engine;
  const url = process.env.KATAGO_URL;
  const secret = process.env.KATAGO_BRIDGE_SECRET;
  if (url && secret) engine = createHttpEngine(url, secret);
  else engine = localKataGo();
  if (!engine) console.warn("[katago] not configured; KataGo tiers play MCTS, analysis is off");
  return engine;
}

/** Whether KataGo-backed features (human-style tiers, analysis) can run. */
export function kataGoConfigured(): boolean {
  return kataGoEngine() !== null;
}
