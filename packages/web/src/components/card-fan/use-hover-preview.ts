import { useCallback, useEffect, useRef, useState } from "react";

/** How long a card is held under the pointer before its preview opens. */
export const PREVIEW_DELAY_MS = 1400;

/**
 * Hover-and-hold → a large preview of one card. The fan and any table that
 * shows playable-size cards share this so the gesture feels the same
 * everywhere: arm on pointer enter, cancel on leave, close on dismiss.
 */
export function useHoverPreview<T>(delay = PREVIEW_DELAY_MS) {
  const [preview, setPreview] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const arm = useCallback(
    (card: T) => {
      cancel();
      timer.current = setTimeout(() => setPreview(card), delay);
    },
    [cancel, delay],
  );

  const close = useCallback(() => {
    cancel();
    setPreview(null);
  }, [cancel]);

  useEffect(() => cancel, [cancel]);

  return { preview, arm, cancel, close };
}
