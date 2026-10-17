import type { BotcView } from "@boardgames/core/games/blood-on-the-clocktower/online/view";
import { useEffect, useRef, useState } from "react";

// Timers and the vote clock are stamped in the server's time. A browser's
// clock can be seconds off, so countdowns read "server now": the local clock
// plus an offset learned from moments we know the server time of — a timer
// starting, the clock hand moving on — as those frames arrive.

let offset = 0;

function note(serverMs: number): void {
  offset = serverMs - Date.now();
}

/** The server's clock, re-read every `everyMs`. */
export function useServerNow(everyMs = 250): number {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

/**
 * Learn the offset from this view's fresh moments. The first values a page
 * sees are skipped: after a reload they may be old, and an old moment read as
 * "just now" would wind every countdown back.
 */
export function useServerClockSync(view: BotcView): void {
  const timerStart = view.day.timer?.startedAt ?? null;
  const tick = view.day.vote?.nextTickAt ?? null;
  const clockMs = view.config.voteClockMs;
  const seen = useRef<{ timer: number | null; tick: number | null } | null>(null);
  useEffect(() => {
    const last = seen.current;
    seen.current = { timer: timerStart, tick };
    if (!last) return;
    if (timerStart !== null && timerStart !== last.timer) note(timerStart);
    else if (tick !== null && tick !== last.tick) note(tick - clockMs);
  }, [timerStart, tick, clockMs]);
}
