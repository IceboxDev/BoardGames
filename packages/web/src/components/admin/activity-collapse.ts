import type { ActivityEntry } from "@boardgames/core/protocol";

/** Greeting kind → the page(s) its call-to-action can open, and how to say it.
 * A kind lists several pages when its button lands on different screens for
 * different viewers (the arrival CTA opens a collection, or the catalog). */
const CTA_DESTINATION: Record<string, { pages: readonly string[]; label: string }> = {
  "purchase-vote-announce": { pages: ["purchase-vote"], label: "the vote screen" },
  "purchase-vote-reminder": { pages: ["purchase-vote"], label: "the vote screen" },
  arrival: { pages: ["profile-collection", "games"], label: "the collection" },
  spotlight: { pages: ["profile-skill"], label: "their skill page" },
};

/** Where a greeting's button leads, in words; undefined for kinds without a destination. */
export function ctaDestinationLabel(kind: string | undefined): string | undefined {
  return kind ? CTA_DESTINATION[kind]?.label : undefined;
}

const PAIR_WINDOW_MS = 60 * 1000;

function stamp(entry: ActivityEntry): number {
  const t = Date.parse(`${entry.createdAt.replace(" ", "T")}Z`);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Following a greeting's button and the page view of the screen it opened
 * are one action, logged twice. Drop the page view when it sits next to its
 * "followed" ack — on either side, because rows logged before the client
 * serialised its requests could land in either order. `entries` are newest
 * first, as the admin API returns them.
 */
export function collapseEntries(entries: ActivityEntry[]): ActivityEntry[] {
  const drop = new Set<number>();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.type !== "greeting-response" || entry.meta.action !== "cta") continue;
    const kind = typeof entry.meta.kind === "string" ? entry.meta.kind : "";
    const destination = CTA_DESTINATION[kind];
    if (!destination) continue;
    for (const j of [i - 1, i + 1]) {
      const near = entries[j];
      if (
        near &&
        !drop.has(near.id) &&
        near.type === "page-view" &&
        typeof near.meta.page === "string" &&
        destination.pages.includes(near.meta.page) &&
        Math.abs(stamp(near) - stamp(entry)) <= PAIR_WINDOW_MS
      ) {
        drop.add(near.id);
        break;
      }
    }
  }
  return drop.size === 0 ? entries : entries.filter((entry) => !drop.has(entry.id));
}
