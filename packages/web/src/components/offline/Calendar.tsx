import type {
  AggregateAvailabilityMap,
  Availability,
  AvailabilityMap,
} from "../../lib/offline-availability";
import { dateKey } from "../../lib/offline-availability";
import { build42Days } from "../../lib/offline-week";

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
};

export default function Calendar({
  weekStart,
  availability,
  onChange,
  readonlyBefore,
  interactive = false,
  compact = false,
  dayLabels,
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
            className={`text-center font-semibold uppercase tracking-[0.2em] text-gray-400 ${compact ? "text-[8px]" : "text-[10px]"}`}
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
              interactive={interactive}
              compact={compact}
              labels={dayLabels?.[key]}
              onClick={() => onChange?.(key, cycle(value))}
            />
          );
        })}
      </div>
    </div>
  );
}

type DayCellProps = {
  day: number;
  monthBucket: 0 | 1 | 2;
  monthLabel: string | null;
  value: Availability | undefined;
  isToday: boolean;
  isPast: boolean;
  interactive: boolean;
  compact: boolean;
  labels?: import("../../lib/offline-availability").AvailabilityEntry[];
  onClick: () => void;
};

function DayCell({
  day,
  monthBucket,
  monthLabel,
  value,
  isToday,
  isPast,
  interactive,
  compact,
  labels,
  onClick,
}: DayCellProps) {
  const stateClass =
    value === "can"
      ? "bg-gradient-to-br from-accent-500/40 via-accent-500/20 to-neon-cyan/15 shadow-[0_0_30px_-5px_rgba(99,102,241,0.45)]"
      : value === "maybe"
        ? "bg-gradient-to-br from-amber-500/30 via-orange-500/20 to-amber-400/10 shadow-[0_0_24px_-6px_rgba(245,158,11,0.4)]"
        : "";

  const borderClass =
    value === "can"
      ? "border-accent-400/70"
      : value === "maybe"
        ? "border-amber-400/55"
        : "border-white/10 hover:border-white/25";

  const baseBgClass = !value ? "bg-surface-800/55" : "";
  const baseHover = !value && interactive ? "hover:bg-surface-800/80" : "";
  const lockedClass = isPast
    ? "pointer-events-none opacity-30"
    : interactive
      ? "hover:scale-[1.015] active:scale-[0.985]"
      : "pointer-events-none";

  const padding = compact ? "p-1 sm:p-1.5" : "p-2 sm:p-3";
  const dayTextSize = compact
    ? "text-sm sm:text-base"
    : "text-xl sm:text-2xl md:text-3xl xl:text-4xl";
  const monthLabelPos = compact ? "left-1 top-1" : "left-1.5 top-1.5";
  const monthLabelSize = compact ? "text-[7px]" : "text-[8px] sm:text-[9px]";
  const todayDotPos = compact ? "right-1 top-1" : "right-2 top-2";
  const valueLabelSize = compact ? "text-[7px]" : "text-[9px] sm:text-[11px]";

  const aspectClass = compact ? "aspect-square" : "";
  const layoutClass = compact ? "items-center justify-center" : "justify-between";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive || isPast}
      aria-label={`${day}${value ? ` — ${value}` : ""}`}
      aria-pressed={value !== undefined}
      className={`group relative flex flex-col overflow-hidden rounded-xl border transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${layoutClass} ${aspectClass} ${padding} ${baseBgClass} ${borderClass} ${baseHover} ${lockedClass}`}
    >
      <span
        className={`pointer-events-none absolute inset-0 ${monthTintClass(monthBucket)}`}
        aria-hidden="true"
      />
      {stateClass && (
        <span className={`pointer-events-none absolute inset-0 ${stateClass}`} aria-hidden="true" />
      )}
      {monthLabel && (
        <span
          className={`pointer-events-none absolute font-bold uppercase tracking-[0.18em] text-white/40 ${monthLabelPos} ${monthLabelSize}`}
          aria-hidden="true"
        >
          {monthLabel}
        </span>
      )}
      {isToday && (
        <span
          className={`pointer-events-none absolute h-1.5 w-1.5 animate-pulse rounded-full bg-neon-cyan shadow-[0_0_10px_2px_rgba(34,211,238,0.7)] ${todayDotPos}`}
          aria-hidden="true"
        />
      )}
      <span
        className={`relative font-bold leading-none ${dayTextSize} ${
          value ? "text-white" : "text-gray-200"
        }`}
      >
        {day}
      </span>
      {labels && labels.length > 0 && !compact && <DayLabels entries={labels} />}
      {value && !compact && (
        <span
          className={`relative self-end font-bold uppercase tracking-[0.18em] ${valueLabelSize} ${
            value === "can" ? "text-accent-200" : "text-amber-200"
          }`}
        >
          {value}
        </span>
      )}
    </button>
  );
}

const MAX_VISIBLE_LABELS = 4;

function DayLabels({
  entries,
}: {
  entries: import("../../lib/offline-availability").AvailabilityEntry[];
}) {
  const visible = entries.slice(0, MAX_VISIBLE_LABELS);
  const overflow = entries.length - visible.length;
  return (
    <div className="relative mt-1 flex min-h-0 flex-1 flex-col gap-px overflow-hidden">
      {visible.map((e) => (
        <span
          key={e.userId}
          title={`${e.name} — ${e.status}`}
          className={`truncate text-left text-[9px] font-semibold leading-tight ${
            e.status === "can" ? "text-accent-200" : "text-amber-200"
          }`}
        >
          <span
            aria-hidden="true"
            className={`mr-1 inline-block h-1 w-1 rounded-full align-middle ${
              e.status === "can" ? "bg-accent-300" : "bg-amber-300"
            }`}
          />
          {firstName(e.name)}
        </span>
      ))}
      {overflow > 0 && (
        <span className="truncate text-left text-[9px] font-semibold leading-tight text-gray-400">
          +{overflow} more
        </span>
      )}
    </div>
  );
}

function firstName(full: string): string {
  const trimmed = full.trim();
  if (!trimmed) return "—";
  const space = trimmed.indexOf(" ");
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

function monthTintClass(bucket: 0 | 1 | 2): string {
  if (bucket === 0) return "bg-accent-500/[0.06]";
  if (bucket === 1) return "bg-neon-cyan/[0.06]";
  return "bg-neon-purple/[0.06]";
}
