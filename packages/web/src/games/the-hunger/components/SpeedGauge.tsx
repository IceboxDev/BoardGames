import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "../../../lib/cn";
import type { SpeedReadout } from "../logic/speed";
import HungerIcon from "./HungerIcon";

const PIPS_MAX = 12;

/**
 * Your Speed, big, at the top of the left rail on every view: the number,
 * what it means right now, a row of bat wings (spent ones hollow) and the
 * Hunts still open. It glows while you're spending it.
 */
export default function SpeedGauge({
  readout,
  compact = false,
}: {
  readout: SpeedReadout;
  compact?: boolean;
}) {
  const reduced = useReducedMotion();
  const { value, of, label, detail, hunts, live } = readout;
  const total = of ?? value;
  const home = label === "Home";

  if (compact) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 font-card text-sm font-semibold tabular-nums ring-1",
          live
            ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/40"
            : "bg-fill text-fg-secondary ring-line",
        )}
        title={`${label}: ${value}${of !== undefined ? ` of ${of}` : ""}`}
      >
        <HungerIcon name="icon-speed" className="h-3.5 w-3.5" />
        {home ? "Home" : value}
      </span>
    );
  }

  return (
    <section
      aria-label={`${label}: ${value}${of !== undefined ? ` of ${of}` : ""}`}
      className={cn(
        "relative overflow-hidden rounded-card-xl px-4 pb-4 pt-3 ring-1 transition-colors",
        live ? "ring-emerald-400/40" : "ring-line",
      )}
      style={{
        background: live
          ? "radial-gradient(ellipse 90% 80% at 20% 0%, rgb(52 211 153 / 0.22), transparent 70%), linear-gradient(160deg, #10201b, #0c0a12)"
          : "linear-gradient(160deg, #17131d, #0c0a12)",
      }}
    >
      <HungerIcon
        name="icon-speed"
        className={cn(
          "pointer-events-none absolute -right-4 -top-3 h-28 w-28",
          live ? "text-emerald-300/10" : "text-fg-strong/5",
        )}
      />
      <span
        className={cn(
          "text-3xs font-semibold uppercase tracking-eyebrow",
          live ? "text-emerald-300" : "text-fg-muted",
        )}
      >
        {label}
      </span>
      <div className="flex items-end gap-2">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={home ? "home" : value}
            initial={reduced ? false : { y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduced ? undefined : { y: -14, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className={cn(
              "font-card text-6xl font-semibold leading-none tabular-nums",
              live ? "text-emerald-50" : "text-fg-strong",
            )}
            style={live ? { textShadow: "0 0 24px rgb(52 211 153 / 0.45)" } : undefined}
          >
            {home ? "⌂" : value}
          </motion.span>
        </AnimatePresence>
        {of !== undefined && (
          <span className="mb-1.5 font-card text-lg font-medium tabular-nums text-fg-muted">
            / {of}
          </span>
        )}
      </div>

      {!home && total > 0 && total <= PIPS_MAX && (
        <div className="mt-2 flex flex-wrap gap-1" aria-hidden>
          {Array.from({ length: total }, (_, i) => i).map((i) => (
            <HungerIcon
              key={i}
              name="icon-speed"
              className={cn(
                "h-4 w-4 transition-colors",
                i < value ? (live ? "text-emerald-300" : "text-fg-secondary") : "text-fg-strong/15",
              )}
            />
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 text-2xs text-fg-muted">
        <span className="truncate">{detail}</span>
        {hunts !== undefined && (
          <span className="flex shrink-0 items-center gap-1 font-semibold text-fg-secondary">
            <HungerIcon name="icon-hunt" className="h-3.5 w-3.5" />
            {hunts} hunt{hunts === 1 ? "" : "s"}
          </span>
        )}
      </div>
    </section>
  );
}
