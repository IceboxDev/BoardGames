/**
 * Build a synthetic, non-routable email for a guest player stub. Guests are
 * created as real Better-Auth users (so existing match-history endpoints
 * accept their `userId`) but with no credential account — they can't sign
 * in, which is enforced server-side by refusing password creation against
 * `@guest.local`.
 *
 * The slug part is lower-cased and stripped of anything outside `[a-z0-9.]`
 * so the resulting address survives email-validation rules upstream. The
 * 8-char random suffix keeps two guests with the same name unique.
 *
 * Returns `null` if either input is blank — callers surface that as a
 * validation error rather than building a malformed email.
 */
export function synthesizeGuestEmail(
  first: string,
  last: string,
  randomSuffix: () => string = defaultRandomSuffix,
): { email: string; name: string } | null {
  const f = first.trim();
  const l = last.trim();
  if (!f || !l) return null;
  const name = `${f} ${l}`;
  const normalized = `${f}.${l}`
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-|-$/g, "");
  // A slug made of only delimiters (e.g. "." or "-." for inputs like "@@@"
  // and "###") would yield `guest...suffix@guest.local`, which is not a
  // valid email local-part. Require at least one a-z0-9 character to keep
  // the slug; otherwise fall back to "player".
  const slug = /[a-z0-9]/.test(normalized) ? normalized : "player";
  const suffix = randomSuffix();
  const email = `guest.${slug}.${suffix}@guest.local`;
  return { email, name };
}

function defaultRandomSuffix(): string {
  return crypto.randomUUID().slice(0, 8);
}
