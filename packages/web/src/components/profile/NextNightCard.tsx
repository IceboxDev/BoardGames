import type { NextNight } from "@boardgames/core/protocol";
import { formatDayKey } from "../../lib/date-format.ts";
import { ClockIcon, HostIcon, PinIcon, UsersIcon } from "../icons";
import { Badge } from "../ui/Badge.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";

// The highlighted "next board game night this player is attending" card. Reads
// the aggregated `nextNight` (date + host/time/address + headcount + the
// player's own definite/tentative status). When null, a quiet empty state.

type NextNightCardProps = {
  nextNight: NextNight;
  /** First name, for the empty-state copy ("Ada isn't on the calendar yet"). */
  firstName: string;
  isSelf: boolean;
};

export function NextNightCard({ nextNight, firstName, isSelf }: NextNightCardProps) {
  if (!nextNight) {
    return (
      <EmptyState
        title="No upcoming game night"
        description={
          isSelf
            ? "RSVP to a locked night and it'll show up here."
            : `${firstName} isn't on the calendar for an upcoming night yet.`
        }
      />
    );
  }

  return (
    <div className="rounded-2xl border border-accent-400/25 bg-accent-500/[0.07] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-3xs font-semibold uppercase tracking-[0.2em] text-accent-300">
            Next game night
          </p>
          <p className="mt-1 text-lg font-bold text-white">{formatDayKey(nextNight.dateKey)}</p>
        </div>
        <Badge tone={nextNight.status === "definite" ? "emerald" : "amber"} size="sm">
          {nextNight.status === "definite" ? "Going" : "Maybe"}
        </Badge>
      </div>

      <dl className="mt-3 flex flex-col gap-1.5 text-xs text-fg-secondary">
        {nextNight.eventTime && (
          <div className="flex items-center gap-2">
            <ClockIcon className="h-3.5 w-3.5 text-fg-muted" />
            <span>{nextNight.eventTime}</span>
          </div>
        )}
        {nextNight.hostName && (
          <div className="flex items-center gap-2">
            <HostIcon className="h-3.5 w-3.5 text-fg-muted" />
            <span className="truncate">Hosted by {nextNight.hostName}</span>
          </div>
        )}
        {nextNight.address && (
          <div className="flex items-center gap-2">
            <PinIcon className="h-3.5 w-3.5 text-fg-muted" />
            <span className="truncate">{nextNight.address}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <UsersIcon className="h-3.5 w-3.5 text-fg-muted" />
          <span>
            {nextNight.attendeeCount} {nextNight.attendeeCount === 1 ? "player" : "players"}{" "}
            expected
          </span>
        </div>
      </dl>
    </div>
  );
}
