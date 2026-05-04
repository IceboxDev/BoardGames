import type { CalendarLocks } from "../../lib/calendar-locks";
import type { RsvpStatus } from "../../lib/calendar-rsvps";
import type {
  AggregateAvailabilityMap,
  Availability,
  AvailabilityCounts,
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

type Heat =
  | { kind: "neutral" }
  | { kind: "warming"; can: 3; maybe: number }
  | { kind: "fire"; can: number; maybe: number };

function deriveHeat(counts: { can: number; maybe: number } | undefined): Heat {
  if (!counts) return { kind: "neutral" };
  if (counts.can >= 4) return { kind: "fire", can: counts.can, maybe: counts.maybe };
  if (counts.can === 3) return { kind: "warming", can: 3, maybe: counts.maybe };
  return { kind: "neutral" };
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
  /** True when admin overlay is active for the whole calendar (drives label vs personal-status priority). */
  isAdminView: boolean;
  heat: Heat;
  locked: boolean;
  lockMode: boolean;
  viewerRsvp?: RsvpStatus;
  cellSeed: number;
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
  isAdminView,
  heat,
  locked,
  lockMode,
  viewerRsvp,
  cellSeed,
  onClick,
}: DayCellProps) {
  const heated = heat.kind !== "neutral";
  // Lock visually overrides heat (and personal mark gradient).
  const showHeatLayer = !locked && heated;
  const showPersonalGradient = !locked && !heated && value;

  // Personal-mark gradient layer — render only when no aggregate heat or lock overrides it.
  // "maybe" stays in yellow tones so it never reads as the orange/red of warming or fire.
  const personalStateClass =
    showPersonalGradient && value === "can"
      ? "bg-gradient-to-br from-accent-500/40 via-accent-500/20 to-neon-cyan/15 shadow-[0_0_30px_-5px_rgba(99,102,241,0.45)]"
      : showPersonalGradient && value === "maybe"
        ? "bg-gradient-to-br from-yellow-400/35 via-yellow-300/22 to-yellow-200/10 shadow-[0_0_24px_-6px_rgba(234,179,8,0.4)]"
        : "";

  const borderClass = locked
    ? "border-amber-300/40"
    : heat.kind === "fire"
      ? "border-red-500/80"
      : heat.kind === "warming"
        ? "border-orange-400/65"
        : value === "can"
          ? "border-accent-400/70"
          : value === "maybe"
            ? "border-yellow-400/60"
            : lockMode
              ? "border-amber-200/30 hover:border-amber-200/60"
              : "border-white/10 hover:border-white/25";

  const baseBgClass = !value && !heated && !locked ? "bg-surface-800/55" : "";
  const baseHover = !value && !heated && !locked && interactive ? "hover:bg-surface-800/80" : "";
  const lockedDisplayClass = isPast
    ? "pointer-events-none opacity-30"
    : interactive
      ? "hover:scale-[1.015] active:scale-[0.985]"
      : "pointer-events-none";

  const padding = compact ? "p-1 sm:p-1.5" : "p-2 sm:p-3";
  const dayTextSize = compact ? "text-sm sm:text-base" : "text-lg sm:text-xl md:text-2xl";
  const monthLabelPos = compact ? "left-1 top-1" : "left-1.5 top-1.5";
  const monthLabelSize = compact ? "text-[7px]" : "text-[8px] sm:text-[9px]";
  const todayDotPos = compact ? "right-1 top-1" : "right-2 top-2";
  const valueLabelSize = compact ? "text-[7px]" : "text-[9px] sm:text-[11px]";

  const aspectClass = compact ? "aspect-square" : "";
  const layoutClass = compact ? "items-center justify-center" : "";

  // Ring/animation per heat state. Lock disables heat animations. Past days never animate.
  const heatAnim =
    isPast || compact || locked
      ? ""
      : heat.kind === "fire"
        ? "motion-safe:animate-fire-breathe"
        : heat.kind === "warming"
          ? "motion-safe:animate-ember-ring"
          : "";

  const dayNumberClass =
    !isPast && !locked && heat.kind === "fire" && !compact ? "motion-safe:animate-heat-haze" : "";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive || isPast}
      aria-label={`${day}${value ? ` — ${value}` : ""}${locked ? " — locked in" : ""}${
        !locked && heat.kind === "warming" ? ` — warming up, ${heat.can} confirmed` : ""
      }${!locked && heat.kind === "fire" ? ` — on fire, ${heat.can} confirmed` : ""}`}
      aria-pressed={value !== undefined}
      className={`group relative flex flex-col overflow-hidden rounded-xl border transition-all duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${layoutClass} ${aspectClass} ${padding} ${baseBgClass} ${borderClass} ${baseHover} ${lockedDisplayClass} ${heatAnim}`}
    >
      <span
        className={`pointer-events-none absolute inset-0 ${monthTintClass(monthBucket)}`}
        aria-hidden="true"
      />
      {personalStateClass && (
        <span
          className={`pointer-events-none absolute inset-0 ${personalStateClass}`}
          aria-hidden="true"
        />
      )}
      {showHeatLayer && heat.kind === "warming" && <WarmingLayer compact={compact} />}
      {showHeatLayer && heat.kind === "fire" && <FireLayer compact={compact} cellSeed={cellSeed} />}
      {locked && <LockedLayer compact={compact} viewerRsvp={viewerRsvp} />}
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
        className={`relative font-bold leading-none ${dayTextSize} ${dayNumberClass} ${
          value || heated ? "text-white" : "text-gray-200"
        }`}
      >
        {day}
      </span>
      {labels && labels.length > 0 && !compact && !locked && (
        <DayLabels entries={labels} heated={heated} />
      )}
      {!compact && !locked && !isAdminView && (value || heated) && (
        <div className="relative z-10 mt-auto flex items-end justify-between gap-1">
          <div className="min-w-0">{value && heated && <PersonalMarkChip value={value} />}</div>
          <div className="min-w-0">
            {heated ? (
              <HeatBadge heat={heat} />
            ) : (
              value && (
                <span
                  className={`font-bold uppercase tracking-[0.18em] ${valueLabelSize} ${
                    value === "can" ? "text-accent-300" : "text-amber-300"
                  }`}
                >
                  {value}
                </span>
              )
            )}
          </div>
        </div>
      )}
    </button>
  );
}

function WarmingLayer({ compact }: { compact: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-orange-700/45 via-orange-500/30 to-orange-400/15 shadow-[inset_0_-12px_18px_-12px_rgba(251,146,60,0.5)]"
      />
      {!compact && (
        <>
          <span
            className="ember"
            style={
              {
                "--x": "20%",
                "--delay": "0s",
                "--dur": "3.4s",
                "--drift": "-3px",
              } as React.CSSProperties
            }
          />
          <span
            className="ember"
            style={
              {
                "--x": "55%",
                "--delay": "0.9s",
                "--dur": "3s",
                "--drift": "2px",
              } as React.CSSProperties
            }
          />
          <span
            className="ember"
            style={
              {
                "--x": "82%",
                "--delay": "1.6s",
                "--dur": "3.6s",
                "--drift": "-1px",
              } as React.CSSProperties
            }
          />
        </>
      )}
    </>
  );
}

function FireLayer({ compact, cellSeed }: { compact: boolean; cellSeed: number }) {
  // Independent phase offsets per layer (seeded by cell) so neighboring cells
  // never pulse in lockstep AND layers within one cell drift relative to each
  // other. Negative `animation-delay` starts the layer mid-cycle.
  const phaseBloom = (cellSeed * 0.37) % 3.4;
  const phaseLeft = (cellSeed * 0.71) % 2.1;
  const phaseRight = (cellSeed * 0.53) % 2.7;
  const phaseGlow = (cellSeed * 0.91) % 4.3;
  const phaseEmber = (cellSeed * 0.17) % 3.6;

  return (
    <>
      {/* Molten base — warm static gradient, fades to transparent at the top so
          there's no hard horizon line. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-red-900/85 via-orange-700/40 to-transparent"
      />
      {/* Heart of the fire — soft radial dome at the bottom, breathes. */}
      <span
        aria-hidden="true"
        className="pointer-events-none fire-bloom absolute inset-0 motion-safe:animate-fire-bloom"
        style={{ animationDelay: `-${phaseBloom}s` } as React.CSSProperties}
      />
      {/* Asymmetric flame petals — left and right blobs on different periods. */}
      <span
        aria-hidden="true"
        className="pointer-events-none fire-petal-left absolute inset-0 motion-safe:animate-fire-petal-left"
        style={{ animationDelay: `-${phaseLeft}s` } as React.CSSProperties}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none fire-petal-right absolute inset-0 motion-safe:animate-fire-petal-right"
        style={{ animationDelay: `-${phaseRight}s` } as React.CSSProperties}
      />
      {/* Outer rim glow — soft inset shadows, slow breathe. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 motion-safe:animate-fire-glow shadow-[inset_0_-22px_28px_-12px_rgba(251,146,60,0.55),inset_0_0_22px_-10px_rgba(220,38,38,0.5)]"
        style={{ animationDelay: `-${phaseGlow}s` } as React.CSSProperties}
      />
      {!compact && (
        <>
          <span
            className="ember"
            style={
              {
                "--x": "22%",
                "--delay": `-${phaseEmber}s`,
                "--dur": "3.4s",
                "--drift": "-4px",
              } as React.CSSProperties
            }
          />
          <span
            className="ember"
            style={
              {
                "--x": "55%",
                "--delay": `-${(phaseEmber + 1.3) % 3.6}s`,
                "--dur": "3.8s",
                "--drift": "2px",
              } as React.CSSProperties
            }
          />
          <span
            className="ember"
            style={
              {
                "--x": "78%",
                "--delay": `-${(phaseEmber + 2.4) % 3.6}s`,
                "--dur": "3.1s",
                "--drift": "-2px",
              } as React.CSSProperties
            }
          />
        </>
      )}
    </>
  );
}

function LockedLayer({ compact, viewerRsvp }: { compact: boolean; viewerRsvp?: RsvpStatus }) {
  return (
    <>
      {/* Deep regal base — feels weighty. No animation on the bg itself. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-950 via-violet-900/95 to-indigo-900 shadow-[inset_0_0_24px_-8px_rgba(0,0,0,0.6),0_0_24px_-6px_rgba(251,191,36,0.25)]"
      />
      {/* Faint gold ring for the "sealed" feel. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-amber-300/35"
      />
      {/* Slow diagonal shimmer — light catching the seal. Idle most of cycle. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 -left-1/4 w-1/3 bg-gradient-to-r from-transparent via-amber-200/25 to-transparent motion-safe:animate-seal-shimmer"
      />
      {/* Wax-seal medallion in top-right corner — out of the way of the day number (top-left). */}
      {!compact && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 via-yellow-500 to-amber-700 shadow-[0_2px_8px_rgba(0,0,0,0.5),inset_0_1px_2px_rgba(255,255,255,0.4),inset_0_-2px_3px_rgba(0,0,0,0.3)]"
        >
          <LockGlyph />
        </span>
      )}
      {/* Compact (drawer) variant: tiny lock badge tucked into the corner instead of a medallion. */}
      {compact && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-0.5 top-0.5 z-10 flex h-3 w-3 items-center justify-center rounded-full bg-amber-400 shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
        >
          <LockGlyph small />
        </span>
      )}
      {/* RSVP-aware pill: invitation by default; flips to GOING / PASS once viewer commits. */}
      {!compact && <LockedPill viewerRsvp={viewerRsvp} />}
    </>
  );
}

function LockedPill({ viewerRsvp }: { viewerRsvp?: RsvpStatus }) {
  if (viewerRsvp === "yes") {
    return (
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-2 bottom-1.5 z-10 inline-flex items-center justify-center gap-1 rounded-md border border-emerald-300/45 bg-emerald-400/15 px-1 py-0.5 text-[8px] font-bold uppercase tracking-[0.22em] text-emerald-100 backdrop-blur-sm motion-safe:animate-pulse-soft"
      >
        <CheckGlyphSmall />
        Going
      </span>
    );
  }
  if (viewerRsvp === "no") {
    return (
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-2 bottom-1.5 z-10 inline-flex items-center justify-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-1 py-0.5 text-[8px] font-bold uppercase tracking-[0.22em] text-gray-400 backdrop-blur-sm"
      >
        <CrossGlyphSmall />
        Pass
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-2 bottom-1.5 z-10 rounded-md border border-amber-300/45 bg-amber-300/10 px-1 py-0.5 text-center text-[8px] font-bold uppercase tracking-[0.22em] text-amber-200 backdrop-blur-sm motion-safe:animate-pulse-soft"
    >
      RSVP
    </span>
  );
}

function CheckGlyphSmall() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-2.5 w-2.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}

function CrossGlyphSmall() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-2.5 w-2.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function LockGlyph({ small = false }: { small?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`text-amber-950 ${small ? "h-2 w-2" : "h-3 w-3"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={small ? 3 : 2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function PersonalMarkChip({ value }: { value: Availability }) {
  const isCan = value === "can";
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none inline-flex items-center gap-1 rounded-full bg-surface-950/85 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.15em] text-white ring-1 ${
        isCan
          ? "ring-accent-300/70 shadow-[0_0_8px_rgba(129,140,248,0.45)]"
          : "ring-amber-300/70 shadow-[0_0_8px_rgba(252,211,77,0.4)]"
      }`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${isCan ? "bg-accent-300" : "bg-amber-300"}`}
      />
      {value}
    </span>
  );
}

function HeatBadge({ heat }: { heat: Heat }) {
  if (heat.kind === "neutral") return null;
  const isFire = heat.kind === "fire";
  return (
    <span
      className={`pointer-events-none inline-flex items-center gap-0.5 rounded-full bg-surface-950/85 px-1.5 py-0.5 text-[9px] font-extrabold ring-1 ${
        isFire
          ? "text-orange-200 ring-orange-300/70 shadow-[0_0_10px_rgba(249,115,22,0.55)]"
          : "text-amber-200 ring-amber-300/70"
      }`}
      aria-hidden="true"
    >
      <FlameGlyph filled={isFire} />
      {heat.can}
      {heat.maybe > 0 && <span className="opacity-70">·{heat.maybe}m</span>}
    </span>
  );
}

function FlameGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-2.5 w-2.5"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.5}
      aria-hidden="true"
    >
      <path d="M8 1.5c0 2.5-3 3.2-3 6 0 1.4 1 2.7 2.2 3.1-.5-.5-.7-1.1-.7-1.7 0-1.6 1.6-2.1 1.6-3.7 1.3 1.4 2.4 2.4 2.4 4.1 0 1.7-1.4 3.2-3.5 3.2C5 12.5 3 10.7 3 8.3 3 4.8 8 4 8 1.5z" />
    </svg>
  );
}

const MAX_VISIBLE_LABELS = 6;

function DayLabels({
  entries,
  heated,
}: {
  entries: import("../../lib/offline-availability").AvailabilityEntry[];
  heated: boolean;
}) {
  // Cans always come first so the can row is on top, maybes underneath.
  const sorted = [...entries].sort((a, b) => {
    if (a.status === b.status) return 0;
    return a.status === "can" ? -1 : 1;
  });
  const visible = sorted.slice(0, MAX_VISIBLE_LABELS);
  const overflow = entries.length - visible.length;
  const cans = visible.filter((e) => e.status === "can");
  const maybes = visible.filter((e) => e.status === "maybe");
  const textShadow = heated ? { textShadow: "0 1px 2px rgba(0,0,0,0.85)" } : undefined;
  return (
    <div className="relative z-10 mt-0.5 flex min-h-0 flex-1 flex-col overflow-hidden">
      {cans.length > 0 && (
        <NameRow entries={cans} dotColor="bg-accent-300" textShadow={textShadow} />
      )}
      {maybes.length > 0 && (
        <NameRow entries={maybes} dotColor="bg-yellow-400" textShadow={textShadow} />
      )}
      {overflow > 0 && (
        <span
          style={textShadow}
          className="text-[7px] font-medium leading-none text-gray-400 sm:text-[8px]"
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

function NameRow({
  entries,
  dotColor,
  textShadow,
}: {
  entries: import("../../lib/offline-availability").AvailabilityEntry[];
  dotColor: string;
  textShadow: React.CSSProperties | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-1">
      {entries.map((e) => (
        <span
          key={e.userId}
          title={`${e.name} — ${e.status}`}
          style={textShadow}
          className="inline-flex max-w-full items-center gap-0.5 truncate text-[8px] font-medium leading-none text-white sm:text-[9px]"
        >
          <span
            aria-hidden="true"
            className={`inline-block h-1 w-1 shrink-0 rounded-full ${dotColor}`}
          />
          <span className="truncate">{firstName(e.name)}</span>
        </span>
      ))}
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
