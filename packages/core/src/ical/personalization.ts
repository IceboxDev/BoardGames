// Pure title-prefix derivation for the personal iCalendar feed. Exactly one
// prefix wins per event; priority is:
//
//   1. [Not going] — viewer explicitly declined (rsvp:no). Trumps everything
//      else because it's the strongest signal about *their* night.
//   2. [RSVP!]     — viewer is in the expected set, hasn't manually said yes
//      yet (no row, or auto-yes from lock-time batch, or a stale yes that
//      was server-flagged as auto). They need to confirm.
//   3. [Vote?]     — viewer is a definite attendee, picks-lock isn't on yet,
//      and they have zero hype reactions. They should chime in on games.
//   4. [Bring: …]  — viewer is a definite attendee, picks-lock is on, and
//      the host has assigned them games from their inventory. Surfaces in
//      the title as an at-a-glance reminder; full list also in description.
//   5. ""           — nothing pressing. Title shows the plain base.
//
// The function is intentionally not async / not DB-aware — the caller
// gathers state from `computeAvailableGamesPayload` and passes a plain
// record. That keeps the priority logic in one tested place.

export type SummaryPrefixInput = {
  /** Snapshot of expectedUserIds at lock-time (locked_dates.expected_user_ids_json). */
  expectedUserIds: readonly string[];
  /** locked_dates.picks_locked_at — null when picks haven't been sealed yet. */
  picksLockedAt: string | null;
  viewerId: string;
  /** The viewer's current RSVP row status; undefined when no row exists. */
  viewerRsvp: "yes" | "no" | undefined;
  /** True only when the viewer's RSVP row is a real button click (auto=0). */
  viewerManuallyRsvped: boolean;
  /** True when the viewer has at least one hype reaction for this date. */
  viewerHyped: boolean;
  /** Already-resolved display titles, in the order the server assigned. */
  viewerBringing: readonly string[];
};

export function deriveSummaryPrefix(input: SummaryPrefixInput): string {
  // 1. Explicit decline wins. The viewer's "no" overrides every other state —
  // we still emit the event for awareness (it's happening for others), but
  // the title leads with [Not going].
  if (input.viewerRsvp === "no") return "[Not going]";

  // The viewer is a "definite" attendee if they're either marked yes OR they
  // were in the expected snapshot at lock-time. Matches the headcount math
  // used by `/api/calendar/games` and the offline dashboard.
  const isDefinite = input.viewerRsvp === "yes" || input.expectedUserIds.includes(input.viewerId);

  // 2. Needs to RSVP — in the expected set, but no manual confirmation yet.
  // We treat an auto-yes (the lock-time batch's row, or the modal-open
  // useEffect) as "hasn't really confirmed", because the user never clicked.
  if (
    input.expectedUserIds.includes(input.viewerId) &&
    !input.viewerManuallyRsvped &&
    input.viewerRsvp !== "yes"
  ) {
    return "[RSVP!]";
  }

  // 3. Needs to vote — picks aren't locked, viewer is a definite attendee,
  // they haven't hyped anything yet. The host is still gathering signal.
  if (isDefinite && input.picksLockedAt === null && !input.viewerHyped) {
    return "[Vote?]";
  }

  // 4. What to bring — picks are sealed and the host's rarity-first
  // assignment landed games on this viewer's plate. Titles only, max ~3 for
  // legibility on phone notification rows.
  if (isDefinite && input.picksLockedAt !== null && input.viewerBringing.length > 0) {
    const head = input.viewerBringing.slice(0, 3).join(", ");
    const more = input.viewerBringing.length > 3 ? ` +${input.viewerBringing.length - 3}` : "";
    return `[Bring: ${head}${more}]`;
  }

  return "";
}

export function buildSummary(prefix: string, hostName: string | null): string {
  const base = hostName ? `Game Night — Host ${hostName}` : "Game Night";
  return prefix ? `${prefix} ${base}` : base;
}
