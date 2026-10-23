import type { NightSeats } from "../../lib/calendar-locks";
import type { RsvpStatus } from "../../lib/calendar-rsvps";
import { cn } from "../../lib/cn";
import type { ViewerSeat } from "../../lib/night-access";
import type { Availability } from "../../lib/offline-availability";
import { DayCell, type DayCellProps, type Heat, type NightCell } from "../offline/CalendarDayCell";

// The welcome tour's calendar days are the REAL calendar cell (`DayCell`),
// fed demo props: whatever a member sees here is exactly what the calendar
// draws — the same colours, pills, flames and seals.

const NOOP = () => {};

type DemoDayProps = {
  day: number;
  value?: Availability;
  heat?: Heat;
  night?: Partial<NightCell> | null;
  /** Tappable: cycles availability, or opens the night. */
  onClick?: () => void;
  label?: string;
  /** The calendar's compact cell (the admin drawer's): smaller type, no oversized numerals. */
  compact?: boolean;
  className?: string;
};

/** One real calendar cell at demo size, with an optional caption under it. */
export function DemoDay({
  day,
  value,
  heat,
  night,
  onClick,
  label,
  compact = false,
  className,
}: DemoDayProps) {
  const nights: NightCell[] = night
    ? [
        {
          key: `demo-${day}`,
          picksLocked: false,
          attendance: null,
          campaign: null,
          privateNight: null,
          interactive: Boolean(onClick),
          onClick: onClick ?? NOOP,
          ...night,
        },
      ]
    : [];
  const props: DayCellProps = {
    day,
    monthBucket: 0,
    monthLabel: null,
    value,
    isToday: false,
    isPast: false,
    interactive: Boolean(onClick),
    compact,
    isAdminView: false,
    heat: heat ?? { kind: "neutral" },
    nights,
    lockMode: false,
    cellSeed: day,
    onClick: onClick ?? NOOP,
  };
  return (
    <figure className={cn("flex flex-col items-center gap-1.5", className)}>
      {/* A one-cell grid: the real cell stretches to its track, as in the calendar.
          Phones: the calendar's narrow cells; desktop: its wide ~4:3 cells, which
          the big seat counts and seals are drawn for. A compact cell is square. */}
      <div className={cn("grid h-21 w-21", compact ? "sm:h-28 sm:w-28" : "sm:h-28 sm:w-36")}>
        <DayCell {...props} />
      </div>
      {label && (
        <figcaption className="max-w-36 text-center text-2xs leading-tight text-fg-secondary">
          {label}
        </figcaption>
      )}
    </figure>
  );
}

/** A locked night as the calendar paints it, with the viewer's answer on the pill. */
export function lockedNight(rsvp?: RsvpStatus): Partial<NightCell> {
  return { viewerRsvp: rsvp, attendance: { definite: 4, tentative: 1 } };
}

/** A private night with the viewer's place on it. */
export function privateNight(viewerSeat: ViewerSeat, seats: NightSeats): Partial<NightCell> {
  return {
    picksLocked: true,
    attendance: { definite: seats.taken, tentative: 0 },
    privateNight: { seats, viewerSeat },
  };
}
