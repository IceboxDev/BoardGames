import type { Role } from "@boardgames/core/games/the-resistance/record";
import type { SeatNamer } from "@boardgames/core/games/the-resistance/solver/deductions";
import type { Snapshot } from "@boardgames/core/games/the-resistance/solver/posterior";
import { Badge, ProgressBar } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { pct } from "../../logic/solver";

interface SpyBarsProps {
  snapshot: Snapshot;
  name: SeatNamer;
  /** Seats to ring (the team being looked at). */
  highlight?: readonly number[];
  /** Real roles, when the game is over — shown as a quiet tag. */
  roles?: readonly Role[] | null;
  /** Denser rows for the in-game rail. */
  compact?: boolean;
}

/** P(spy) per seat, with PROVEN states called out. */
export function SpyBars({ snapshot, name, highlight = [], roles, compact }: SpyBarsProps) {
  const seats = snapshot.pSpy.map((p, seat) => ({ seat, p, core: snapshot.pSpyCore[seat] ?? 0 }));
  return (
    <ul className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2")}>
      {seats.map(({ seat, p, core }) => {
        const proven = core === 1 ? "spy" : core === 0 ? "resistance" : null;
        return (
          <li
            key={seat}
            className={cn(
              "grid grid-cols-[minmax(0,6rem)_minmax(0,1fr)_auto] items-center gap-2",
              highlight.includes(seat) && "text-fg-strong",
            )}
          >
            <span
              className={cn(
                "truncate text-xs",
                highlight.includes(seat) ? "font-semibold text-fg-strong" : "text-fg-secondary",
              )}
            >
              {name(seat)}
            </span>
            <ProgressBar
              value={p}
              tone={proven === "resistance" ? "sky" : "rose"}
              size={compact ? "sm" : "md"}
              label={`${name(seat)} spy chance`}
              animate
            />
            <span className="flex items-center justify-end gap-1">
              {proven ? (
                <Badge size="xs" tone={proven === "spy" ? "rose" : "sky"}>
                  {proven === "spy" ? "Spy" : "Clean"}
                </Badge>
              ) : (
                <span className="w-9 text-right text-2xs tabular-nums text-fg-muted">{pct(p)}</span>
              )}
              {roles && !compact && (
                <span
                  className={cn(
                    "w-4 text-center text-2xs",
                    roles[seat] === "spy" ? "text-rose-400" : "text-sky-400",
                  )}
                  title={roles[seat] === "spy" ? "Was a spy" : "Was Resistance"}
                >
                  {roles[seat] === "spy" ? "●" : "○"}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
