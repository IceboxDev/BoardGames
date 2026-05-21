import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The state-machine shared by every "draft a list locally, save it on click"
 * panel — owns the draft, the toggle, the dirty check, and the
 * sync-from-loaded-data effect. Both `AdminPage`'s inventory panel and its
 * pre-register card used to inline near-identical copies of this.
 *
 * Equality is by `===` (i.e. `Array.prototype.includes`); intended for arrays
 * of primitives (slugs, ids). Pass mapped key arrays if your items are
 * objects.
 *
 * The hook does *not* own the mutation — the caller wires its own
 * `useMutation` and calls `mutate(list.draft)` from a save button. The hook
 * only manages the local draft and tells the caller whether it's worth
 * saving (`isDirty`). This keeps onSuccess invalidation policies, optimistic
 * cache writes, and error handling in the caller where they belong.
 */
export type EditableList<T> = {
  /** Current edits. `null` until the underlying data first loads. */
  draft: T[] | null;
  /** Last-known server state. `[]` while the query is pending — never `null`,
   *  so callers don't have to defend against an undefined committed list. */
  committed: T[];
  /** Add `item` if absent, remove it if present. No-op when not ready. */
  toggle: (item: T) => void;
  /** Replace the draft wholesale. Used by "Clear queue" style actions where
   *  the caller wants both the local view and the saved value to be empty. */
  replace: (next: T[]) => void;
  /** Reset the draft back to `committed`, discarding edits. */
  reset: () => void;
  /** True when `draft` differs in length or membership from `committed`.
   *  Always false while the list is not yet ready, so the Save button
   *  starts disabled. */
  isDirty: boolean;
  /** True once `draft` has been initialized from the server response. */
  isReady: boolean;
};

export function useEditableList<T>(loaded: T[] | undefined): EditableList<T> {
  const [draft, setDraft] = useState<T[] | null>(null);
  // Last `loaded` value we synced from, by content. The original inline
  // implementation used `[query.data]` as the effect dep, which works because
  // react-query gives a stable reference per data revision. To be robust
  // against callers (or tests) that synthesize a fresh array every render,
  // we also compare contents — same items in same order → skip the sync.
  // Without this guard the effect would loop forever: every render produces
  // a new array reference, the effect fires, setDraft replaces the previous
  // draft, which triggers another render, and so on.
  const lastSyncedRef = useRef<readonly T[] | undefined>(undefined);

  useEffect(() => {
    if (loaded === undefined) return;
    const last = lastSyncedRef.current;
    if (last === loaded) return;
    if (
      last !== undefined &&
      last.length === loaded.length &&
      last.every((x, i) => x === loaded[i])
    ) {
      return;
    }
    lastSyncedRef.current = loaded;
    setDraft(loaded);
  }, [loaded]);

  const toggle = useCallback((item: T) => {
    setDraft((prev) => {
      if (prev === null) return prev;
      return prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item];
    });
  }, []);

  const replace = useCallback((next: T[]) => {
    setDraft(next);
  }, []);

  const reset = useCallback(() => {
    setDraft(loaded ?? []);
  }, [loaded]);

  const committed = loaded ?? [];
  const isReady = draft !== null;
  const isDirty =
    draft !== null &&
    loaded !== undefined &&
    (draft.length !== loaded.length || draft.some((item) => !loaded.includes(item)));

  return { draft, committed, toggle, replace, reset, isDirty, isReady };
}
