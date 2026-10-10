import { useEffect, useEffectEvent } from "react";

/**
 * Elements that use the arrow keys themselves: fields, sliders, radio
 * groups, tabs, menus. Keys aimed at them are theirs. A focused button
 * isn't one: after clicking a move, ← and → should keep stepping.
 */
const ARROW_KEY_OWNERS =
  "input, textarea, select, [contenteditable=true], [role=slider], [role=radiogroup], [role=tablist], [role=listbox], [role=menu], [role=dialog]";

export interface StepHotkeys {
  /** ← / →. */
  step: (by: 1 | -1) => void;
  /** Home. */
  first: () => void;
  /** End. */
  last: () => void;
  /** Esc (e.g. leave a side line). */
  escape?: () => void;
  /** Off while something else owns the keyboard. */
  enabled?: boolean;
}

/** Step through a game's positions from the keyboard: ← → Home End, Esc. */
export function useStepHotkeys(keys: StepHotkeys): void {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (keys.enabled === false || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target instanceof Element && e.target.closest(ARROW_KEY_OWNERS)) return;
    switch (e.key) {
      case "ArrowLeft":
        keys.step(-1);
        break;
      case "ArrowRight":
        keys.step(1);
        break;
      case "Home":
        keys.first();
        break;
      case "End":
        keys.last();
        break;
      case "Escape":
        if (!keys.escape) return;
        keys.escape();
        break;
      default:
        return;
    }
    e.preventDefault();
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
