import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { adminSetNightGuest } from "../../lib/admin";
import { fetchAvailableGames } from "../../lib/calendar-games";
import { fetchCalendarLocks } from "../../lib/calendar-locks";
import { formatDayKey } from "../../lib/date-format";
import { dateKey } from "../../lib/offline-availability";
import { qk } from "../../lib/query-keys";
import { TrashIcon } from "../icons";
import { Button } from "../ui/Button";
import { ErrorAlert } from "../ui/ErrorAlert";
import { Field } from "../ui/Field";
import { IconButton } from "../ui/IconButton";
import { QueryBoundary } from "../ui/QueryBoundary";
import { Select } from "../ui/Select";
import { ExpandableAdminCard } from "./ExpandableAdminCard";
import type { AdminUser } from "./types";

type Props = {
  /** Guest stubs (user.guest = 1) — the only users addable through here. */
  guests: AdminUser[];
};

/**
 * Lets the admin put guest players (stub accounts with no login) on a game
 * night's attendee list — including nights that haven't happened yet. The
 * server RSVPs "yes" on the guest's behalf, so they flow through the normal
 * attendee pipeline; removing deletes the RSVP row again. The attendee list
 * badges them as "Guest".
 */
export function NightGuestsCard({ guests }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [date, setDate] = useState("");
  const [guestId, setGuestId] = useState("");
  const nightId = useId();
  const guestSelectId = useId();
  const queryClient = useQueryClient();

  const locksQuery = useQuery({
    queryKey: qk.calendarLocks(),
    queryFn: ({ signal }) => fetchCalendarLocks(signal),
    enabled: expanded,
  });
  // Upcoming (or today's) locked nights, soonest first. Past nights are
  // deliberately hidden: retroactive guest credit belongs in match history.
  const todayKey = dateKey(new Date());
  const nights = Object.entries(locksQuery.data ?? {})
    .filter(([d]) => d >= todayKey)
    .sort(([a], [b]) => a.localeCompare(b));

  const gamesQuery = useQuery({
    queryKey: qk.availableGames(date || null),
    queryFn: ({ signal }) => fetchAvailableGames(date, signal),
    enabled: expanded && date !== "",
  });
  const nightGuests = (gamesQuery.data?.attendees ?? []).filter((a) => a.isGuest);
  const attendingIds = new Set(nightGuests.map((a) => a.userId));

  const mutation = useMutation({
    mutationFn: ({ guestUserId, on }: { guestUserId: string; on: boolean }) =>
      adminSetNightGuest(date, guestUserId, on),
    onSuccess: () => {
      // The RSVP write changes the attendee payload and (when picks are
      // sealed) the lock's expected snapshot.
      void queryClient.invalidateQueries({ queryKey: qk.availableGames(date) });
      void queryClient.invalidateQueries({ queryKey: qk.calendarLocks() });
      setGuestId("");
    },
  });

  const addableGuests = guests.filter((g) => !attendingIds.has(g.id));

  return (
    <ExpandableAdminCard
      tone="accent"
      eyebrow="Night guests"
      summary={
        guests.length === 0
          ? "Add guest players first — then you can seat them on a game night."
          : "Put guest players on a night's attendee list — no account needed."
      }
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
    >
      <>
        {mutation.error && (
          <ErrorAlert
            message={
              mutation.error instanceof Error
                ? mutation.error.message
                : "Failed to update the night's guests"
            }
          />
        )}
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Game night" htmlFor={nightId}>
            <Select
              id={nightId}
              size="sm"
              block={false}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={locksQuery.data === undefined}
            >
              <option value="">
                {locksQuery.data === undefined
                  ? "Loading nights…"
                  : nights.length === 0
                    ? "No upcoming nights"
                    : "Pick a night…"}
              </option>
              {nights.map(([d, lock]) => (
                <option key={d} value={d}>
                  {formatDayKey(d)}
                  {lock.host ? ` — at ${lock.host.name}'s` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Guest" htmlFor={guestSelectId}>
            <Select
              id={guestSelectId}
              size="sm"
              block={false}
              value={guestId}
              onChange={(e) => setGuestId(e.target.value)}
              disabled={date === "" || addableGuests.length === 0}
            >
              <option value="">
                {addableGuests.length === 0 && guests.length > 0
                  ? "All guests already added"
                  : "Pick a guest…"}
              </option>
              {addableGuests.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            variant="primary"
            size="sm"
            disabled={date === "" || guestId === "" || mutation.isPending}
            loading={mutation.isPending}
            onClick={() => mutation.mutate({ guestUserId: guestId, on: true })}
          >
            Add to night
          </Button>
        </div>

        {date !== "" && (
          <div className="pt-1">
            <QueryBoundary
              query={gamesQuery}
              loading={<p className="text-xs text-fg-muted">Loading attendees…</p>}
              isEmpty={(games) => !games.attendees.some((a) => a.isGuest)}
              empty={<p className="text-xs text-fg-muted">No guests on this night yet.</p>}
            >
              {(games) => (
                <ul className="flex flex-col gap-1">
                  {games.attendees
                    .filter((a) => a.isGuest)
                    .map((g) => (
                      <li
                        key={g.userId}
                        className="flex items-center gap-2 rounded-md bg-surface-900/60 px-2.5 py-1.5"
                      >
                        <span className="flex-1 truncate text-sm text-fg-primary">{g.name}</span>
                        <IconButton
                          tone="rose"
                          size="xs"
                          aria-label={`Remove ${g.name} from this night`}
                          title="Remove from this night"
                          disabled={mutation.isPending}
                          onClick={() => mutation.mutate({ guestUserId: g.userId, on: false })}
                          icon={<TrashIcon className="h-3.5 w-3.5" />}
                        />
                      </li>
                    ))}
                </ul>
              )}
            </QueryBoundary>
          </div>
        )}
      </>
    </ExpandableAdminCard>
  );
}
