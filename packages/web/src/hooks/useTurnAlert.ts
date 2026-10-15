import { useEffect } from "react";

/** How often a hidden tab's title blinks while it waits on this player. */
export const TURN_ALERT_BLINK_MS = 1000;

/**
 * Marks the browser tab while the game is waiting on this player:
 * `● Your clue — <title>`. While the tab is hidden the mark blinks (title
 * and mark alternate), the one signal a player in another tab or window
 * reliably notices; once they look, it holds steady. `null` — nothing is
 * waiting on them — puts the title back.
 *
 * Games with one active player can feed it `isMyTurn`; games where several
 * seats act at once (Codenames) pass what this seat must do right now.
 */
export function useTurnAlert(label: string | null): void {
  useEffect(() => {
    if (label === null) return;
    const original = document.title;
    const lit = `● ${label} — ${original}`;
    let shown = true;
    document.title = lit;

    const blink = setInterval(() => {
      if (document.hidden) {
        shown = !shown;
        document.title = shown ? lit : original;
      } else if (document.title !== lit) {
        shown = true;
        document.title = lit;
      }
    }, TURN_ALERT_BLINK_MS);
    const onVisible = () => {
      if (!document.hidden) {
        shown = true;
        document.title = lit;
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(blink);
      document.removeEventListener("visibilitychange", onVisible);
      document.title = original;
    };
  }, [label]);
}
