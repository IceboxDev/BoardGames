import type { Availability, AvailabilityMap } from "../../lib/offline-availability";
import { dateKey } from "../../lib/offline-availability";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Props = {
  monthDate: Date;
  availability: AvailabilityMap;
  onChange: (key: string, value: Availability | undefined) => void;
  readonlyBefore?: Date;
};

export default function Calendar({ monthDate, availability, onChange, readonlyBefore }: Props) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;

  const todayKey = dateKey(new Date());
  const cutoffKey = readonlyBefore ? dateKey(readonlyBefore) : null;

  const cells: { date: Date; key: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month, i + 1 - firstWeekday);
    cells.push({ date: d, key: dateKey(d), inMonth: d.getMonth() === month });
  }

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
            className="text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500"
          >
            {n}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1.5 sm:gap-2 md:gap-3">
        {cells.map((cell) => {
          if (!cell.inMonth) {
            return (
              <div key={cell.key} aria-hidden="true" className="rounded-xl bg-white/[0.015]" />
            );
          }
          const value = availability[cell.key];
          const isToday = cell.key === todayKey;
          const isPast = cutoffKey ? cell.key < cutoffKey : false;
          return (
            <DayCell
              key={cell.key}
              day={cell.date.getDate()}
              value={value}
              isToday={isToday}
              isPast={isPast}
              onClick={() => onChange(cell.key, cycle(value))}
            />
          );
        })}
      </div>
    </div>
  );
}

type DayCellProps = {
  day: number;
  value: Availability | undefined;
  isToday: boolean;
  isPast: boolean;
  onClick: () => void;
};

function DayCell({ day, value, isToday, isPast, onClick }: DayCellProps) {
  const stateClass =
    value === "can"
      ? "bg-gradient-to-br from-accent-500/40 via-accent-500/20 to-neon-cyan/15 border-accent-400/70 shadow-[0_0_30px_-5px_rgba(99,102,241,0.45)]"
      : value === "maybe"
        ? "bg-gradient-to-br from-amber-500/30 via-orange-500/20 to-amber-400/10 border-amber-400/55 shadow-[0_0_24px_-6px_rgba(245,158,11,0.4)]"
        : "bg-surface-800/55 border-white/[0.06] hover:border-white/20 hover:bg-surface-800";

  const interactiveClass = isPast
    ? "pointer-events-none opacity-30"
    : "hover:scale-[1.015] active:scale-[0.985]";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPast}
      aria-label={`${day}${value ? ` — ${value}` : ""}`}
      aria-pressed={value !== undefined}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border p-2 transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 sm:p-3 ${stateClass} ${interactiveClass}`}
    >
      {isToday && (
        <span
          className="absolute right-2 top-2 h-1.5 w-1.5 animate-pulse rounded-full bg-neon-cyan shadow-[0_0_10px_2px_rgba(34,211,238,0.7)]"
          aria-hidden="true"
        />
      )}
      <span
        className={`text-xl font-bold leading-none sm:text-2xl md:text-3xl xl:text-4xl ${
          value ? "text-white" : "text-gray-200"
        }`}
      >
        {day}
      </span>
      {value && (
        <span
          className={`self-end text-[9px] font-bold uppercase tracking-[0.18em] sm:text-[11px] ${
            value === "can" ? "text-accent-200" : "text-amber-200"
          }`}
        >
          {value}
        </span>
      )}
    </button>
  );
}
