import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useCurrentUser } from "../../../hooks/useCurrentUser.ts";
import { fetchCalendarLocks } from "../../calendar-locks.ts";
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
// `import.meta.glob("./extensions/*.ts{,x}")` (excluding `*.test.*`) and
// calls `useAccentOverride(config.accentMode === "night-sync")` on every
// provider render — unconditionally, so rules-of-hooks hold in every mode —
// applying the first non-null hex through its color-ramp generator.
//
// Deliberately reads only the night vote's `topGameSlug`. The purchase-poll
// tally is hidden from non-admin clients while a poll is open, so it is not
// a usable accent source here.

// `games-by-slug` reaches the whole game registry — catalog metadata plus
// every game's generated descriptions, ~685 kB. This module is imported
// EAGERLY by the theme registry's extension glob (hooks must be callable
// unconditionally), and the provider sits in RootShell, so a static import
// here lands that registry in the entry chunk for every visitor including
// the signed-out login page. Loading it on demand keeps it a separate chunk
// fetched only once a night-sync theme actually has a leader to resolve.
let resolverPromise: Promise<
  (slug: string | null | undefined) => { accentHex?: string } | undefined
> | null = null;

function loadAccentResolver() {
  resolverPromise ??= import("../../games-by-slug.ts").then((m) => m.resolveGame);
  return resolverPromise;
}

/**
 * Accent hex of the nearest locked night (today or later) that has a vote
 * leader, or null when there is no such night, the slug resolves to no
 * catalog game, the locks query hasn't produced data, the extension is
 * inactive (`active: false` — the engine passes whether night-sync mode is
 * on, so other accent modes never fetch), or the user is logged out. In the
 * inactive and logged-out cases the query is disabled, so public pages and
 * non-night-sync themes never hit the API.
 *
 * Resolves the slug→accent lookup asynchronously (see above), so the accent
 * arrives on a later render than the locks data — the theme simply keeps its
 * current accent until then.
 */
function useAccentOverride(active: boolean = true): string | null {
  const { user } = useCurrentUser();
  const locksQuery = useQuery({
    queryKey: qk.calendarLocks(),
    queryFn: ({ signal }) => fetchCalendarLocks(signal),
    // Existing calendarLocks consumers rely on the app-wide default
    // (lib/query-client.ts). Restate it here so this always-mounted hook
    // keeps the same refetch cadence even under a different provider.
    staleTime: 5 * 60_000,
    enabled: !!user && active,
  });
  const [accentHex, setAccentHex] = useState<string | null>(null);

  const locks = active ? locksQuery.data : undefined;
  // DateKeys are YYYY-MM-DD, so plain string comparison orders them — the
  // same timezone-naive comparison NightGuestsCard uses for "upcoming".
  const todayKey = dateKey(new Date());
  const leaderSlug = locks
    ? (Object.entries(locks)
        .filter(([date, lock]) => date >= todayKey && lock.topGameSlug !== null)
        .sort(([a], [b]) => a.localeCompare(b))[0]?.[1].topGameSlug ?? null)
    : null;

  useEffect(() => {
    if (!leaderSlug) {
      setAccentHex(null);
      return;
    }
    let cancelled = false;
    loadAccentResolver().then((resolveGame) => {
      if (!cancelled) setAccentHex(resolveGame(leaderSlug)?.accentHex ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [leaderSlug]);

  return active ? accentHex : null;
}

const voteLeaderExtension = {
  key: "vote-leader",
  useAccentOverride,
} as const;

export default voteLeaderExtension;
