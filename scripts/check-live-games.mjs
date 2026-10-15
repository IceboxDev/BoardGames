#!/usr/bin/env node
// Pre-push guard: a push to master deploys, and a deploy ends every live room
// game (live sessions are process memory — see sessions/manager.ts). A Blood
// on the Clocktower game runs for hours, so refuse to push while one is live
// on production. Other games only get a warning.
//
//   ALLOW_LIVE_DEPLOY=1 git push     # push anyway
//   HEALTH_URL=http://localhost:3001/api/health node scripts/check-live-games.mjs
//
// A health check that can't be reached never blocks a push (offline, Railway
// down): the guard is a courtesy, not a gate on the deploy pipeline.

const HEALTH_URL =
  process.env.HEALTH_URL ?? "https://boardgamesserver-production.up.railway.app/api/health";
/** Games long enough that ending one mid-way is a real loss. */
const BLOCKING = new Set(["blood-on-the-clocktower"]);

async function main() {
  if (process.env.ALLOW_LIVE_DEPLOY === "1") return 0;
  let body;
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(4000) });
    body = await res.json();
  } catch (err) {
    console.warn(`[live-games] couldn't read ${HEALTH_URL} (${err.message}) — not blocking.`);
    return 0;
  }
  const live = Array.isArray(body?.liveGames) ? body.liveGames : [];
  if (live.length === 0) return 0;

  const lines = live.map(
    (g) => `  • ${g.slug} — started ${g.startedAt}, ${g.connected} connected`,
  );
  const blocking = live.filter((g) => BLOCKING.has(g.slug));
  if (blocking.length === 0) {
    console.warn(`[live-games] a deploy will end these games:\n${lines.join("\n")}`);
    return 0;
  }
  console.error(
    `[live-games] ${blocking.length} Clocktower game(s) in progress on production — ` +
      `a deploy would end ${blocking.length === 1 ? "it" : "them"}:\n${lines.join("\n")}\n` +
      "Wait for the game to finish, or push with ALLOW_LIVE_DEPLOY=1.",
  );
  return 1;
}

process.exit(await main());
