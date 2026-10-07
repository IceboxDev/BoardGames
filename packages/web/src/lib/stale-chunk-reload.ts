// A deploy replaces every hashed chunk, so a tab opened before it 404s the
// first time it lazy-loads something new (a route, a game, a Quiztopia card).
// Vite announces that as `vite:preloadError`; the only real cure is a fresh
// page, which picks up the new manifest. One reload per window: if the very
// next load fails too, the chunk is genuinely broken and the error surfaces
// normally instead of looping.

export const CHUNK_RELOAD_KEY = "boardgames.chunkReloadAt";
export const CHUNK_RELOAD_WINDOW_MS = 30_000;

interface ReloadDeps {
  now: () => number;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  reload: () => void;
}

/** Whether to recover from a failed chunk by reloading; records the attempt when it does. */
export function shouldReloadForChunkError(deps: Omit<ReloadDeps, "reload">): boolean {
  // Without storage no loop guard is possible, so never reload at all.
  const { storage } = deps;
  if (!storage) return false;
  const now = deps.now();
  try {
    const last = Number(storage.getItem(CHUNK_RELOAD_KEY)) || 0;
    if (now - last < CHUNK_RELOAD_WINDOW_MS) return false;
    storage.setItem(CHUNK_RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  return true;
}

function sessionStorageOrNull(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function installStaleChunkReload(
  deps: ReloadDeps = {
    now: Date.now,
    storage: sessionStorageOrNull(),
    reload: () => window.location.reload(),
  },
): () => void {
  const onError = (event: Event) => {
    if (!shouldReloadForChunkError(deps)) return;
    // Swallow the import error: the page is going away.
    event.preventDefault();
    deps.reload();
  };
  window.addEventListener("vite:preloadError", onError);
  return () => window.removeEventListener("vite:preloadError", onError);
}
