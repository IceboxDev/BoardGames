import { Suspense, useEffect } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useCurrentUser } from "../../hooks/useCurrentUser.ts";
import { type GameSource, useGameShell } from "../../hooks/useGameShell";

const PLAYER_NAME_KEY = "boardgames-player-name";

function resolvePlayerName(sessionName: string | null | undefined): string {
  const fromStorage =
    typeof window !== "undefined" ? localStorage.getItem(PLAYER_NAME_KEY)?.trim() : undefined;
  if (fromStorage) return fromStorage;
  const trimmedSession = sessionName?.trim();
  if (trimmedSession) return trimmedSession;
  return "Player";
}

/**
 * Route element at `/play/:slug/solo`. Mounts the game's playable
 * component with `source="solo"`; the component itself dispatches on
 * the prop to render setup → board → game-over.
 *
 * `GameShellLayout` already redirected unknown slugs and games with no
 * `component`, so we can read `def.component` unguarded.
 */
export function SoloGameRoute() {
  const { def } = useGameShell();
  const Game = def.component;
  if (!Game) {
    // Defensive — should be unreachable, since `GameShellLayout`
    // redirected on missing component.
    return <Navigate to="/games" replace />;
  }
  return (
    <Suspense fallback={null}>
      <Game source="solo" />
    </Suspense>
  );
}

/**
 * Route element at `/play/:slug/mp/play/:roomCode`. Same dispatch as
 * `<SoloGameRoute>` plus two URL-recovery behaviors:
 *
 *   1. **Rejoin** — if we mount with the URL roomCode but no session
 *      sees it, fire `mp.joinRoom(roomCode, name)` so a refresh on the
 *      game URL re-attaches the player to the in-progress room.
 *      Symmetric with `<LobbyRoute>` rejoin: the server treats it as a
 *      reseat when the user already had a slot.
 *
 *   2. **Fall back to lobby URL** — if the room exists but the game
 *      isn't actually in flight (e.g. user followed a stale link, or
 *      the host hasn't started yet), navigate to the lobby route. That
 *      keeps the URL honest about state.
 */
export function MpGameRoute() {
  const navigate = useNavigate();
  const { roomCode: urlRoomCode } = useParams<{ roomCode: string }>();
  const { def, mp } = useGameShell();
  const { user } = useCurrentUser();

  // Rejoin on direct entry / refresh. Same guards as the lobby route.
  useEffect(() => {
    if (!urlRoomCode) return;
    if (!mp.isConnected) return;
    if (mp.roomCode === urlRoomCode) return;
    mp.joinRoom(urlRoomCode, resolvePlayerName(user?.name));
  }, [urlRoomCode, mp.isConnected, mp.roomCode, mp.joinRoom, user?.name]);

  // If we attached to a room but the phase is "lobby" (host hasn't
  // started yet, or a stale /play link), bounce to the lobby URL so the
  // URL reflects reality. We `replace` so back-button history stays
  // clean.
  useEffect(() => {
    if (mp.phase === "lobby" && urlRoomCode) {
      navigate(`/play/${def.slug}/mp/lobby/${urlRoomCode}`, { replace: true });
    }
  }, [mp.phase, def.slug, urlRoomCode, navigate]);

  if (!urlRoomCode) {
    return <Navigate to={`/play/${def.slug}/mp/join`} replace />;
  }

  const Game = def.component;
  if (!Game) {
    return <Navigate to="/games" replace />;
  }
  return (
    <Suspense fallback={null}>
      <Game source="mp" />
    </Suspense>
  );
}

/**
 * Route element at `/play/:slug/companion`. Renders the game's
 * companion-device screen (e.g. the D&D beamer display) full-screen. The
 * component owns its session attachment; games without a companion redirect
 * to the mode picker.
 */
export function CompanionRoute() {
  const { def } = useGameShell();
  const Companion = def.companion?.component;
  if (!Companion) {
    return <Navigate to={`/play/${def.slug}`} replace />;
  }
  return (
    <Suspense fallback={null}>
      <Companion />
    </Suspense>
  );
}

/** Game-component `source` discriminator — surfaced from the hook module. */
// biome-ignore lint/style/useComponentExportOnlyModules: type re-export for callers that import GameSource alongside the route components
export type { GameSource };
