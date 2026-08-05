// Compact display form of a Google-Places-style formatted address. The full
// string ("Musterstraße 118, 60316 Frankfurt am Main, Germany") is right for
// the maps link, but on a phone header every character counts — the country
// is implied and the postal code is noise a guest never navigates by.
//
// Only a LEADING 4-5 digit token is treated as a postal code (German format
// puts it before the city), so house numbers — which live at the END of the
// street part — are never touched.

const COUNTRY_RE = /^(germany|deutschland)$/i;

export function compactAddress(full: string): string {
  const parts = full
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length > 1 && COUNTRY_RE.test(parts[parts.length - 1])) {
    parts.pop();
  }
  const cleaned = parts
    .map((p, i) => (i === 0 ? p : p.replace(/^\d{4,5}\s+/, "").trim()))
    .filter(Boolean);
  return cleaned.join(", ");
}
