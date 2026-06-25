/** Initials for an avatar fallback: first letters of the first and last words
 * (or the first two letters of a single word). "?" when there's nothing to show. */
export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    const word = parts[0];
    return (word.length === 1 ? word : word.slice(0, 2)).toUpperCase();
  }
  const first = parts[0][0] ?? "";
  const last = parts[parts.length - 1][0] ?? "";
  return (first + last).toUpperCase();
}
