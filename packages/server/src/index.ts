// MUST be the very first import — populates process.env before anything else
// (including auth.ts) evaluates. See env.ts for the full reasoning.
import "./env.ts";

// Railway watch paths live in railway.json (server + core + lockfiles) —
// core-only protocol changes must rebuild this server too. Note: an empty
// commit does NOT re-trigger Railway (no watched file changes) — touch a
// watched file to force a rebuild.

import { serve } from "@hono/node-server";
import { initDb } from "./db.ts";
import { markStaleProcessingCampaigns } from "./lib/dnd-campaigns-db.ts";
import { markStaleProcessingCharacters } from "./lib/dnd-characters-db.ts";
import { installProcessGuards } from "./lib/process-guards.ts";
import { triggerSkillRecompute } from "./lib/skill-ratings.ts";
import { app, injectWebSocket } from "./server.ts";
import { markStaleRunning } from "./tournament/manager.ts";

import "./sessions/machine-registry.ts";
import { maybeEnableCppAgent } from "./sessions/cpp-agent.ts";
import { maybeEnableDecryptoAgent } from "./sessions/decrypto-agent.ts";
import { shutdownAllSessions } from "./sessions/manager.ts";

maybeEnableCppAgent(); // opt-in via SW7_ENABLE=1; otherwise the random stub stays
maybeEnableDecryptoAgent(); // needs OPENAI_API_KEY; otherwise the deterministic fallback stays

const PORT = Number(process.env.PORT ?? 3001);
const SHUTDOWN_GRACE_MS = 10_000;

// Boot failures must be loud and non-zero. A top-level `await` that rejects
// produces an unhandled rejection whose exit code and message depend on Node's
// defaults — not something a healthcheck can reason about.
try {
  await initDb();
  await markStaleRunning();
  await markStaleProcessingCampaigns();
  await markStaleProcessingCharacters();
  // Skill ratings self-heal at boot: a deploy that changed the engine config,
  // catalog weights, or slipped past a mutation trigger recomputes here, so
  // profile hex charts are fresh without waiting for a skills-route hit.
  triggerSkillRecompute();
} catch (err) {
  console.error("[boot] initialisation failed — refusing to start:", err);
  process.exit(1);
}

// Production (Railway) requires IPv6 wildcard `::` so the IPv6-first internal
// network can reach the container. In dev, Vite's proxy connects to
// 127.0.0.1, so bind to the IPv4 wildcard to accept that. (Linux *should*
// dual-stack `::` for IPv4 too, but some systems/Node configs end up
// IPv6-only — be explicit instead of relying on it.)
const HOSTNAME = process.env.NODE_ENV === "production" ? "::" : "0.0.0.0";
const server = serve({ fetch: app.fetch, port: PORT, hostname: HOSTNAME }, (info) => {
  console.log(
    `@boardgames/server listening on port ${info.port} (${info.address}, ${info.family})`,
  );
});

injectWebSocket(server);

// ---------------------------------------------------------------------------
// Shutdown
// ---------------------------------------------------------------------------

let shuttingDown = false;

/**
 * Drain and exit.
 *
 * Railway sends SIGTERM on every redeploy. Live games are actors in process
 * memory and are never snapshotted, so they cannot survive — but they can at
 * least END VISIBLY. Without this the socket just goes dark and the board
 * freezes with no explanation.
 */
function shutdown(reason: string, code: number): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${reason}`);

  const drained = shutdownAllSessions("The server is restarting — this game has ended.");
  if (drained > 0) console.log(`[shutdown] ended ${drained} live session(s)`);

  server.close(() => process.exit(code));
  // Never let a hung socket hold the deploy open past the grace period.
  setTimeout(() => process.exit(code), SHUTDOWN_GRACE_MS).unref();
}

installProcessGuards({
  onFatal: (reason) => shutdown(reason, 1),
});

process.on("SIGTERM", () => shutdown("received SIGTERM", 0));
process.on("SIGINT", () => shutdown("received SIGINT", 0));
