// Unified dev logging for the client side of game sessions. Every game talks to
// the server through the shared WebSocket in `ws-client`, so logging there covers
// all 8 games with one consistent format. Dev-only (stripped from prod builds).
//
// Pairs with the server's `lib/game-log.ts`: read the browser console for the
// client's view (actions sent, messages received) and the server terminal for
// the authoritative view (snapshots, AI, errors).

const ENABLED = import.meta.env.DEV;

export function gameLog(event: string, data?: unknown): void {
  if (!ENABLED) return;
  const ts = new Date().toISOString().slice(11, 23);
  if (data !== undefined) console.log(`%c${ts} [game] ${event}`, "color:#7aa2f7", data);
  else console.log(`%c${ts} [game] ${event}`, "color:#7aa2f7");
}

export const gameLogEnabled = ENABLED;
