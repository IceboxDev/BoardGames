// Dungeons & Dragons gets a bespoke calendar-feed treatment that mirrors the
// web's D&D-night panel (`web/src/components/offline/DndNightPanel.tsx`): once a
// night's picks are sealed and the vote winner is D&D, the iCalendar event drops
// the generic "Game Night / Top picks / bring X" shape and becomes a single
// themed quest — title, party roster, and copy all in D&D voice, with no
// references to any other game. Detection matches `web/src/lib/dnd-night.ts`
// (`isDndNight`): picks locked AND `topGameSlug` === the slug. The server passes
// `topSlugs[0]`, which `topGameSlug` always equals.

/**
 * Catalog slug for the Dungeons & Dragons entry (homebrew, BGG id 0). Canonical
 * here and re-exported by `web/src/lib/dnd-night.ts` so the calendar feed and the
 * web grid/modal can never disagree on which night is a D&D night.
 */
export const DND_SLUG = "dungeons-and-dragons";

/**
 * True when a locked night should render its D&D calendar treatment: picks are
 * sealed AND the per-night vote winner is D&D. Before picks lock the normal
 * voting visuals stay in play even if D&D is leading — the night isn't committed
 * yet (matches the web trigger).
 */
export function isDndFeedNight(picksLockedAt: string | null, topSlug: string | undefined): boolean {
  return picksLockedAt !== null && topSlug === DND_SLUG;
}

/** One member of the party roster in a D&D-night calendar event. */
export type DndPartyMember = {
  name: string;
  /** The Dungeon Master runs the table; everyone else is a player. */
  role: "dm" | "host" | "player";
  /** A "maybe" — RSVP'd tentative rather than confirmed. */
  tentative: boolean;
};

/**
 * The D&D-night event title. Same personal-prefix discipline as `buildSummary`
 * ([Not going] / [RSVP!] still apply on a sealed night), but the base reads as
 * the quest itself rather than "Game Night — Host X", and the Dungeon Master
 * takes the host's place in the byline.
 */
export function buildDndSummary(prefix: string, dmName: string | null): string {
  const base = dmName ? `🐉 Dungeons & Dragons — DM ${dmName}` : "🐉 Dungeons & Dragons";
  return prefix ? `${prefix} ${base}` : base;
}

/**
 * The D&D-night event description. Mirrors the web panel's copy: the quest, the
 * torchlit party-size line, the "bring nothing but your dice" note, an optional
 * personal nudge (decline / RSVP), the party roster (Dungeon Master crowned), and
 * the deep link. Deliberately omits "Top picks" / "You're bringing" — a D&D night
 * has exactly one game on the table.
 */
export function buildDndDescription(opts: {
  /** Confirmed (definite) headcount — the party size. */
  partyCount: number;
  /** Maybes who haven't confirmed. */
  tentativeCount: number;
  party: readonly DndPartyMember[];
  /** Themed decline / RSVP line for the viewer, or null when nothing's pressing. */
  personalNudge?: string | null;
  deepLink?: string | null;
}): string {
  const { partyCount, tentativeCount, party, personalNudge, deepLink } = opts;
  const lines: string[] = [];

  lines.push("Tonight's quest: Dungeons & Dragons.");
  lines.push(
    `A party of ${partyCount} ${partyCount === 1 ? "adventurer" : "adventurers"} gathers by torchlight.`,
  );
  lines.push("");
  lines.push(
    "Bring nothing but your dice, your character sheet, and your courage — the Dungeon Master has the rest.",
  );

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
      if (m.role === "dm") {
        line += " — Dungeon Master";
      } else {
        if (m.role === "host") line += " (host)";
        if (m.tentative) line += " (maybe)";
      }
      lines.push(line);
    }
  }

  if (deepLink) {
    lines.push("");
    lines.push(`Open: ${deepLink}`);
  }

  return lines.join("\n");
}
