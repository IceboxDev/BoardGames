// Custom wallpaper persistence for the background theme. The storage key is a
// contract with the theme engine — do not change it without a migration.

const STORAGE_KEY = "bg-theme-wallpaper-v1";

// Maximum accepted size of the data URL itself, i.e. bytes AFTER base64
// encoding. Data URLs are ASCII, so string length equals the encoded byte
// count (localStorage stores UTF-16, so the on-disk cost is roughly double).
const MAX_BYTES = 2 * 1024 * 1024;

export function readWallpaper(): string | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    // Re-apply the store-side validation so a value written under this key by
    // another build or by hand never reaches the theme engine as a wallpaper.
    return stored?.startsWith("data:image/") ? stored : null;
  } catch {
    return null;
  }
}

export function storeWallpaper(dataUrl: string): { ok: true } | { ok: false; reason: string } {
  if (!dataUrl.startsWith("data:image/")) {
    return { ok: false, reason: "Only image data URLs can be stored as a wallpaper." };
  }
  if (dataUrl.length > MAX_BYTES) {
    return { ok: false, reason: "Wallpaper is too large — the limit is 2MB after encoding." };
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, dataUrl);
    return { ok: true };
  } catch {
    return { ok: false, reason: "Could not save the wallpaper — storage is full or unavailable." };
  }
}

export function clearWallpaper(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
