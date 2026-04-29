import type { Availability, AvailabilityMap } from "../../lib/offline-availability";
import { dateKey } from "../../lib/offline-availability";
import { build42Days } from "../../lib/offline-week";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Props = {
  weekStart: Date;
  availability: AvailabilityMap;
  onChange?: (key: string, value: Availability | undefined) => void;
  readonlyBefore?: Date;
  interactive?: boolean;
};

export default function Calendar({
  weekStart,
  availability,
  onChange,
  readonlyBefore,
  interactive = false,
}: Props) {
  const todayKey = dateKey(new Date());
  const cutoffKey = readonlyBefore ? dateKey(readonlyBefore) : null;

  const days = build42Days(weekStart);

  function cycle(current: Availability | undefined): Availability | undefined {
    if (current === undefined) return "can";
    if (current === "can") return "maybe";
    return undefined;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 sm:gap-3">
      <div className="grid shrink-0 grid-cols-7 gap-1.5 sm:gap-2 md:gap-3">
        {DAY_NAMES.map((n) => (
          <div
            key={n}
            className="text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-400"
          >
            {n}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1.5 sm:gap-2 md:gap-3">
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

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive || isPast}
      aria-label={`${day}${value ? ` — ${value}` : ""}`}
      aria-pressed={value !== undefined}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border p-2 transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 sm:p-3 ${baseBgClass} ${borderClass} ${baseHover} ${lockedClass}`}
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
          className="pointer-events-none absolute left-1.5 top-1.5 text-[8px] font-bold uppercase tracking-[0.18em] text-white/40 sm:text-[9px]"
          aria-hidden="true"
        >
          {monthLabel}
        </span>
      )}
      {isToday && (
        <span
          className="pointer-events-none absolute right-2 top-2 h-1.5 w-1.5 animate-pulse rounded-full bg-neon-cyan shadow-[0_0_10px_2px_rgba(34,211,238,0.7)]"
          aria-hidden="true"
        />
      )}
      <span
        className={`relative text-xl font-bold leading-none sm:text-2xl md:text-3xl xl:text-4xl ${
          value ? "text-white" : "text-gray-200"
        }`}
      >
        {day}
      </span>
      {value && (
        <span
          className={`relative self-end text-[9px] font-bold uppercase tracking-[0.18em] sm:text-[11px] ${
            value === "can" ? "text-accent-200" : "text-amber-200"
          }`}
        >
          {value}
        </span>
      )}
    </button>
  );
}

function monthTintClass(bucket: 0 | 1 | 2): string {
  if (bucket === 0) return "bg-accent-500/[0.06]";
  if (bucket === 1) return "bg-neon-cyan/[0.06]";
  return "bg-neon-purple/[0.06]";
}
