// What a voting night's picker leaves out before anyone sees it:
//
//   - drinking games (catalog `drinking: true`) when a non-drinker is coming;
//   - a campaign while it is ongoing — its sessions are planned as their own
//     nights (a fixed game), so the box shouldn't also compete in every vote.
//
// A campaign FAMILY is played as one story: The Crew's Deep Sea continues
// where Planet Nine ends, so the family is ongoing from the first recorded
// mission of either box until its finale mission is won.

import { CATALOG } from "./catalog.ts";

export type CampaignFamily = {
  id: string;
  /** Every box of the story; any recorded match starts the campaign. */
  slugs: readonly string[];
  /** The mission that ends the story: a won match of `slug` on "#<mission> …". */
  finale: { slug: string; mission: number };
};

export const CAMPAIGN_FAMILIES: readonly CampaignFamily[] = [
  {
    id: "bomb-busters",
    slugs: ["bomb-busters"],
    finale: { slug: "bomb-busters", mission: 66 },
  },
  {
    id: "the-crew",
    slugs: ["the-crew-quest-for-planet-nine", "the-crew-mission-deep-sea"],
    finale: { slug: "the-crew-mission-deep-sea", mission: 32 },
  },
];

/** Every slug that belongs to a campaign family — what the progress query reads. */
export const CAMPAIGN_FAMILY_SLUGS: readonly string[] = CAMPAIGN_FAMILIES.flatMap((f) => f.slugs);

/** The slice of a recorded match the ongoing-campaign rule reads. */
export type CampaignMatch = { slug: string; scenario: string | null; won: boolean };

/**
 * Slugs of every campaign family that has started (≥1 recorded match of any
 * of its boxes) and not yet won its finale mission.
 */
export function ongoingCampaignSlugs(matches: Iterable<CampaignMatch>): Set<string> {
  const started = new Set<string>();
  const finished = new Set<string>();
  for (const m of matches) {
    for (const f of CAMPAIGN_FAMILIES) {
      if (!f.slugs.includes(m.slug)) continue;
      started.add(f.id);
      const mission = m.scenario ? /^#(\d+)\b/.exec(m.scenario) : null;
      if (m.won && m.slug === f.finale.slug && Number(mission?.[1]) === f.finale.mission) {
        finished.add(f.id);
      }
    }
  }
  const out = new Set<string>();
  for (const f of CAMPAIGN_FAMILIES) {
    if (started.has(f.id) && !finished.has(f.id)) for (const s of f.slugs) out.add(s);
  }
  return out;
}

const DRINKING: ReadonlySet<string> = new Set(
  CATALOG.filter((g) => g.drinking === true).map((g) => g.slug),
);

/** A game played with drinks (Last One Drunk, Not Enough Mana). */
export function isDrinkingGame(slug: string): boolean {
  return DRINKING.has(slug);
}

/**
 * The games a still-voting night leaves out of its picker: every drinking
 * game when anyone coming is a non-drinker, and every ongoing campaign.
 */
export function pickerExclusions(opts: {
  nonDrinkerComing: boolean;
  ongoingCampaigns: ReadonlySet<string>;
}): Set<string> {
  const out = new Set(opts.ongoingCampaigns);
  if (opts.nonDrinkerComing) for (const s of DRINKING) out.add(s);
  return out;
}
