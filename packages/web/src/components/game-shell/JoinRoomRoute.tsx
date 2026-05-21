import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useGameShell } from "../../hooks/useGameShell";
import { JoinRoom } from "../multiplayer";

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
 */
export default function JoinRoomRoute() {
  const navigate = useNavigate();
  const { def, mp } = useGameShell();

  useEffect(() => {
    if (mp.roomCode) {
      navigate(`/play/${def.slug}/mp/lobby/${mp.roomCode}`, { replace: true });
    }
  }, [mp.roomCode, def.slug, navigate]);

  return (
    <JoinRoom
      title={def.title}
      onCreateRoom={(name) => mp.createRoom(name)}
      onJoinRoom={(code, name) => mp.joinRoom(code, name)}
      onBack={() => navigate(`/play/${def.slug}`)}
      error={mp.error}
    />
  );
}
