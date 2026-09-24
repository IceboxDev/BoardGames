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

/** Weekday + short date for a `YYYY-MM-DD` key, in the viewer's locale. */
export function weekdayName(dateKey: string, style: "long" | "short" = "long"): string {
  const [y, m, d] = dateKey.split("-").map((s) => Number.parseInt(s, 10));
  if (!y || !m || !d) return dateKey;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: style });
}
