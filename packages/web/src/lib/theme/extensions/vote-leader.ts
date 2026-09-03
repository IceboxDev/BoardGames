import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "../../../hooks/useCurrentUser.ts";
import { fetchCalendarLocks } from "../../calendar-locks.ts";
import { resolveGame } from "../../games-by-slug.ts";
import { dateKey } from "../../offline-availability.ts";
import { qk } from "../../query-keys.ts";

// Theme-engine extension: when the user's theme runs in `accentMode:
// "night-sync"`, tint the app with the accent of the next locked game
// night's leading game — the night vote's `topGameSlug`, the same field the
// D&D and EXIT night takeovers read. Unlike those takeovers (which also
// require the sealed `picksLockedAt` before committing to their treatment),
// this accent deliberately tracks the *current* vote leader: a subtle tint
// may shift while voting is still open, where a full-board takeover may
// not. The engine discovers this module via
// `import.meta.glob("./extensions/*.ts{,x}")` and calls `useAccentOverride`
// on every provider render, applying the first non-null hex through its
// color-ramp generator.
//
// Deliberately reads only the night vote's `topGameSlug`. The purchase-poll
// tally is hidden from non-admin clients while a poll is open, so it is not
// a usable accent source here.

/**
 * Accent hex of the nearest locked night (today or later) that has a vote
 * leader, or null when there is no such night, the slug resolves to no
 * catalog game, the locks query hasn't produced data, or the user is logged
 * out (the query is disabled then, so public pages never hit the API).
 */
function useAccentOverride(): string | null {
  const { user } = useCurrentUser();
  const locksQuery = useQuery({
    queryKey: qk.calendarLocks(),
    queryFn: ({ signal }) => fetchCalendarLocks(signal),
    // Existing calendarLocks consumers rely on the app-wide default
    // (lib/query-client.ts). Restate it here so this always-mounted hook
    // keeps the same refetch cadence even under a different provider.
    staleTime: 5 * 60_000,
    enabled: !!user,
  });

  const locks = locksQuery.data;
  if (!locks) return null;

  // DateKeys are YYYY-MM-DD, so plain string comparison orders them — the
  // same timezone-naive comparison NightGuestsCard uses for "upcoming".
  const todayKey = dateKey(new Date());
  const nearest = Object.entries(locks)
    .filter(([date, lock]) => date >= todayKey && lock.topGameSlug !== null)
    .sort(([a], [b]) => a.localeCompare(b))[0];

  return resolveGame(nearest?.[1].topGameSlug)?.accentHex ?? null;
}

const voteLeaderExtension = {
  key: "vote-leader",
  useAccentOverride,
} as const;

export default voteLeaderExtension;
