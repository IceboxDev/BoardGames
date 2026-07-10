import type { CalendarLocks } from "../../lib/calendar-locks";
import type { RsvpStatus } from "../../lib/calendar-rsvps";
import { isDndNight } from "../../lib/dnd-night";
import type {
  AggregateAvailabilityMap,
  Availability,
  AvailabilityCounts,
  AvailabilityMap,
} from "../../lib/offline-availability";
import { dateKey } from "../../lib/offline-availability";
import { build42Days } from "../../lib/offline-week";
import { DayCell, type Heat } from "./CalendarDayCell";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Props = {
  weekStart: Date;
  availability: AvailabilityMap;
  onChange?: (key: string, value: Availability | undefined) => void;
  readonlyBefore?: Date;
  interactive?: boolean;
  /** Tighter typography + padding for narrow containers (e.g. side drawers). */
  compact?: boolean;
  /** Per-date roster of who marked availability — admin-only overlay. */
  dayLabels?: AggregateAvailabilityMap;
  /** Per-date can/maybe counts — drives "warming up" / "on fire" visuals for everyone. */
  counts?: AvailabilityCounts;
  /** Per-date lock state set by admin. Renders the wax-seal "locked" visual. */
  locks?: CalendarLocks;
  /** When true, cells route clicks to onLockToggle instead of cycling availability. Admin-only. */
  lockMode?: boolean;
  onLockToggle?: (key: string, currentlyLocked: boolean) => void;
  /** Click handler for locked cells (in non-lock mode). Routes user to RSVP modal. */
  onLockedClick?: (key: string) => void;
  /** Map of date → current viewer's RSVP status, for the locked-cell pill. */
  viewerRsvpByDate?: Record<string, RsvpStatus | undefined>;
};

export default function Calendar({
  weekStart,
  availability,
  onChange,
  readonlyBefore,
  interactive = false,
  compact = false,
  dayLabels,
  counts,
  locks,
  lockMode = false,
  onLockToggle,
  onLockedClick,
  viewerRsvpByDate,
}: Props) {
  const todayKey = dateKey(new Date());
  const cutoffKey = readonlyBefore ? dateKey(readonlyBefore) : null;

  const days = build42Days(weekStart);

  function cycle(current: Availability | undefined): Availability | undefined {
    if (current === undefined) return "can";
    if (current === "can") return "maybe";
    return undefined;
  }

  const gridGap = compact ? "gap-1" : "gap-1.5 sm:gap-2 md:gap-3";
  const wrapperGrowth = compact ? "" : "min-h-0 flex-1";
  const gridGrowth = compact ? "" : "min-h-0 flex-1";

  return (
    <div className={`flex flex-col ${wrapperGrowth} ${compact ? "gap-1.5" : "gap-2 sm:gap-3"}`}>
      <div className={`grid shrink-0 grid-cols-7 ${gridGap}`}>
        {DAY_NAMES.map((n) => (
          <div
            key={n}
            className={`text-center font-semibold uppercase tracking-eyebrow text-fg-secondary ${compact ? "text-4xs" : "text-3xs"}`}
          >
            {n}
          </div>
        ))}
      </div>
      <div className={`grid grid-cols-7 grid-rows-6 ${gridGap} ${gridGrowth}`}>
        {days.map((date, i) => {
          const key = dateKey(date);
          const value = availability[key];
          const isToday = key === todayKey;
          const isPast = cutoffKey ? key < cutoffKey : false;
          const showMonthLabel = i === 0 || date.getDate() === 1;
          const dayCounts = counts?.[key];
          const heat = deriveHeat(dayCounts);
          const lock = locks?.[key];
          const lockedAndClickable = !!lock && !isPast && !!onLockedClick;
          const cellInteractive = lockMode
            ? !isPast
            : !isPast && (lock ? lockedAndClickable : interactive);
          const handleClick = lockMode
            ? () => onLockToggle?.(key, !!lock)
            : lock
              ? () => onLockedClick?.(key)
              : () => onChange?.(key, cycle(value));
          const viewerRsvp = lock ? viewerRsvpByDate?.[key] : undefined;
          const picksLocked = !!lock?.picksLockedAt;
          const attendance = lock?.attendance ?? null;
          const dndNight = isDndNight(lock);
          return (
            <DayCell
              key={key}
              day={date.getDate()}
              monthBucket={(date.getMonth() % 3) as 0 | 1 | 2}
              monthLabel={
                showMonthLabel ? date.toLocaleString(undefined, { month: "short" }) : null
              }
              value={value}
              isToday={isToday}
              isPast={isPast}
              interactive={cellInteractive}
              compact={compact}
              labels={dayLabels?.[key]}
              isAdminView={!!dayLabels}
              heat={heat}
              locked={!!lock}
              picksLocked={picksLocked}
              attendance={attendance}
              dndNight={dndNight}
              lockMode={lockMode}
              viewerRsvp={viewerRsvp}
              cellSeed={i}
              onClick={handleClick}
            />
          );
        })}
      </div>
    </div>
  );
}

function deriveHeat(counts: { can: number; maybe: number } | undefined): Heat {
  if (!counts) return { kind: "neutral" };
  if (counts.can >= 4) return { kind: "fire", can: counts.can, maybe: counts.maybe };
  if (counts.can === 3) return { kind: "warming", can: 3, maybe: counts.maybe };
  return { kind: "neutral" };
}
