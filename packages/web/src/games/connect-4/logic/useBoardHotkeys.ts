import { useEffect, useEffectEvent, useState } from "react";

export interface BoardHotkeys {
  cols: number;
  /** The viewer may move now (drop / pop keys act only then). */
  myTurn: boolean;
  drop: (column: number) => void;
  pop: (column: number) => void;
  /** Null when hints aren't offered right now. */
  hint: (() => void) | null;
  /** Null when the evaluation bar isn't offered. */
  toggleEval: (() => void) | null;
}

/** Keys typed into these belong to them — Enter on a focused button presses that button. */
const OWN_KEYS =
  "input, textarea, select, button, a[href], [role=button], [role=dialog], [contenteditable=true]";

/**
 * The board's keyboard: 1–9 drop in that column, ←/→ pick a column,
 * Enter/Space drop there, P pop it, H hint, E evaluation bar. Returns the
 * picked column (null until an arrow is pressed). Keys aimed at a control
 * (a focused button, a field, a dialog) are left alone.
 */
export function useBoardHotkeys(keys: BoardHotkeys): number | null {
  const [focus, setFocus] = useState<number | null>(null);

  // An effect event: the listener is bound once and always sees the latest keys and focus.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest(OWN_KEYS)) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= keys.cols) {
      if (!keys.myTurn) return;
      keys.drop(n - 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const dir = e.key === "ArrowLeft" ? -1 : 1;
      setFocus((f) =>
        f === null ? Math.floor(keys.cols / 2) : Math.max(0, Math.min(keys.cols - 1, f + dir)),
      );
    } else if ((e.key === "Enter" || e.key === " ") && focus !== null && keys.myTurn) {
      keys.drop(focus);
    } else if ((e.key === "p" || e.key === "P") && focus !== null && keys.myTurn) {
      keys.pop(focus);
    } else if ((e.key === "h" || e.key === "H") && keys.hint) {
      keys.hint();
    } else if ((e.key === "e" || e.key === "E") && keys.toggleEval) {
      keys.toggleEval();
    } else {
      return;
    }
    e.preventDefault();
  });

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A board resized under the focus (a new series' board can't, but be safe).
  return focus !== null && focus < keys.cols ? focus : null;
}
