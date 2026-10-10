import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** The history-state flag on a solo game's entry. */
const IN_GAME = "soloGame";

function isInGame(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    (state as Record<string, unknown>)[IN_GAME] === true
  );
}

/**
 * A solo game sits one browser-history entry above its setup screen, on the
 * same URL. The setup screen and the game are one route (the game component
 * switches on its phase), so without this Back — the browser's or the top
 * nav's, which steps back through history — skipped the setup screen and
 * landed on the game's menu.
 *
 * `enterGame` pushes the entry as a game starts from the setup screen;
 * `exitGame` ("Change Setup") pops it. Whenever the entry is popped — by
 * either — `leaveGame` returns the component to its setup screen.
 */
export function useSoloGameHistory(enabled: boolean, leaveGame: () => void) {
  const navigate = useNavigate();
  const location = useLocation();
  const inGame = enabled && isInGame(location.state);
  // Set when this mount pushed the entry, so popping it stays inside the app.
  const pushed = useRef(false);

  // Leave only on the game entry being popped — not merely on being off it
  // (a game that was just started may not have its entry yet).
  const wasInGame = useRef(inGame);
  useEffect(() => {
    if (wasInGame.current && !inGame) leaveGame();
    wasInGame.current = inGame;
  }, [inGame, leaveGame]);

  const enterGame = useCallback(() => {
    if (!enabled || inGame) return;
    pushed.current = true;
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { state: { ...(location.state as object | null), [IN_GAME]: true } },
    );
  }, [enabled, inGame, navigate, location]);

  const exitGame = useCallback(() => {
    if (!inGame) {
      leaveGame();
      return;
    }
    if (pushed.current) {
      pushed.current = false;
      navigate(-1);
      return;
    }
    // Arrived on the game's entry some other way (a reload): drop the flag in place.
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { replace: true, state: { ...(location.state as object | null), [IN_GAME]: false } },
    );
  }, [inGame, leaveGame, navigate, location]);

  return { enterGame, exitGame };
}
