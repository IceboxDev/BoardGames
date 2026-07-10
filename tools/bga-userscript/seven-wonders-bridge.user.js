// ==UserScript==
// @name         BoardGames 7 Wonders BGA Bridge
// @namespace    boardgames-bridge
// @version      1.0.0
// @description  Relays your live BGA 7 Wonders table (gamedatas + notifications) to your BoardGames site for spectating. Passive observation only: sends NOTHING to BGA and automates NO moves.
// @match        https://boardgamearena.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      *
// @run-at       document-idle
// @noframes     false
// ==/UserScript==

// ─── ToS note ────────────────────────────────────────────────────────────────
// This script passively observes tables you are seated at or permitted to
// watch. It only READS window.gameui state that BGA already delivers to your
// browser, and forwards it to YOUR OWN server. It never sends requests to
// boardgamearena.com and never plays moves for you.

(function () {
  "use strict";

  const FLUSH_INTERVAL_MS = 750;
  const FLUSH_BATCH_SIZE = 20;
  const MAX_BATCH = 50; // must match BGA_INGEST_MAX_EVENTS on the server
  const HOOK_POLL_MS = 500;
  const HOOK_POLL_MAX_MS = 120000;
  const BACKOFF_MIN_MS = 1000;
  const BACKOFF_MAX_MS = 30000;

  /** @type {{ingestUrl?: string, token?: string}} */
  const config = GM_getValue("bga-bridge", {});

  GM_registerMenuCommand("Set bridge server URL + token", () => {
    const ingestUrl = prompt(
      "Ingest URL (e.g. https://your-site.example/api/bga-ingest):",
      config.ingestUrl || "",
    );
    if (ingestUrl === null) return;
    const token = prompt("Ingest token (from the Connect to BGA screen):", config.token || "");
    if (token === null) return;
    config.ingestUrl = ingestUrl.trim();
    config.token = token.trim();
    GM_setValue("bga-bridge", config);
    setBadge("config saved — reload the game page", "#888");
  });

  // ─── Status badge ──────────────────────────────────────────────────────────

  let badge = null;
  let paused = false;
  let sentCount = 0;

  function setBadge(text, color) {
    if (!badge) {
      badge = document.createElement("div");
      badge.style.cssText =
        "position:fixed;bottom:8px;right:8px;z-index:99999;padding:4px 10px;" +
        "border-radius:6px;font:11px/1.4 sans-serif;color:#fff;cursor:pointer;" +
        "opacity:0.85;box-shadow:0 1px 4px rgba(0,0,0,.4)";
      badge.title = "BoardGames BGA bridge — click to pause/resume";
      badge.addEventListener("click", () => {
        paused = !paused;
        render();
      });
      document.body.appendChild(badge);
    }
    badge.textContent = paused ? "bridge paused" : text;
    badge.style.background = paused ? "#555" : color;
  }

  function render() {
    if (paused) setBadge("", "#555");
  }

  // ─── Event queue + delivery ────────────────────────────────────────────────

  let seq = 0;
  /** @type {Array<{seq:number,kind:string,payload:unknown,ts:number}>} */
  const queue = [];
  let inFlight = false;
  let backoffMs = 0;
  let lastError = null;

  function sanitize(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_e) {
      return { unserializable: true };
    }
  }

  function enqueue(kind, payload) {
    if (paused) return;
    queue.push({ seq: seq++, kind, payload: sanitize(payload), ts: Date.now() });
  }

  function enqueueCheckpoint() {
    const gameui = window.gameui || (window.unsafeWindow && window.unsafeWindow.gameui);
    if (gameui && gameui.gamedatas) enqueue("gamedatas", gameui.gamedatas);
  }

  function flush() {
    if (paused || inFlight || queue.length === 0) return;
    if (!config.ingestUrl || !config.token) {
      setBadge("bridge: set URL + token via Tampermonkey menu", "#b45309");
      return;
    }
    if (backoffMs > 0) return; // a retry timer will clear this

    const batch = queue.slice(0, MAX_BATCH);
    inFlight = true;
    GM_xmlhttpRequest({
      method: "POST",
      url: config.ingestUrl,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ token: config.token, events: batch }),
      timeout: 15000,
      onload(res) {
        inFlight = false;
        if (res.status === 200) {
          queue.splice(0, batch.length);
          sentCount += batch.length;
          backoffMs = 0;
          lastError = null;
          try {
            const body = JSON.parse(res.responseText);
            // Server reset (fresh session/lower nextSeq): re-anchor with a
            // full checkpoint so late state is never missing.
            if (typeof body.nextSeq === "number" && body.nextSeq < seq - queue.length) {
              enqueueCheckpoint();
            }
          } catch (_e) {
            /* response shape is best-effort */
          }
          setBadge(`bridging · ${sentCount} sent`, "#15803d");
        } else {
          failBatch(`HTTP ${res.status}`);
        }
      },
      onerror() {
        inFlight = false;
        failBatch("network error");
      },
      ontimeout() {
        inFlight = false;
        failBatch("timeout");
      },
    });
  }

  function failBatch(reason) {
    lastError = reason;
    backoffMs = Math.min(backoffMs === 0 ? BACKOFF_MIN_MS : backoffMs * 2, BACKOFF_MAX_MS);
    setBadge(`bridge error (${reason}) — retrying`, "#b91c1c");
    setTimeout(() => {
      backoffMs = 0;
      // After a long outage the session may have been re-created server-side;
      // a fresh checkpoint makes the stream self-healing.
      if (lastError && queue.length === 0) enqueueCheckpoint();
    }, backoffMs);
  }

  setInterval(flush, FLUSH_INTERVAL_MS);
  setInterval(() => {
    if (queue.length >= FLUSH_BATCH_SIZE) flush();
  }, 100);

  // ─── Hook installation ─────────────────────────────────────────────────────

  function tryHook() {
    const gameui = window.gameui || (window.unsafeWindow && window.unsafeWindow.gameui);
    if (!gameui || !gameui.gamedatas || !gameui.notifqueue) return false;

    // Full-state checkpoint first, so a notif missed before hooking is moot.
    enqueue("gamedatas", gameui.gamedatas);

    const original = gameui.notifqueue.onNotification;
    gameui.notifqueue.onNotification = function (notif) {
      try {
        enqueue("notif", notif);
      } catch (_e) {
        /* never break the game UI */
      }
      return original.apply(this, arguments);
    };

    setBadge("bridging · 0 sent", "#15803d");
    return true;
  }

  const started = Date.now();
  const poll = setInterval(() => {
    if (tryHook()) {
      clearInterval(poll);
    } else if (Date.now() - started > HOOK_POLL_MAX_MS) {
      clearInterval(poll);
      // Not a game page (lobby, forums, …) — stay silent.
      if (badge) badge.remove();
    } else if (!badge && document.body) {
      setBadge("waiting for game…", "#666");
    }
  }, HOOK_POLL_MS);
})();
