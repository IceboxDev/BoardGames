import type { Clan } from "@boardgames/core/games/senso-battle-for-japan/types";
import { CLAN_SHORT } from "@boardgames/core/games/senso-battle-for-japan/types";
import type { CSSProperties } from "react";
import { cn } from "../../../lib/cn";
import { CLAN_FILL, CLAN_INK, EMPEROR_GOLD } from "../colors";

// The two identity marks every seat carries, shared by the clan rail, the
// trick table's seat plates and the final standings: the clan monogram
// square (帝 in gold for the Emperor, who owns no clan) and the seven trick
// pips with the 1 / 3 / 5 / 7 reward thresholds ringed. Sized by props, in
// px, because the trick table draws them on a scaled canvas where Tailwind
// steps are the wrong unit.

const EMPEROR_INK = "#2b2200";

export function SeatMon({
  clan,
  size = 24,
  className,
}: {
  clan: Clan | null;
  /** Edge length in px. */
  size?: number;
  className?: string;
}) {
  const style: CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.42),
    background: clan === null ? EMPEROR_GOLD : CLAN_FILL[clan],
    color: clan === null ? EMPEROR_INK : CLAN_INK[clan],
  };
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-ui-md font-bold leading-none",
        className,
      )}
      style={style}
    >
      {clan === null ? "帝" : CLAN_SHORT[clan]}
    </span>
  );
}

/** Seven pips per seat with the 1 / 3 / 5 / 7 reward thresholds ringed. */
export function TrickPips({
  won,
  dot = 6,
  className,
}: {
  won: number;
  /** Pip diameter in px. */
  dot?: number;
  className?: string;
}) {
  const gap = Math.max(2, Math.round(dot / 3));
  return (
    <div
      className={cn("flex items-center", className)}
      style={{ gap }}
      role="img"
      aria-label={`${won} conflicts won`}
    >
      {Array.from({ length: 7 }, (_, i) => {
        const n = i + 1;
        const filled = n <= won;
        const threshold = n % 2 === 1;
        return (
          <span
            key={n}
            className={cn(
              "rounded-full",
              filled ? "bg-amber-400" : "bg-fill-strong",
              threshold && !filled && "ring-1 ring-amber-400/50",
            )}
            style={{ width: dot, height: dot }}
          />
        );
      })}
      {won > 7 && <span className="text-4xs text-fg-muted">+{won - 7}</span>}
    </div>
  );
}
