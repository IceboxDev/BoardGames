// Each campaign game's relic, one image per headcount with the number painted
// into the art (assets/campaign-relics, built by `pnpm card-art --game=relics`
// from components/offline/CAMPAIGN-RELIC-PROMPTS.md). Only URLs are bundled;
// a calendar loads just the images of the nights it shows.

const FILES = import.meta.glob<string>("../assets/campaign-relics/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

const URLS = new Map<string, string>();
for (const [file, url] of Object.entries(FILES)) {
  const name = file.slice(file.lastIndexOf("/") + 1, -".webp".length);
  URLS.set(name, url);
}

/**
 * The relic for a campaign night of `count` people: the image with that
 * number, or `12plus` for twelve or more when the game has one. Undefined when
 * no image was generated for the count — the cell then shows no relic rather
 * than a wrong or blank one.
 */
export function relicUrl(slug: string, count: number): string | undefined {
  return (
    URLS.get(`relic-${slug}-${count}`) ??
    (count >= 12 ? URLS.get(`relic-${slug}-12plus`) : undefined)
  );
}
