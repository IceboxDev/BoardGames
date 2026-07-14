import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { games as gameRegistry } from "../../games/registry";
import type { GameDefinition } from "../../games/types.ts";
import { compareForHeadcount, coversWindow } from "../../lib/bgg-format";
import {
  type Attendee,
  type AvailableGames,
  fetchAvailableGames,
  type ReactionAggregate,
} from "../../lib/calendar-games";
import { togglePicksLock } from "../../lib/calendar-locks";
import { kickRsvp, type RsvpStatus, setRsvp } from "../../lib/calendar-rsvps";
import { qk } from "../../lib/query-keys";

// Data layer for the RSVP modal: the availability query, the three mutations,
// and the values derived directly from query data. Extracted verbatim from
// RsvpModal so the component is left with view logic only. The view-only
// derivations (lock/user state, headingDate, view toggles) stay in the
// component.

type UseRsvpAvailabilityArgs = {
  date: string;
  /** Mirrors the previous `enabled: !!lock` on the games query. */
  enabled: boolean;
};

type UseRsvpAvailabilityResult = {
  gamesQuery: UseQueryResult<AvailableGames>;
  setRsvpMutation: UseMutationResult<
    unknown,
    Error,
    { status: RsvpStatus; auto?: boolean },
    unknown
  >;
  togglePicksLockMutation: UseMutationResult<unknown, Error, { on: boolean }, unknown>;
  kickMutation: UseMutationResult<unknown, Error, { userId: string }, unknown>;
  definiteCount: number;
  tentativeCount: number;
  reactions: Record<string, ReactionAggregate>;
  topSlugs: string[];
  attendees: Attendee[];
  ownedSlugs: string[];
  availableGames: GameDefinition[];
  hypedCount: number;
};

export function useRsvpAvailability({
  date,
  enabled,
}: UseRsvpAvailabilityArgs): UseRsvpAvailabilityResult {
  const queryClient = useQueryClient();

  const gamesQuery = useQuery({
    queryKey: qk.availableGames(date),
    queryFn: ({ signal }) => fetchAvailableGames(date, signal),
    enabled,
  });

  const setRsvpMutation = useMutation({
    mutationFn: ({ status, auto }: { status: RsvpStatus; auto?: boolean }) =>
      setRsvp(date, status, auto ?? false),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.calendarLocks() });
      void queryClient.invalidateQueries({ queryKey: qk.availableGames(date) });
    },
  });

  const togglePicksLockMutation = useMutation({
    mutationFn: ({ on }: { on: boolean }) => togglePicksLock(date, on),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.calendarLocks() });
      void queryClient.invalidateQueries({ queryKey: qk.availableGames(date) });
    },
  });

  const kickMutation = useMutation({
    mutationFn: ({ userId }: { userId: string }) => kickRsvp(date, userId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.calendarLocks() });
      void queryClient.invalidateQueries({ queryKey: qk.availableGames(date) });
    },
  });

  const definiteCount = gamesQuery.data?.definiteCount ?? 0;
  const tentativeCount = gamesQuery.data?.tentativeCount ?? 0;
  const reactions = gamesQuery.data?.reactions ?? {};
  const topSlugs = gamesQuery.data?.topSlugs ?? [];
  const attendees = gamesQuery.data?.attendees ?? [];
  const ownedSlugs = gamesQuery.data?.ownedSlugs ?? [];

  const availableGames = useMemo(() => {
    const data = gamesQuery.data;
    if (!data || data.ownedSlugs.length === 0) return [];
    const ownedSet = new Set(data.ownedSlugs);
    const lo = data.definiteCount;
    const hi = data.definiteCount + data.tentativeCount;
    // Only suggest games that fit *every* headcount in the [definite,
    // definite+tentative] window — see `coversWindow` doc. A max-4 game
    // on a 4-going/3-maybe night would lock out the maybes if it became
    // the pick, so it's filtered out here even though `fitsRange` would
    // have allowed it (carousel cards use the looser overlap test).
    const filtered = gameRegistry.filter((g) => ownedSet.has(g.slug) && coversWindow(g, lo, hi));
    // Ranks each game individually — see `compareForHeadcount`. Family members
    // compete separately here, so a family's position is won by its single
    // best-ranked sibling; `groupForPresentation` records that sibling as the
    // unit's anchor and the carousel opens the card on it.
    return filtered.sort((a, b) => compareForHeadcount(a, b, lo));
  }, [gamesQuery.data]);

  const hypedCount = useMemo(
    () => availableGames.filter((g) => (reactions[g.slug]?.hype ?? 0) > 0).length,
    [availableGames, reactions],
  );

  return {
    gamesQuery,
    setRsvpMutation,
    togglePicksLockMutation,
    kickMutation,
    definiteCount,
    tentativeCount,
    reactions,
    topSlugs,
    attendees,
    ownedSlugs,
    availableGames,
    hypedCount,
  };
}
