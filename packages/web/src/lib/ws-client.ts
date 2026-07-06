import {
  type RoomSlot,
  type RoomState,
  type ServerMessage,
  ServerMessageSchema,
  WsTicketResponseSchema,
} from "@boardgames/core/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, SchemaError } from "./api-fetch.ts";
import { gameLog } from "./game-log.ts";

/**
 * Parse a raw WebSocket message string into a typed {@link ServerMessage}.
 * Throws a {@link SchemaError} on shape mismatch (Phase 3 added this check
 * so a server-side regression surfaces as a typed exception, not a silent
 * `as ServerMessage` cast that crashes downstream).
 */
export function parseServerMessage(raw: string): ServerMessage {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new SchemaError([{ message: "WS message was not valid JSON", path: [] }], "response");
  }
  const result = ServerMessageSchema.safeParse(json);
  if (!result.success) {
    throw new SchemaError(
      result.error.issues.map((i) => ({
        message: i.message,
        path: i.path as readonly PropertyKey[],
      })),
      "response",
    );
  }
  return result.data;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

/** Connection state of a peer (human) in the current game session. Derived
 *  from the server's `player-disconnected` / `player-reconnected` messages so
 *  the multiplayer UI can show "player X dropped" without polling. Keyed by
 *  in-game `playerIndex`. */
export interface PeerConnectionState {
  playerIndex: number;
  playerName: string;
  connected: boolean;
}

/** One chat message in the room's running log. Stamped server-side so
 *  identity (`fromSlot`/`fromName`) can't be forged client-side. */
export interface ChatMessage {
  fromSlot: number;
  fromName: string;
  text: string;
  timestampMs: number;
}

export interface GameSession<TPlayerView, TAction, TResult> {
  // Connection
  status: ConnectionStatus;
  /** Game-rule / lobby error (illegal move, "room not found", host left).
   *  Distinct from `connectionError` so a transient rule rejection isn't
   *  mistaken for a fatal socket failure. */
  error: string | null;
  /** Transport-level error (socket errored, or a send couldn't go out
   *  because the socket was down). Cleared on the next successful open. */
  connectionError: string | null;
  /** Dev-visible counter of malformed server frames that failed envelope
   *  validation. The happy path is unchanged — bad frames are still dropped
   *  — but a server-side protocol regression is now observable instead of
   *  invisible. */
  malformedMessageCount: number;
  /** Connection state of the other humans in the running session. */
  peers: PeerConnectionState[];

  // Solo session state
  sessionId: string | null;
  playerView: TPlayerView | null;
  legalActions: TAction[];
  activePlayer: number;
  playerIndex: number;
  aiThinking: boolean;
  result: TResult | null;
  replayId: number | null;
  /** Which room the active game session belongs to — `null` for a solo
   *  session. The solo (`useRemoteGame`) and room (`useMultiplayerRoom`)
   *  projections both read the shared `playerView`; this discriminator is
   *  what stops one's game state from leaking into the other (e.g. an
   *  abandoned solo game masquerading as a running room game). */
  gameRoomCode: string | null;

  // Room state
  roomCode: string | null;
  roomState: RoomState | null;
  mySlot: number | null;

  // Solo session actions
  createSession: (gameSlug: string, config: unknown) => void;
  sendAction: (action: TAction) => void;
  leaveSession: () => void;

  // Room actions
  createRoom: (gameSlug: string, playerName: string) => void;
  joinRoom: (roomCode: string, playerName: string) => void;
  leaveRoom: () => void;
  configureRoom: (slots: RoomSlot[]) => void;
  startRoom: (config: unknown) => void;
  kickPlayer: (slotIndex: number) => void;
  toggleReady: () => void;
  /** Host-only: swap the in-game roles assigned to two slots (pre-start).
   *  Players stay in their slots; `RoomState.seatOrder` changes. */
  swapSeats: (a: number, b: number) => void;
  /** Clear the connection-level error. Used by screens that present a
   *  clean-slate entry point (e.g. JoinRoomRoute) so a stale "Host left"
   *  / "Room ABCD not found" notice from a previous session doesn't
   *  follow the user back. */
  clearError: () => void;

  /** In-room chat. `chatMessages` holds the log for the current room
   *  (cleared on join/leave); `sendChat` broadcasts a message to every
   *  seat. Only the Sky Team briefing UI uses this today, but it lives
   *  on the shared session so any game can opt in. */
  chatMessages: ChatMessage[];
  sendChat: (text: string) => void;
}

const WS_URL =
  (import.meta.env.VITE_WS_URL as string | undefined) ??
  (typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`
    : "ws://localhost:3001/ws");

export const RECONNECT_BASE_DELAY_MS = 1000;
export const RECONNECT_MAX_DELAY_MS = 30_000;

/**
 * Full-jitter exponential backoff. Returns a delay in ms in the half-open
 * range `[0, ceiling)`, where `ceiling = min(base * 2^attempt, max)`. The
 * ceiling grows exponentially with `attempt` until it saturates at
 * {@link RECONNECT_MAX_DELAY_MS}, and never gives up — callers keep retrying
 * indefinitely until the hook unmounts.
 *
 * Jitter (`Math.random`) spreads reconnect attempts so a fleet of clients
 * that dropped together (e.g. a server restart) don't stampede back in
 * lockstep. Randomness is fine here: this is the browser transport layer,
 * not the deterministic game engine. `rng` is injectable for tests.
 */
export function reconnectDelay(attempt: number, rng: () => number = Math.random): number {
  const ceiling = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** attempt, RECONNECT_MAX_DELAY_MS);
  return Math.floor(rng() * ceiling);
}

// Client-side liveness heartbeat via application-level ping/pong (the wire
// protocol carries `{type:"ping"}` / `{type:"pong"}` — see core/protocol/ws/*).
// Every interval, an OPEN socket sends a ping; the server's pong (like any
// received frame) refreshes `lastActivityRef`. So an otherwise-idle socket —
// e.g. a lobby waiting for players — keeps generating traffic and never trips
// the staleness check, while a half-open socket (the browser hasn't noticed
// the TCP drop) stops receiving pongs, crosses the stale threshold, and is
// force-closed so the backoff reconnect kicks in. The threshold is several
// interval-widths so a briefly quiet-but-healthy session isn't torn down.
const HEARTBEAT_INTERVAL_MS = 25_000;
const STALE_TIMEOUT_MS = 70_000;
// Bound on the outbound queue so a long outage can't grow it without limit.
const MAX_OUTBOUND_QUEUE = 32;

export function useGameSession<
  TPlayerView = unknown,
  TAction = unknown,
  TResult = unknown,
>(): GameSession<TPlayerView, TAction, TResult> {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  // Timestamp of the last received frame; drives passive staleness detection.
  const lastActivityRef = useRef(Date.now());
  // Gate that stops `onclose` from scheduling a reconnect after an intentional
  // teardown (hook unmount). Re-armed on each mount so StrictMode's
  // mount→unmount→mount cycle still reconnects.
  const shouldReconnectRef = useRef(true);
  // User actions issued while the socket is down are queued here and flushed on
  // the next open, rather than being silently dropped.
  const outboundQueueRef = useRef<unknown[]>([]);

  // Refs for auto-rejoin on reconnect
  const pendingRejoinRef = useRef<{ roomCode: string; playerName: string } | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [malformedMessageCount, setMalformedMessageCount] = useState(0);
  const [peers, setPeers] = useState<PeerConnectionState[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [playerView, setPlayerView] = useState<TPlayerView | null>(null);
  const [legalActions, setLegalActions] = useState<TAction[]>([]);
  const [activePlayer, setActivePlayer] = useState(0);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [aiThinking, setAiThinking] = useState(false);
  const [result, setResult] = useState<TResult | null>(null);
  const [replayId, setReplayId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gameRoomCode, setGameRoomCode] = useState<string | null>(null);
  // Mirror of `sessionId` readable inside the long-lived `ws.onmessage`
  // closure — the closure is created once per socket and would otherwise
  // capture a stale value.
  const sessionIdRef = useRef<string | null>(null);
  const setSessionIdSynced = useCallback((id: string | null) => {
    sessionIdRef.current = id;
    setSessionId(id);
  }, []);

  // Room state
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [mySlot, setMySlot] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");

    const stopHeartbeat = () => {
      if (heartbeatTimerRef.current !== undefined) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = undefined;
      }
    };

    const startHeartbeat = () => {
      stopHeartbeat();
      heartbeatTimerRef.current = setInterval(() => {
        const sock = wsRef.current;
        if (!sock) return;
        if (sock.readyState !== WebSocket.OPEN) {
          // Socket is CLOSING/CLOSED but `onclose` hasn't fired — force it.
          sock.close();
          return;
        }
        if (Date.now() - lastActivityRef.current > STALE_TIMEOUT_MS) {
          gameLog("heartbeat: no server activity — forcing reconnect");
          sock.close(); // onclose schedules the backoff reconnect
          return;
        }
        // Probe liveness; the server answers with `pong`, refreshing activity.
        try {
          sock.send(JSON.stringify({ type: "ping" }));
        } catch {
          sock.close();
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    const openWith = (url: string) => {
      // A socket may have opened while we awaited the ticket.
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        setError(null);
        setConnectionError(null);
        reconnectAttemptRef.current = 0;
        lastActivityRef.current = Date.now();
        startHeartbeat();

        // Auto-rejoin room on reconnect
        if (pendingRejoinRef.current) {
          const { roomCode: code, playerName } = pendingRejoinRef.current;
          ws.send(JSON.stringify({ type: "join-room", roomCode: code, playerName }));
        }

        // Flush any actions the user issued while the socket was down. The
        // rejoin above goes first so the server re-establishes the session
        // before the queued actions land. The server is authoritative and
        // rejects anything now stale with an `error` message.
        const queued = outboundQueueRef.current;
        outboundQueueRef.current = [];
        for (const queuedMsg of queued) {
          const queuedType = (queuedMsg as { type?: string }).type ?? "?";
          gameLog(`send (flushed) ${queuedType}`, queuedMsg);
          ws.send(JSON.stringify(queuedMsg));
        }
      };

      ws.onmessage = (event) => {
        // Any frame — even a malformed one — proves the socket is alive.
        lastActivityRef.current = Date.now();

        let msg: ServerMessage;
        try {
          msg = parseServerMessage(event.data);
        } catch (err) {
          if (err instanceof SchemaError) {
            console.warn("Bad WS message shape:", err.issues);
            // Keep dropping the frame (don't crash the session), but make the
            // regression observable rather than invisible.
            setMalformedMessageCount((n) => n + 1);
          }
          return;
        }

        gameLog(`recv ${msg.type}`, msg);

        switch (msg.type) {
          // --- Solo session messages ---
          case "session-created":
            setSessionIdSynced(msg.sessionId);
            setGameRoomCode(null);
            setPlayerView(msg.playerView as TPlayerView);
            setLegalActions(msg.legalActions as TAction[]);
            setAiThinking(false);
            setResult(null);
            setError(null);
            break;

          case "state-update":
            // One socket can briefly know about two game sessions (e.g. an
            // abandoned solo game lingering while a room game runs). Only
            // the bound session may drive the shared view — anything else
            // is dropped. A null binding means we're rejoining after a
            // refresh (reconnectPlayer sends a bare state-update, never
            // game-started) — adopt the session so `sendAction` works.
            if (sessionIdRef.current && msg.sessionId !== sessionIdRef.current) break;
            if (!sessionIdRef.current) {
              setSessionIdSynced(msg.sessionId);
              setGameRoomCode(pendingRejoinRef.current?.roomCode ?? null);
            }
            setPlayerView(msg.playerView as TPlayerView);
            setLegalActions(msg.legalActions as TAction[]);
            setActivePlayer(msg.activePlayer);
            if (msg.playerIndex !== undefined) setPlayerIndex(msg.playerIndex);
            setAiThinking(false);
            break;

          case "ai-thinking":
            if (sessionIdRef.current && msg.sessionId !== sessionIdRef.current) break;
            setAiThinking(true);
            break;

          case "game-over":
            if (sessionIdRef.current && msg.sessionId !== sessionIdRef.current) break;
            if (!sessionIdRef.current) {
              setSessionIdSynced(msg.sessionId);
              setGameRoomCode(pendingRejoinRef.current?.roomCode ?? null);
            }
            setPlayerView(msg.playerView as TPlayerView);
            setResult(msg.result as TResult);
            setReplayId(msg.replayId ?? null);
            if (msg.playerIndex !== undefined) setPlayerIndex(msg.playerIndex);
            setLegalActions([]);
            setAiThinking(false);
            break;

          case "error":
            setError(msg.message);
            setAiThinking(false);
            break;

          // --- Room / lobby messages ---
          case "room-created":
            setRoomCode(msg.roomCode);
            setRoomState(msg.roomState);
            setMySlot(0);
            setError(null);
            setChatMessages([]);
            pendingRejoinRef.current = {
              roomCode: msg.roomCode,
              playerName: playerNameRef.current,
            };
            break;

          case "room-joined":
            setRoomCode(msg.roomCode);
            setRoomState(msg.roomState);
            setMySlot(msg.yourSlot);
            setError(null);
            setChatMessages([]);
            break;

          case "room-updated":
            setRoomState(msg.roomState);
            break;

          case "room-closed":
            setRoomCode(null);
            setRoomState(null);
            setMySlot(null);
            pendingRejoinRef.current = null;
            setError(msg.reason);
            setChatMessages([]);
            setPeers([]);
            break;

          case "chat-message":
            setChatMessages((prev) => [
              ...prev,
              {
                fromSlot: msg.fromSlot,
                fromName: msg.fromName,
                text: msg.text,
                timestampMs: msg.timestampMs,
              },
            ]);
            break;

          case "game-started":
            setSessionIdSynced(msg.sessionId);
            setGameRoomCode(msg.roomCode);
            setPlayerIndex(msg.playerIndex);
            setActivePlayer(msg.activePlayer);
            setPlayerView(msg.playerView as TPlayerView);
            setLegalActions(msg.legalActions as TAction[]);
            setResult(null);
            setAiThinking(false);
            setError(null);
            setPeers([]);
            break;

          case "player-disconnected":
          case "player-reconnected": {
            // Surface peer connection changes so the multiplayer UI can show
            // "player X disconnected" (and clear it on reconnect). Keyed by
            // in-game playerIndex; latest event per peer wins.
            const connected = msg.type === "player-reconnected";
            setPeers((prev) => {
              const next = prev.filter((p) => p.playerIndex !== msg.playerIndex);
              next.push({
                playerIndex: msg.playerIndex,
                playerName: msg.playerName,
                connected,
              });
              next.sort((a, b) => a.playerIndex - b.playerIndex);
              return next;
            });
            break;
          }

          case "pong":
            // Liveness response — its arrival already refreshed lastActivity.
            break;
        }
      };

      ws.onclose = () => {
        setStatus("disconnected");
        wsRef.current = null;
        stopHeartbeat();

        // Don't reconnect after an intentional teardown (unmount).
        if (!shouldReconnectRef.current) return;

        // Uncapped exponential backoff with full jitter — retry forever.
        const delay = reconnectDelay(reconnectAttemptRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          reconnectAttemptRef.current++;
          connect();
        }, delay);
      };

      ws.onerror = () => {
        setStatus("error");
        setConnectionError("Connection error");
      };
    };

    // The WS connects cross-origin to the API server in prod, where the
    // session cookie (scoped to the web origin via the `/api` proxy) can't
    // ride the upgrade handshake. Fetch a short-lived ticket over the
    // cookie-authed HTTP path and pass it as a query param. On failure,
    // connect without one — same-origin dev falls back to the cookie, and
    // cross-origin prod will 401 so onclose schedules a retry.
    void apiFetch("/api/ws-ticket", { response: WsTicketResponseSchema })
      .then(({ ticket }) => {
        const sep = WS_URL.includes("?") ? "&" : "?";
        openWith(`${WS_URL}${sep}ticket=${encodeURIComponent(ticket)}`);
      })
      .catch(() => openWith(WS_URL));
  }, [setSessionIdSynced]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();
    return () => {
      shouldReconnectRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      clearInterval(heartbeatTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback((msg: unknown) => {
    const ws = wsRef.current;
    const type = (msg as { type?: string }).type ?? "?";
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      // Socket isn't open (mid-reconnect). Rather than silently stranding the
      // user's action, queue it (bounded) to flush on the next open and
      // surface the outage on the transport-error channel so the UI can show a
      // "reconnecting…" state. The queue is the least-invasive fix that keeps
      // actions from being lost; the server rejects anything gone stale.
      gameLog(`send DEFERRED (socket not open): ${type}`, msg);
      if (outboundQueueRef.current.length < MAX_OUTBOUND_QUEUE) {
        outboundQueueRef.current.push(msg);
      }
      setConnectionError("Connection lost — retrying…");
      return;
    }
    gameLog(`send ${type}`, msg);
    ws.send(JSON.stringify(msg));
  }, []);

  // --- Solo session actions ---

  const createSession = useCallback(
    (gameSlug: string, config: unknown) => {
      sendMessage({ type: "create-session", gameSlug, config });
    },
    [sendMessage],
  );

  const sendAction = useCallback(
    (action: TAction) => {
      if (!sessionId) return;
      sendMessage({ type: "action", sessionId, action });
    },
    [sendMessage, sessionId],
  );

  const leaveSession = useCallback(() => {
    if (!sessionId) return;
    sendMessage({ type: "leave-session", sessionId });
    setSessionIdSynced(null);
    setGameRoomCode(null);
    setPlayerView(null);
    setLegalActions([]);
    setResult(null);
    setReplayId(null);
    setPlayerIndex(0);
    setRoomCode(null);
    setRoomState(null);
    setMySlot(null);
    setPeers([]);
    pendingRejoinRef.current = null;
  }, [sendMessage, sessionId, setSessionIdSynced]);

  // --- Room actions ---

  const playerNameRef = useRef<string>("");

  const createRoom = useCallback(
    (gameSlug: string, playerName: string) => {
      playerNameRef.current = playerName;
      pendingRejoinRef.current = null; // set on room-created
      sendMessage({ type: "create-room", gameSlug, playerName });
    },
    [sendMessage],
  );

  const joinRoom = useCallback(
    (code: string, playerName: string) => {
      pendingRejoinRef.current = { roomCode: code, playerName };
      sendMessage({ type: "join-room", roomCode: code, playerName });
    },
    [sendMessage],
  );

  const leaveRoom = useCallback(() => {
    if (!roomCode) return;
    sendMessage({ type: "leave-room", roomCode });
    setRoomCode(null);
    setRoomState(null);
    setMySlot(null);
    setPeers([]);
    pendingRejoinRef.current = null;
    // The server may follow up with a `room-closed` (e.g. host left) — wipe
    // its reason so the deliberate exit doesn't surface as a red error on
    // the next screen.
    setError(null);
    setChatMessages([]);
  }, [sendMessage, roomCode]);

  const clearError = useCallback(() => setError(null), []);

  const sendChat = useCallback(
    (text: string) => {
      if (!roomCode) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      sendMessage({ type: "chat", roomCode, text: trimmed.slice(0, 500) });
    },
    [sendMessage, roomCode],
  );

  const configureRoom = useCallback(
    (slots: RoomSlot[]) => {
      if (!roomCode) return;
      sendMessage({ type: "configure-room", roomCode, slots });
    },
    [sendMessage, roomCode],
  );

  const startRoom = useCallback(
    (config: unknown) => {
      if (!roomCode) return;
      sendMessage({ type: "start-room", roomCode, config });
    },
    [sendMessage, roomCode],
  );

  const kickPlayer = useCallback(
    (slotIndex: number) => {
      if (!roomCode) return;
      sendMessage({ type: "kick-player", roomCode, slotIndex });
    },
    [sendMessage, roomCode],
  );

  const toggleReady = useCallback(() => {
    if (!roomCode) return;
    sendMessage({ type: "toggle-ready", roomCode });
  }, [sendMessage, roomCode]);

  const swapSeats = useCallback(
    (a: number, b: number) => {
      if (!roomCode) return;
      sendMessage({ type: "swap-seats", roomCode, a, b });
    },
    [sendMessage, roomCode],
  );

  return {
    status,
    sessionId,
    playerView,
    legalActions,
    activePlayer,
    playerIndex,
    aiThinking,
    result,
    replayId,
    gameRoomCode,
    error,
    connectionError,
    malformedMessageCount,
    peers,
    roomCode,
    roomState,
    mySlot,
    createSession,
    sendAction,
    leaveSession,
    createRoom,
    joinRoom,
    leaveRoom,
    configureRoom,
    startRoom,
    kickPlayer,
    toggleReady,
    swapSeats,
    clearError,
    chatMessages,
    sendChat,
  };
}
