# 7 Wonders BGA bridge userscript

Relays a live Board Game Arena 7 Wonders table into the BoardGames site's
"Connect to BGA" spectate view. The server side is a dumb relay
(`/api/bga-ingest`); normalization to our board model happens in
`@boardgames/core/games/7-wonders/bga`.

## What it does (and doesn't)

- **Reads only.** It hooks `gameui.notifqueue.onNotification` and copies
  `gameui.gamedatas` — state BGA already delivers to your browser — and
  forwards it to **your own server** with `GM_xmlhttpRequest`.
- **Sends nothing to BGA** and **automates no moves**. Passive observation of
  tables you are seated at (or allowed to watch) only. Keep it that way —
  BGA's ToS forbids automation.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or Violentmonkey).
2. Create a new userscript and paste `seven-wonders-bridge.user.js`
   (or open the raw file and let Tampermonkey pick it up).
3. On the site, open **7 Wonders → Multiplayer → Connect to BGA → Bridge my
   BGA table**. Copy the **ingest URL** and **token** it shows.
4. In Tampermonkey's menu (on any BGA page) run **"Set bridge server URL +
   token"** and paste both.
5. Open your BGA 7 Wonders table. A small badge appears bottom-right:
   - gray `waiting for game…` — game UI not loaded yet
   - green `bridging · N sent` — relaying
   - red `bridge error — retrying` — server unreachable / token invalid
   - click the badge to pause/resume

## Behavior notes

- On hook it sends a full `gamedatas` checkpoint, then every notification
  raw (`newHand`, `cardsPlayed`, `coinsChanged`, `warResult`, `newAge`, …).
  Unknown notification types are fine — the adapter ignores what it doesn't
  know, so BGA format drift degrades the view instead of breaking anything.
- Events are batched (~750 ms), retried with backoff, and re-anchored with a
  fresh checkpoint if the server restarts or the session was re-created.
- Sessions are ephemeral. If the badge goes red after a deploy/restart,
  re-open "Connect to BGA", re-create the bridge session, and paste the new
  token via the Tampermonkey menu.

## Capturing fixtures

Point `ingestUrl` at a local dev server (`http://localhost:3001/api/bga-ingest`)
and copy payloads from the server log or the session buffer into
`packages/core/src/games/7-wonders/bga/fixtures/` to grow the adapter's test
suite.
