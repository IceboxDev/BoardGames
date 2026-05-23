// Unified dev logging for game sessions. Every game runs through the server
// session manager, so this is the single place that sees the full lifecycle of
// all 8 games. Enabled in non-production, or explicitly via DEBUG_GAMES=1.
//
// Format: `HH:MM:SS.mmm [game:<slug>#<shortId>] <event>` so a single grep on a
// slug follows one match end-to-end and timing gaps reveal slow/blocking AI.

const ENABLED = process.env.NODE_ENV !== "production" || process.env.DEBUG_GAMES === "1";

function shortId(sessionId: string): string {
  // session ids look like `session-<ts>-<n>` — keep the trailing counter.
  const tail = sessionId.split("-").pop();
  return tail ?? sessionId;
}

export function gameLog(
  slug: string,
  sessionId: string,
  event: string,
  data?: Record<string, unknown>,
): void {
  if (!ENABLED) return;
  const ts = new Date().toISOString().slice(11, 23);
  const tag = `${ts} [game:${slug}#${shortId(sessionId)}] ${event}`;
  if (data !== undefined) console.log(tag, data);
  else console.log(tag);
}

export const gameLogEnabled = ENABLED;
