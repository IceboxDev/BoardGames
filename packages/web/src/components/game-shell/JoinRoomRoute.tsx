import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrentUser } from "../../hooks/useCurrentUser.ts";
import { useGameShell } from "../../hooks/useGameShell";
import { JoinRoom } from "../multiplayer";

function resolvePlayerName(sessionName: string | null | undefined): string {
  const trimmed = sessionName?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "Player";
}

/**
 * Route element at `/play/:slug/mp/join`. Wraps the generic `<JoinRoom>`
 * form with the shell's mp projection.
 *
 * Once `mp.createRoom` (or `joinRoom`) succeeds the server pushes
 * `room-created` / `room-joined` and `mp.roomCode` becomes set. The
 * effect below observes that transition and navigates to the lobby URL
 * for that code — which becomes the canonical "I am in this room" URL.
 * Refresh on `/mp/lobby/:roomCode` later re-attaches via the rejoin path
 * baked into the lobby route.
 *
 * The player name comes from the auth session — every visitor is signed
 * in, so prompting for a name on top of that is redundant. We also clear
 * any stale connection error on mount so a previous "Host left the room"
 * / "Room ABCD not found" notice from an earlier session doesn't follow
 * the user back to this clean-slate entry screen.
 */
export default function JoinRoomRoute() {
  const navigate = useNavigate();
  const { def, mp, session } = useGameShell();
  const { user } = useCurrentUser();
  const playerName = resolvePlayerName(user?.name);

  // Wipe any error left over from the previous MP attempt — a "Host left"
  // close or a "Room ABCD not found" rejoin failure shouldn't greet the
  // user when they come back to start fresh.
  useEffect(() => {
    session.clearError();
    // Run once on mount; clearError is stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mp.roomCode) {
      navigate(`/play/${def.slug}/mp/lobby/${mp.roomCode}`, { replace: true });
    }
  }, [mp.roomCode, def.slug, navigate]);

  return (
    <JoinRoom
      title={def.title}
      onCreateRoom={() => mp.createRoom(playerName)}
      onJoinRoom={(code) => mp.joinRoom(code, playerName)}
      onBack={() => navigate(`/play/${def.slug}`)}
      error={mp.error}
    />
  );
}
