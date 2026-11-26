import { useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// Which page each entry of this tab's history holds, so Back can return to a
// page's parent where it already sits in history instead of stepping through
// every entry since. Without it, Game → Menu → Game → Menu … each added an
// entry, and Back walked them all before reaching the game browser.
//
// The router numbers entries (`history.state.idx`); an entry's record is
// rewritten every time it is shown, so every entry behind the current one
// holds what that entry really is. Kept in sessionStorage: one per tab, like
// the history itself, and it survives a reload.

const KEY = "history-trail";

function read(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function write(trail: Record<string, string>) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(trail));
  } catch {
    // Storage refused (private mode): Back falls back to one step.
  }
}

/** The router's index of the entry being shown (0 = the tab's first in-app page). */
export function currentHistoryIndex(): number {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === "number" ? idx : 0;
}

/** A path as the trail keys it: pathname (no trailing slash) plus search. */
function pathKey(to: string): string {
  const url = new URL(to, window.location.origin);
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  return `${pathname}${url.search}`;
}

/** Records the entry being shown. Mounted once, at the root. */
export function HistoryTrailRecorder() {
  const location = useLocation();
  useEffect(() => {
    const trail = read();
    trail[String(currentHistoryIndex())] = pathKey(`${location.pathname}${location.search}`);
    write(trail);
  }, [location]);
  return null;
}

/** How many steps back the nearest earlier entry showing `to` is — or null. */
export function stepsBackTo(to: string, from = currentHistoryIndex()): number | null {
  const trail = read();
  const target = pathKey(to);
  for (let i = from - 1; i >= 0; i--) {
    if (trail[String(i)] === target) return from - i;
  }
  return null;
}

/**
 * How many steps back the page this one was opened FROM is: the nearest
 * earlier entry that is neither this page nor a page beneath it (a solo game
 * under its menu, a room under its game). So Back returns where the player
 * came from — the players list, not the dashboard — while Menu → Game → Menu
 * trips still collapse into one step back. Null when every entry behind is
 * this page or beneath it (Back then opens the page's parent).
 */
export function stepsBackOut(from = currentHistoryIndex()): number | null {
  const trail = read();
  const here = trail[String(from)];
  if (here === undefined) return from > 0 ? 1 : null;
  const base = pathOnly(here);
  for (let i = from - 1; i >= 0; i--) {
    const entry = trail[String(i)];
    if (entry === undefined) return from - i;
    const path = pathOnly(entry);
    if (path === base || (base !== "/" && path.startsWith(`${base}/`))) continue;
    return from - i;
  }
  return null;
}

function pathOnly(key: string): string {
  const q = key.indexOf("?");
  return q === -1 ? key : key.slice(0, q);
}

/**
 * Goes to `to` by going back to it where it already is in history, else
 * opens it as a new entry. For "back to the menu"-style buttons.
 */
export function useGoBackTo(): (to: string) => void {
  const navigate = useNavigate();
  return useCallback(
    (to: string) => {
      const steps = stepsBackTo(to);
      if (steps !== null) navigate(-steps);
      else navigate(to);
    },
    [navigate],
  );
}
