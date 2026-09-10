import type { ActivityEntry } from "@boardgames/core/protocol";

/** Greeting kind → the page its call-to-action opens (and how to say it). */
const CTA_DESTINATION: Record<string, { page: string; label: string }> = {
  "purchase-vote-announce": { page: "purchase-vote", label: "the vote screen" },
  "purchase-vote-reminder": { page: "purchase-vote", label: "the vote screen" },
  "purchase-vote-result": { page: "games", label: "the games catalog" },
  spotlight: { page: "profile-skill", label: "their skill page" },
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
        near.meta.page === destination.page &&
        Math.abs(stamp(near) - stamp(entry)) <= PAIR_WINDOW_MS
      ) {
        drop.add(near.id);
        break;
      }
    }
  }
  return drop.size === 0 ? entries : entries.filter((entry) => !drop.has(entry.id));
}
