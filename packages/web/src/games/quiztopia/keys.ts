// Keyboard helpers shared by the study card, the article page and the
// language toggle. Every screen-level shortcut runs through `isTypingTarget`
// so a key pressed inside a search field never flips a card.

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }
  return target.isContentEditable;
}

/** True for a plain key press — no modifier that would make it a browser chord. */
export function isPlainKey(e: KeyboardEvent): boolean {
  return !e.metaKey && !e.ctrlKey && !e.altKey;
}

/**
 * Marks an overlay whose keys must never reach the screen behind it — the
 * report form: Space or Enter on its buttons, 1/2 or Esc must not reveal,
 * grade or leave the study card underneath. Opt-in rather than "any modal",
 * because some modal sheets (the timeline's phone inspector) belong to the
 * screen and rely on its arrow keys.
 */
export const CAPTURES_KEYS_ATTR = "data-captures-keys";

export function keysCaptured(): boolean {
  return (
    typeof document !== "undefined" && document.querySelector(`[${CAPTURES_KEYS_ATTR}]`) !== null
  );
}

/**
 * Should a screen-level shortcut handle this key? Only a plain press, not
 * typed into a field, and not while an overlay captures the keys.
 */
export function isScreenShortcut(e: KeyboardEvent): boolean {
  return isPlainKey(e) && !isTypingTarget(e.target) && !keysCaptured();
}

/** Weekday + short date for a `YYYY-MM-DD` key, in the viewer's locale. */
export function weekdayName(dateKey: string, style: "long" | "short" = "long"): string {
  const [y, m, d] = dateKey.split("-").map((s) => Number.parseInt(s, 10));
  if (!y || !m || !d) return dateKey;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: style });
}
