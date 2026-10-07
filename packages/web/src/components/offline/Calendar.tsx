import type { GroupDayMatch } from "@boardgames/core/availability/group-match";
import type { CalendarLocks } from "../../lib/calendar-locks";
import { freeNightKey, nightsForDate } from "../../lib/calendar-locks";
import type { RsvpStatus } from "../../lib/calendar-rsvps";
import { isDndNight } from "../../lib/dnd-night";
import { viewerSeat } from "../../lib/night-access";
import type {
  AggregateAvailabilityMap,
  Availability,
  AvailabilityCounts,
  AvailabilityMap,
} from "../../lib/offline-availability";
import { dateKey } from "../../lib/offline-availability";
import { build42Days } from "../../lib/offline-week";
import { DayCell, type GroupCell, type Heat, type NightCell } from "./CalendarDayCell";
import { firstName } from "./group-fit";

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
  /**
   * Locked nights, keyed by NIGHT key — a date, or `date_2` for a second
   * night on the same date. A date carrying two nights renders as a split
   * cell, one pane per night.
   */
  locks?: CalendarLocks;
  /** When true, cells route clicks to onLockToggle instead of cycling availability. Admin-only. */
  lockMode?: boolean;
  /**
   * Lock-mode click. `key` is the NIGHT key to create or edit: a locked
   * night's own key, or — from the "+ 2nd night" pane beside a date's only
   * night — the date's free slot.
   */
  onLockToggle?: (key: string, currentlyLocked: boolean) => void;
  /** Click handler for locked nights (in non-lock mode). Routes user to the RSVP modal. */
  onLockedClick?: (key: string) => void;
  /** Map of night key → current viewer's RSVP status, for the locked-cell pill. */
  viewerRsvpByDate?: Record<string, RsvpStatus | undefined>;
  /**
   * Admin "away" notes for the calendar's owner — days they are known to be
   * unavailable on. Painted only where the owner has no mark of their own
   * (their mark wins). Admin surfaces only.
   */
  awayDays?: ReadonlySet<string>;
  /**
   * When true, a future unmarked cell routes its click to `onAwayToggle`
   * instead of cycling availability; marked cells are not clickable.
   * Admin-only (the per-member drawer).
   */
  awayMode?: boolean;
  onAwayToggle?: (key: string, currentlyAway: boolean) => void;
  /**
   * Who is looking — decides the private-night cell's pill ("Invited",
   * "Seated", …) and which seat pip is theirs. Omit for anonymous surfaces
   * (previews, admin drawers): private cells then show the tally alone.
   */
  viewer?: { id: string | null; isAdmin: boolean };
  /**
   * Lock mode's "Find a date": the picked members and every date's fit for
   * them. While set, a day's names list only the group, heat steps aside so
   * one signal speaks, and each free date is ringed, tallied or dimmed.
   */
  group?: {
    ids: ReadonlySet<string>;
    byDate: Readonly<Record<string, GroupDayMatch>>;
    names: ReadonlyMap<string, string>;
  } | null;
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
  awayDays,
  awayMode = false,
  onAwayToggle,
  viewer,
  group = null,
}: Props) {
  const todayKey = dateKey(new Date());
  const cutoffKey = readonlyBefore ? dateKey(readonlyBefore) : null;

  const days = build42Days(weekStart);

  function cycle(current: Availability | undefined): Availability | undefined {
    if (current === undefined) return "can";
    if (current === "can") return "maybe";
    return undefined;
  }

  // 4px on phones: at 320 every px of the 7 columns goes to the cells.
  const gridGap = compact ? "gap-1" : "gap-1 sm:gap-2 md:gap-3";
  const wrapperGrowth = compact ? "" : "min-h-0 flex-1";
  const gridGrowth = compact ? "" : "min-h-0 flex-1";
  // Phones: whole-pixel tracks. `1fr` split 296px into 38.86px columns, so
  // every column started at a different fraction of a pixel and the browser
  // rounded each cell's pills, text and stripe differently — the same pill
  // looked different in every cell. Rounded tracks give every cell the same
  // size and the same pixel phase; the few spare pixels sit at the edges.
  const phoneCols = compact
    ? ""
    : "max-sm:grid-cols-[repeat(7,round(down,calc((100%_-_24px)/7),1px))] max-sm:justify-center";
  const phoneRows = compact
    ? ""
    : "max-sm:grid-rows-[repeat(6,round(down,calc((100%_-_20px)/6),1px))] max-sm:content-start";

  return (
    <div className={`flex flex-col ${wrapperGrowth} ${compact ? "gap-1.5" : "gap-2 sm:gap-3"}`}>
      <div className={`grid shrink-0 grid-cols-7 ${gridGap} ${phoneCols}`}>
        {DAY_NAMES.map((n) => (
          <div
            key={n}
            className={`text-center font-semibold uppercase tracking-eyebrow text-fg-secondary ${compact ? "text-5xs" : "text-3xs"}`}
          >
            {n}
          </div>
        ))}
      </div>
      <div
        className={`grid grid-cols-7 grid-rows-6 ${gridGap} ${gridGrowth} ${phoneCols} ${phoneRows}`}
      >
        {days.map((date, i) => {
          const key = dateKey(date);
          const value = availability[key];
          const isToday = key === todayKey;
          const isPast = cutoffKey ? key < cutoffKey : false;
          const showMonthLabel = i === 0 || date.getDate() === 1;
          const dayCounts = counts?.[key];
          const heat: Heat = group ? { kind: "neutral" } : deriveHeat(dayCounts);
          const match = group && !isPast ? group.byDate[key] : undefined;
          const groupCell =
            group && match && match.nightKey !== null ? toGroupCell(match, group) : null;
          const labels = group
            ? dayLabels?.[key]?.filter((e) => group.ids.has(e.userId))
            : dayLabels?.[key];

          // The date's nights (0, 1 or 2), each carrying its own art, tally
          // and click. In lock mode a night's click edits it; otherwise it
          // opens the RSVP modal.
          const nightClickable = !isPast && (lockMode || !!onLockedClick);
          const nights: NightCell[] = nightsForDate(locks, key).map(({ key: nightKey, lock }) => ({
            key: nightKey,
            picksLocked: !!lock.picksLockedAt,
            attendance: lock.attendance ?? null,
            dndNight: isDndNight(lock),
            privateNight:
              lock.isPrivate && lock.seats
                ? {
                    seats: lock.seats,
                    viewerSeat: viewer ? viewerSeat(lock, viewer.id, viewer.isAdmin) : null,
                  }
                : null,
            viewerRsvp: viewerRsvpByDate?.[nightKey],
            interactive: nightClickable,
            onClick: lockMode
              ? () => onLockToggle?.(nightKey, true)
              : () => onLockedClick?.(nightKey),
          }));
          // Lock mode shows the free slot beside a date's only night, so a
          // second night is one tap away and never hides behind the first.
          const freeKey =
            lockMode && !isPast && nights.length === 1 ? freeNightKey(locks, key) : null;
          const addNight = freeKey ? () => onLockToggle?.(freeKey, false) : null;
          const anyLocked = nights.length > 0;

          // An away note only shows (and only toggles) where the owner has no
          // mark: their own can/maybe always wins over the admin's reminder.
          const away = value === undefined && !!awayDays?.has(key);
          // Cell-level interaction is for UNLOCKED cells; a locked night's
          // own click and clickability travel with it in `nights`.
          const cellInteractive = awayMode
            ? !isPast && value === undefined
            : lockMode
              ? !isPast
              : !isPast && !anyLocked && interactive;
          const handleClick = awayMode
            ? () => onAwayToggle?.(key, away)
            : lockMode
              ? () => onLockToggle?.(key, false)
              : () => onChange?.(key, cycle(value));
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
              labels={labels}
              isAdminView={!!dayLabels}
              heat={heat}
              nights={nights}
              addNight={addNight}
              lockMode={lockMode}
              away={away}
              group={groupCell}
              cellSeed={i}
              onClick={handleClick}
            />
          );
        })}
      </div>
    </div>
  );
}

function toGroupCell(match: GroupDayMatch, group: NonNullable<Props["group"]>): GroupCell {
  return {
    tier: match.tier,
    available: match.can.length + match.maybe.length,
    total: match.can.length + match.maybe.length + match.missing.length,
    maybe: match.maybe.length,
    missing: match.missing.map((id) => firstName(group.names.get(id) ?? "—")),
  };
}

function deriveHeat(counts: { can: number; maybe: number } | undefined): Heat {
  if (!counts) return { kind: "neutral" };
  if (counts.can >= 4) return { kind: "fire", can: counts.can, maybe: counts.maybe };
  if (counts.can === 3) return { kind: "warming", can: 3, maybe: counts.maybe };
  return { kind: "neutral" };
}
