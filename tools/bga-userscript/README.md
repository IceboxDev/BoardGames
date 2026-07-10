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

- **Primary capture is a WebSocket tee** installed at `document-start` on
  `unsafeWindow.WebSocket`. BGA's realtime notifications arrive on that socket
  before any `gameui` API sees them, and `gameui.notifqueue`'s internals are
  undocumented and version-dependent. Frames are forwarded as
  `{kind: "notif", payload: {source: "ws", url, data}}`.
- `gameui.gamedatas` is polled separately and sent once as the full-state
  checkpoint (`kind: "gamedatas"`). A `notifqueue.onNotification` hook is
  installed opportunistically *if* that method exists on your BGA build,
  tagged `source: "notifqueue"`.
- The script must run **inside the game iframe** (that's where `gameui`
  lives), so it deliberately does not set `@noframes`.
- Events are batched (~750 ms) and retried with backoff. On HTTP 401 it
  re-sends a fresh checkpoint once the session is re-created.
- Sessions are ephemeral. If the badge goes red after a deploy/restart,
  re-open "Connect to BGA", re-create the bridge session, and paste the new
  token via the Tampermonkey menu.
- **"Diagnose bridge"** (Tampermonkey menu) reports whether `gameui`,
  `gamedatas`, and `notifqueue` were found, whether the WebSocket tee is
  installed, how many frames were seen, and the last delivery error. Run this
  first whenever nothing shows up.

## Capturing fixtures (do this before trusting the adapter)

The checked-in fixture (`packages/core/src/games/7-wonders/bga/fixtures/sample-game.json`)
is **synthetic** — the notification type names and `gamedatas` keys in the
adapter are guesses until validated against a real table.

```bash
node tools/bga-userscript/capture-sink.mjs bga-capture.jsonl 3999
```

Point the userscript's ingest URL at `http://localhost:3999/ingest` (any token
value works — the sink is unauthenticated and local-only), open your BGA
7 Wonders table, and play a few turns. The sink prints a live tally of the
notification types it sees and appends every event to the JSONL file. Feed
that file back into the adapter's fixtures and tests.
