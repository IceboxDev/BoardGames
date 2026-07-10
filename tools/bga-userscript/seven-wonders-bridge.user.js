// ==UserScript==
// @name         BoardGames 7 Wonders BGA Bridge
// @namespace    boardgames-bridge
// @version      2.0.0
// @description  Relays your live BGA 7 Wonders table (gamedatas + notifications) to your BoardGames site for spectating. Passive observation only: sends NOTHING to BGA and automates NO moves.
// @match        *://boardgamearena.com/*
// @match        *://*.boardgamearena.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      *
// @run-at       document-start
// ==/UserScript==

// ─── ToS note ────────────────────────────────────────────────────────────────
// This script passively observes tables you are seated at or permitted to
// watch. It only READS state that BGA already delivers to your browser, and
// forwards it to YOUR OWN server. It never sends requests to
// boardgamearena.com and never plays moves for you.
//
// ─── Why it captures the way it does ─────────────────────────────────────────
// BGA's realtime notifications arrive over a WebSocket before any documented
// `gameui` API sees them, and `gameui.notifqueue`'s internals are undocumented
// and version-dependent. So the PRIMARY capture is a WebSocket tee installed
// at document-start (robust, sees everything); `gameui.gamedatas` is polled
// separately for the full-state checkpoint. A `notifqueue` hook is installed
// opportunistically when the method happens to exist.
//
// NOTE: the script runs INSIDE the game iframe too (no @noframes) — that is
// where `gameui` lives.

(function () {
  "use strict";

  const FLUSH_INTERVAL_MS = 750;
  const FLUSH_BATCH_SIZE = 20;
  const MAX_BATCH = 50; // must match BGA_INGEST_MAX_EVENTS on the server
  const POLL_MS = 500;
  const POLL_MAX_MS = 180000;
  const BACKOFF_MIN_MS = 1000;
  const BACKOFF_MAX_MS = 30000;

  // Page globals live on `unsafeWindow`, NOT on the sandboxed `window`.
  const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

  /** @type {{ingestUrl?: string, token?: string}} */
  const config = GM_getValue("bga-bridge", {});

  GM_registerMenuCommand("Set bridge server URL + token", () => {
    const ingestUrl = prompt(
      "Ingest URL (e.g. https://your-site.example/api/bga-ingest, or http://localhost:3999/ingest for the capture sink):",
      config.ingestUrl || "",
    );
    if (ingestUrl === null) return;
    const token = prompt(
      "Ingest token (from the Connect to BGA screen; any value for the capture sink):",
      config.token || "",
    );
    if (token === null) return;
    config.ingestUrl = ingestUrl.trim();
    config.token = token.trim();
    GM_setValue("bga-bridge", config);
    alert("Bridge config saved. Reload the game page.");
  });

  GM_registerMenuCommand("Diagnose bridge", () => {
    const gameui = pageWindow.gameui;
    const lines = [
      `url: ${location.href}`,
      `in iframe: ${window.top !== window.self}`,
      `ingestUrl: ${config.ingestUrl || "(unset)"}`,
      `token: ${config.token ? "set" : "(unset)"}`,
      `unsafeWindow available: ${typeof unsafeWindow !== "undefined"}`,
      `gameui: ${gameui ? "present" : "MISSING"}`,
      `gameui.gamedatas: ${gameui && gameui.gamedatas ? "present" : "MISSING"}`,
      `gameui.notifqueue: ${gameui && gameui.notifqueue ? "present" : "MISSING"}`,
      `websocket tee installed: ${wsTeeInstalled}`,
      `ws frames seen: ${wsFrameCount}`,
      `queued: ${queue.length}, sent: ${sentCount}`,
      `last error: ${lastError || "none"}`,
    ];
    console.log("[bga-bridge]\n" + lines.join("\n"));
    alert(lines.join("\n"));
  });

  // ─── Status badge ──────────────────────────────────────────────────────────

  let badge = null;
  let paused = false;
  let sentCount = 0;
  let lastError = null;

  function setBadge(text, color) {
    if (!document.body) return;
    if (!badge) {
      badge = document.createElement("div");
      badge.style.cssText =
        "position:fixed;bottom:8px;right:8px;z-index:99999;padding:4px 10px;" +
        "border-radius:6px;font:11px/1.4 sans-serif;color:#fff;cursor:pointer;" +
        "opacity:0.85;box-shadow:0 1px 4px rgba(0,0,0,.4)";
      badge.title = "BoardGames BGA bridge — click to pause/resume";
      badge.addEventListener("click", () => {
        paused = !paused;
        setBadge(paused ? "bridge paused" : "bridging", paused ? "#555" : "#15803d");
      });
      document.body.appendChild(badge);
    }
    badge.textContent = text;
    badge.style.background = color;
  }

  // ─── Event queue ───────────────────────────────────────────────────────────

  let seq = 0;
  /** @type {Array<{seq:number,kind:string,payload:unknown,ts:number}>} */
  const queue = [];
  let inFlight = false;
  let backoffMs = 0;

  /**
   * Structured-clone-ish deep copy that survives cycles and DOM/function
   * values instead of throwing (a naive JSON round-trip loses the whole
   * payload the moment BGA attaches a back-reference).
   */
  function sanitize(value, depth = 0, seen = new WeakSet()) {
    if (value === null || typeof value !== "object") {
      return typeof value === "function" ? undefined : value;
    }
    if (depth > 8) return "[deep]";
    if (seen.has(value)) return "[circular]";
    if (typeof Node !== "undefined" && value instanceof Node) return "[dom]";
    seen.add(value);
    if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1, seen));
    const out = {};
    for (const key of Object.keys(value)) {
      try {
        const copied = sanitize(value[key], depth + 1, seen);
        if (copied !== undefined) out[key] = copied;
      } catch (_e) {
        /* skip hostile getters */
      }
    }
    return out;
  }

  function enqueue(kind, payload) {
    if (paused) return;
    queue.push({ seq: seq++, kind, payload: sanitize(payload), ts: Date.now() });
  }

  // ─── WebSocket tee (primary notification capture) ──────────────────────────

  let wsTeeInstalled = false;
  let wsFrameCount = 0;

  function installWebSocketTee() {
    const NativeWebSocket = pageWindow.WebSocket;
    if (!NativeWebSocket || NativeWebSocket.__bgaBridgePatched) return;

    function PatchedWebSocket(url, protocols) {
      const socket =
        protocols === undefined
          ? new NativeWebSocket(url)
          : new NativeWebSocket(url, protocols);
      try {
        if (String(url).includes("boardgamearena.com")) {
          socket.addEventListener("message", (event) => {
            wsFrameCount++;
            let data = event.data;
            if (typeof data === "string") {
              try {
                data = JSON.parse(data);
              } catch (_e) {
                /* keep the raw string */
              }
            } else {
              return; // binary frames (ping/pong) carry no game state
            }
            enqueue("notif", { source: "ws", url: String(url), data });
          });
        }
      } catch (_e) {
        /* never break the page's socket */
      }
      return socket;
    }
    PatchedWebSocket.prototype = NativeWebSocket.prototype;
    PatchedWebSocket.__bgaBridgePatched = true;
    for (const key of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) {
      PatchedWebSocket[key] = NativeWebSocket[key];
    }
    pageWindow.WebSocket = PatchedWebSocket;
    wsTeeInstalled = true;
    console.log("[bga-bridge] WebSocket tee installed");
  }

  installWebSocketTee();

  // ─── gamedatas checkpoint + optional notifqueue hook ───────────────────────

  let checkpointSent = false;
  let notifqueueHooked = false;

  function enqueueCheckpoint() {
    const gameui = pageWindow.gameui;
    if (!gameui || !gameui.gamedatas) return false;
    enqueue("gamedatas", gameui.gamedatas);
    return true;
  }

  function tryHookNotifqueue() {
    const gameui = pageWindow.gameui;
    if (!gameui || !gameui.notifqueue || notifqueueHooked) return;
    const queueObj = gameui.notifqueue;
    // `onNotification` is not part of any documented API; wrap it only when
    // this BGA build actually exposes it. The WebSocket tee is the real feed.
    if (typeof queueObj.onNotification === "function") {
      const original = queueObj.onNotification;
      queueObj.onNotification = function (notif) {
        try {
          enqueue("notif", { source: "notifqueue", data: notif });
        } catch (_e) {
          /* never break the game UI */
        }
        return original.apply(this, arguments);
      };
      notifqueueHooked = true;
      console.log("[bga-bridge] notifqueue.onNotification hooked");
    }
  }

  const started = Date.now();
  const poll = setInterval(() => {
    installWebSocketTee(); // BGA may reassign window.WebSocket late
    tryHookNotifqueue();

    if (!checkpointSent) checkpointSent = enqueueCheckpoint();

    if (!config.ingestUrl || !config.token) {
      setBadge("bridge: set URL + token (Tampermonkey menu)", "#b45309");
    } else if (checkpointSent || wsFrameCount > 0) {
      if (!paused && !lastError) setBadge(`bridging · ${sentCount} sent`, "#15803d");
    } else {
      setBadge("waiting for game…", "#666");
    }

    if (Date.now() - started > POLL_MAX_MS && !checkpointSent && wsFrameCount === 0) {
      clearInterval(poll);
      if (badge) badge.remove();
    }
  }, POLL_MS);

  // ─── Delivery ──────────────────────────────────────────────────────────────

  function flush() {
    if (paused || inFlight || backoffMs > 0 || queue.length === 0) return;
    if (!config.ingestUrl || !config.token) return;

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
    const wait = backoffMs;
    setTimeout(() => {
      backoffMs = 0;
      // The session may have been re-created server-side while we were down;
      // a fresh checkpoint makes the stream self-healing.
      if (reason === "HTTP 401") checkpointSent = false;
    }, wait);
  }

  setInterval(flush, FLUSH_INTERVAL_MS);
  setInterval(() => {
    if (queue.length >= FLUSH_BATCH_SIZE) flush();
  }, 100);
})();
