import type { Color } from "@boardgames/core/games/chess/engine/types";
import type { ClockView } from "@boardgames/core/games/chess/schemas";
import { useEffect, useMemo, useState } from "react";

/** Under this, the clock turns red and the low-time sound plays. */
export const LOW_TIME_MS = 20_000;

/**
 * Milliseconds left for `color`, counting down locally from the last view.
 * The server is the only timekeeper; this counts from when the view ARRIVED
 * (not the server's wall clock), so a skewed device clock can't distort it.
 */
export function useClockMs(clock: ClockView | null, color: Color): number | null {
  const receivedAt = useMemo(() => (clock ? performance.now() : 0), [clock]);
  const running = clock?.running === color;
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last = 0;
    const tick = (t: number) => {
      // Ten updates a second is plenty, even for tenths.
      if (t - last >= 100) {
        last = t;
        setNow(performance.now());
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  if (!clock) return null;
  const base = clock.remainingMs[color];
  return running ? Math.max(0, base - Math.max(0, now - receivedAt)) : base;
}
