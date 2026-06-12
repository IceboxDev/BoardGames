import { gameRoomConfigs } from "@boardgames/core/protocol/room-config";
import { Suspense, useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useCurrentUser } from "../../hooks/useCurrentUser.ts";
import { useGameShell } from "../../hooks/useGameShell";
import { Lobby } from "../multiplayer";

// Stable localStorage key shared with `<JoinRoom>` — that screen writes
// the player's chosen name as they type; this route reads it back when
// rejoining a room directly via URL (refresh or shared link).
const PLAYER_NAME_KEY = "boardgames-player-name";

/**
 * Stand-in lobby-config component for games that don't declare one. It
 * fires `onChange({})` once on mount so the lobby's start config is a
 * defined-shape object even when no game-specific options apply, and
 * renders nothing visible.
 */
function NoLobbyConfig({ onChange }: { value: unknown; onChange: (cfg: unknown) => void }) {
  useEffect(() => {
    onChange({});
  }, [onChange]);
  return null;
}

/**
 * Resolve the player name used to (re)join a room. JoinRoom persists it
 * to localStorage as the user types, so a real refresh sees the same
 * name. We fall back to the better-auth session display name, then a
 * short generic placeholder — never an empty string, which the server
 * rejects.
 */
function resolvePlayerName(sessionName: string | null | undefined): string {
  const fromStorage =
    typeof window !== "undefined" ? localStorage.getItem(PLAYER_NAME_KEY)?.trim() : undefined;
  if (fromStorage) return fromStorage;
  const trimmedSession = sessionName?.trim();
  if (trimmedSession) return trimmedSession;
  return "Player";
}

/**
 * Route element at `/play/:slug/mp/lobby/:roomCode`. Three jobs:
 *
 *   1. **Rejoin on direct entry.** When the URL roomCode doesn't match
 *      `mp.roomCode`, fire `mp.joinRoom(roomCode, name)`. The server
 *      treats it as a rejoin if the user already has a slot, or a fresh
 *      join otherwise. This is the rejoin path on browser refresh: the
 *      WebSocket re-opens (owned by `<GameShellLayout>`), the URL still
 *      reflects the room, and we step right back in.
 *
 *   2. **Lobby → play handoff.** When the host starts the game the
 *      server transitions the room into "playing" phase; the effect
 *      below detects that and navigates to `/mp/play/:roomCode` so all
 *      seated players land on the game board together.
 *
 *   3. **Game-specific lobby config.** Optional per-game UI (Pandemic's
 *      difficulty picker, future scenario pickers) is rendered inside
 *      `<Lobby>` via the game's `lobbyConfigComponent`. The route holds
 *      the current config and threads it into `mp.startRoom(config)`.
 *
 * Leaving — the "Leave Room" button calls `mp.leaveRoom` AND navigates
 * back to the mode select. The browser back button does NOT auto-leave;
 * the user can navigate around the app while their seat is held server-
 * side. Only an explicit leave (or the layout unmount, which closes the
 * WebSocket) drops them from the room.
 */
export default function LobbyRoute() {
  const navigate = useNavigate();
  const { roomCode: urlRoomCode } = useParams<{ roomCode: string }>();
  const { def, mp } = useGameShell();
  const { user } = useCurrentUser();

  const [config, setConfig] = useState<unknown>(def.defaultMpConfig ?? {});

  // Rejoin path — covers refresh and direct-URL entry. Gated on
  // `isConnected` because firing `joinRoom` before the socket is open
  // drops the message (see `ws-client.ts:251-254`). The session also
  // queues a pending rejoin on reconnect, so even rapid refresh recovers;
  // this effect handles the warm-cache case where the socket is already
  // open by the time we render.
  useEffect(() => {
    if (!urlRoomCode) return;
    if (!mp.isConnected) return;
    if (mp.roomCode === urlRoomCode) return;
    mp.joinRoom(urlRoomCode, resolvePlayerName(user?.name));
  }, [urlRoomCode, mp.isConnected, mp.roomCode, mp.joinRoom, user?.name]);

  // Lobby → play handoff. The mp projection flips `phase` to "playing"
  // when the server sends `game-started` (or `state-update` after a
  // rejoin into a started game). `replace` so the back button from the
  // game board returns to mode select, not to the now-defunct lobby URL.
  useEffect(() => {
    if (mp.phase === "playing" && urlRoomCode) {
      navigate(`/play/${def.slug}/mp/play/${urlRoomCode}`, { replace: true });
    }
  }, [mp.phase, def.slug, urlRoomCode, navigate]);

  if (!urlRoomCode) {
    return <Navigate to={`/play/${def.slug}/mp/join`} replace />;
  }

  // Until the rejoin returns a roomState we can't render the slot grid.
  // The `Lobby` component requires a non-null `roomState`, so we render
  // a thin holding screen — short-lived (one server round-trip).
  if (!mp.roomState) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-fg-muted">
        Joining room {urlRoomCode}…
      </div>
    );
  }

  const LobbyConfigComponent = def.lobbyConfigComponent ?? NoLobbyConfig;

  return (
    <Lobby
      roomCode={urlRoomCode}
      roomState={mp.roomState}
      mySlot={mp.mySlot ?? 0}
      isHost={mp.isHost}
      roomConfig={gameRoomConfigs[def.slug]}
      layout={def.lobbyLayout}
      title={def.title}
      onStart={() => mp.startRoom(config)}
      onLeave={() => {
        mp.leaveRoom();
        navigate(`/play/${def.slug}`);
      }}
      onKick={(i) => mp.kickPlayer(i)}
      onToggleReady={() => mp.toggleReady()}
      error={mp.error}
    >
      {/* Lazy game-specific lobby content (e.g. Pandemic's difficulty
          picker). Falls through to `<NoLobbyConfig />` for games without
          one — no Suspense fallback because the chunk is tiny. */}
      <Suspense fallback={null}>
        <LobbyConfigComponent value={config} onChange={setConfig} isHost={mp.isHost} />
      </Suspense>
    </Lobby>
  );
}
