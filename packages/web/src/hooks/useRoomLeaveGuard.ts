import { useEffect } from "react";
import { useBlocker } from "react-router-dom";
import { useGameShell } from "./useGameShell";

// Message surfaced to the user when they try to leave the shell while
// the session is holding server-side state (a lobby seat, an in-flight
// solo session, or an mp game). Generic on purpose — the same wording
// covers all three contexts since the consequence is the same: the
// server-side commitment is dropped.
const CONFIRM_MESSAGE =
  "You're in an active game. Leave anyway? Your seat will be released and progress will be lost.";

/**
 * Two-layer guard against accidentally dropping an active room seat or
 * solo game session by navigating away from the `/play/:slug` shell.
 *
 *   1. **Tab close / reload (`beforeunload`).** When the session holds
 *      state — `mp.roomCode` is set (lobby or mp game) OR `game.view`
 *      is set (solo game in progress) — register a `beforeunload`
 *      listener that calls `preventDefault`. Modern browsers respond
 *      with their built-in "Leave site?" confirmation (we cannot
 *      customize the wording; browsers strip it). Removing the
 *      listener when state clears keeps the prompt out of the way when
 *      the user is just browsing.
 *
 *   2. **In-app navigation (`useBlocker`).** When the user clicks a
 *      `<Link>` or hits the back button and the next pathname is
 *      OUTSIDE `/play/:slug`, react-router's blocker pauses the
 *      navigation. We synchronously `window.confirm()` — keeping it
 *      simple is the goal here, not a styled modal; the dialog already
 *      reads as "leave?" UX. On accept we drop the seat / session,
 *      then `proceed`; on cancel we `reset` and stay where we are.
 *
 * Navigation WITHIN `/play/:slug/*` is intentional (mode select ↔ lobby
 * ↔ play, etc.) and never blocked — those transitions don't unmount
 * the shell layout, so the session stays alive throughout.
 */
export function useRoomLeaveGuard() {
  const { def, session, game, mp } = useGameShell();

  // The session is "active" whenever the user holds either a room seat
  // or an in-flight solo game. Both clear on `session.leaveRoom` /
  // `session.leaveSession`, so the guard tears down automatically once
  // the user explicitly leaves.
  const isActive = mp.roomCode !== null || game.view !== null;

  const blocker = useBlocker(({ nextLocation }) => {
    if (!isActive) return false;
    const target = nextLocation.pathname;
    const root = `/play/${def.slug}`;
    // Stay inside the shell subtree — those moves are intentional.
    if (target === root || target.startsWith(`${root}/`)) return false;
    return true;
  });

  // Drive the blocker state machine. When blocked, ask once; act on
  // the answer. The blocker object is stable per state transition; we
  // depend only on `state` to avoid firing the prompt every re-render
  // while still in the "blocked" state (the confirm itself is sync,
  // but the effect re-fires if React schedules another render before
  // we proceed/reset — depending on a primitive keeps it idempotent).
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    const ok = window.confirm(CONFIRM_MESSAGE);
    if (ok) {
      // Clean up both projections — leaveRoom is a no-op without a
      // room, leaveSession a no-op without a sessionId, so the order
      // doesn't matter and double-firing is safe.
      session.leaveRoom();
      session.leaveSession();
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker, session.leaveRoom, session.leaveSession]);

  useEffect(() => {
    if (!isActive) return;
    function handler(event: BeforeUnloadEvent) {
      // Modern browsers ignore the message string and show a built-in
      // dialog. `preventDefault()` is the signal that triggers the
      // prompt; the returnValue assignment is Chrome legacy.
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isActive]);
}
