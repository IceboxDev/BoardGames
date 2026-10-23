import { DND_SLUG } from "./dnd";

// Campaign nights generalise the D&D-night treatment: once a night's picks are
// sealed and the vote winner is a campaign game, the calendar cell, the RSVP
// modal and the calendar feed all switch into that game's night — one game on
// the table, its relic carrying the headcount, the party and who brings the
// box. D&D is one of them, keeping its own words (the Dungeon Master, the
// quest) in `dnd.ts`; this module owns the list and the copy every surface
// shares, so the feed and the web can never disagree on which night is which.

export type CampaignNight = {
  slug: string;
  /** Short name for "<night> night" labels ("The Crew · Deep Sea"). */
  night: string;
  /** What the party is called ("mercenaries"). */
  party: string;
  /** Rest of "A party of N <party> …" ("descends beneath the city"). */
  flavor: string;
  /** What players bring, in one line. */
  bring: string;
  /**
   * True when an owner brings the box (the keeper). False for D&D, where the
   * Dungeon Master runs the table and nobody carries a box.
   */
  keeper: boolean;
};

const night = (
  slug: string,
  name: string,
  party: string,
  flavor: string,
  bring: string,
  keeper = true,
): CampaignNight => ({ slug, night: name, party, flavor, bring, keeper });

export const CAMPAIGN_NIGHTS: readonly CampaignNight[] = [
  night(
    DND_SLUG,
    "D&D",
    "adventurers",
    "gathers by torchlight",
    "Bring your dice and character sheet — the Dungeon Master has the rest.",
    false,
  ),
  night(
    "gloomhaven",
    "Gloomhaven",
    "mercenaries",
    "descends beneath the city",
    "Bring your character box and ability cards.",
  ),
  night(
    "frosthaven",
    "Frosthaven",
    "mercenaries",
    "braves the frozen outpost",
    "Bring your character box and campaign sheet.",
  ),
  night(
    "gloomhaven-jaws-of-the-lion",
    "Jaws of the Lion",
    "mercenaries",
    "takes the next job",
    "Bring your character mat and cards.",
  ),
  night("heroquest", "HeroQuest", "heroes", "sets out on the next quest", "Bring your hero sheet."),
  night(
    "legends-of-andor",
    "Andor",
    "heroes",
    "rides out to defend Andor",
    "Bring your hero board if you took it home.",
  ),
  night(
    "slay-the-spire",
    "Slay the Spire",
    "climbers",
    "climbs into the next act",
    "Nothing to bring — the save sheet is in the box.",
  ),
  night(
    "aeons-end",
    "Aeon’s End",
    "breach mages",
    "holds Gravehold against the next nemesis",
    "Nothing to bring — the nemesis and its tracker stay in the box.",
  ),
  night(
    "vantage",
    "Vantage",
    "explorers",
    "wakes on an unknown world",
    "Bring the notes from your last session.",
  ),
  night(
    "escape-tales-the-awakening",
    "Escape Tales",
    "investigators",
    "picks up the story where it stopped",
    "Nothing else to bring.",
  ),
  night(
    "arcs",
    "Arcs",
    "players",
    "plays the next act of the campaign",
    "Nothing to bring — the campaign box keeps the progress.",
  ),
  night(
    "dorfromantik",
    "Dorfromantik",
    "builders",
    "lays the next stretch of the landscape",
    "Nothing to bring — the campaign box keeps the progress.",
  ),
  night(
    "war-with-the-evil-power-master",
    "Evil Power Master",
    "Rapid Force crew members",
    "chases the Evil Power Master",
    "Nothing to bring — the story book marks where you stopped.",
  ),
  night(
    "bomb-busters",
    "Bomb Busters",
    "bomb busters",
    "takes on the next mission",
    "Nothing to bring — mission progress lives in the box.",
  ),
  night(
    "the-crew-mission-deep-sea",
    "The Crew · Deep Sea",
    "crew members",
    "dives on to the next mission",
    "Nothing to bring — the logbook stays in the box.",
  ),
  night(
    "the-crew-quest-for-planet-nine",
    "The Crew · Planet Nine",
    "astronauts",
    "pushes on toward Planet Nine",
    "Nothing to bring — the logbook stays in the box.",
  ),
  night("sky-team", "Sky Team", "pilots", "brings the next plane down", "Nothing to bring."),
  night(
    "codenames-duet",
    "Codenames Duet",
    "agents",
    "takes the next city on the mission map",
    "Nothing to bring.",
  ),
];

const BY_SLUG = new Map(CAMPAIGN_NIGHTS.map((c) => [c.slug, c]));

/** The campaign entry for a slug, or null when the game isn't a campaign. */
export function campaignBySlug(slug: string | null | undefined): CampaignNight | null {
  return (slug && BY_SLUG.get(slug)) || null;
}

/**
 * The campaign night a locked night has become: picks sealed AND the vote
 * winner is a campaign game. Before picks lock the normal voting visuals stay
 * in play even if a campaign is leading — the night isn't committed yet.
 */
export function campaignNightFor(
  picksLockedAt: string | null | undefined,
  topSlug: string | null | undefined,
): CampaignNight | null {
  return picksLockedAt ? campaignBySlug(topSlug) : null;
}

type KeeperCandidate = {
  userId: string;
  isHost: boolean;
  status: string;
  bringing: readonly string[];
};

/**
 * Who brings the box: the host when they're bringing it, else the first
 * confirmed attendee bringing it, else the host. Null for D&D (no box) and
 * when nobody qualifies.
 */
export function pickKeeper<T extends KeeperCandidate>(
  attendees: readonly T[],
  campaign: CampaignNight,
): T | null {
  if (!campaign.keeper) return null;
  const brings = (a: T) => a.bringing.includes(campaign.slug);
  return (
    attendees.find((a) => a.isHost && brings(a)) ??
    attendees.find((a) => a.status === "definite" && brings(a)) ??
    attendees.find((a) => a.isHost) ??
    null
  );
}

// ── Calendar feed ─────────────────────────────────────────────────────

/** One member of the party roster in a campaign-night calendar event. */
export type CampaignPartyMember = {
  name: string;
  /** Brings the box tonight. */
  keeper: boolean;
  host: boolean;
  /** A "maybe" — RSVP'd tentative rather than confirmed. */
  tentative: boolean;
};

/**
 * The campaign-night event title: the game's night, with the host in the
 * byline. Same personal-prefix discipline as `buildSummary`.
 */
export function buildCampaignSummary(
  prefix: string,
  title: string,
  hostName: string | null,
): string {
  const base = hostName ? `${title} night — Host ${hostName}` : `${title} night`;
  return prefix ? `${prefix} ${base}` : base;
}

/**
 * The campaign-night event description, mirroring the web panel: the
 * campaign, the party line, who brings the box and what to bring, an optional
 * personal nudge, the roster and the deep link. No other game is named — the
 * night has exactly one on the table.
 */
export function buildCampaignDescription(opts: {
  campaign: CampaignNight;
  /** The game's display title ("Gloomhaven: Jaws of the Lion"). */
  title: string;
  partyCount: number;
  tentativeCount: number;
  keeperName: string | null;
  party: readonly CampaignPartyMember[];
  personalNudge?: string | null;
  deepLink?: string | null;
}): string {
  const {
    campaign,
    title,
    partyCount,
    tentativeCount,
    keeperName,
    party,
    personalNudge,
    deepLink,
  } = opts;
  const lines: string[] = [];

  lines.push(`Tonight's campaign: ${title}.`);
  lines.push(`A party of ${partyCount} ${campaign.party} ${campaign.flavor}.`);
  lines.push("");
  lines.push(keeperName ? `${keeperName} brings the box. ${campaign.bring}` : campaign.bring);

  if (personalNudge) {
    lines.push("");
    lines.push(personalNudge);
  }

  if (party.length > 0) {
    lines.push("");
    const counts = [`${partyCount} confirmed`];
    if (tentativeCount > 0) counts.push(`${tentativeCount} maybe`);
    lines.push(`The party (${counts.join(", ")}):`);
    for (const m of party) {
      let line = `• ${m.name}`;
      if (m.keeper) line += " — brings the box";
      if (m.host) line += " (host)";
      if (m.tentative) line += " (maybe)";
      lines.push(line);
    }
  }

  if (deepLink) {
    lines.push("");
    lines.push(`Open: ${deepLink}`);
  }

  return lines.join("\n");
}
