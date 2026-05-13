// Plain Node port of `packages/web/src/components/offline/bgg-helpers.ts`'s
// `stripBggHtml` — used both at runtime in the web client and here in the
// script (which can't import a `.tsx`). Mirror behavior 1:1.
//
// BGG's XML API returns descriptions with literal HTML entities and the
// occasional inline tag. We decode the common entities, drop tags, and
// collapse whitespace — enough to feed the model a clean string without
// markup distracting it from content.

export function stripBggHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rsquo;/g, "’")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#10;/g, "\n")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
