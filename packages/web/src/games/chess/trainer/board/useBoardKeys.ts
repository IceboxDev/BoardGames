/**
 * The board's keys: ← and → step one move back and forward (the arrow keys do
 * nothing else here: no focus moving, no scrolling), F turns the board
 * around. Typing in a field is left alone.
 */
import { useEffect } from "react";

export function useBoardKeys(
  enabled: boolean,
  onStep: (delta: -1 | 1) => void,
  onFlip: () => void,
): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && t.closest("input, textarea, select, [contenteditable]"))
        return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key.startsWith("Arrow")) {
        // Caught before anything focused sees it.
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "ArrowLeft") onStep(-1);
        if (e.key === "ArrowRight") onStep(1);
      } else if (e.key === "f" || e.key === "F") {
        onFlip();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [enabled, onStep, onFlip]);
}
