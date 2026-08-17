import { Link } from "react-router-dom";
import { cn } from "../../../lib/cn.ts";
import { Avatar } from "../../ui/Avatar.tsx";

// One leaderboard column: ranked rows of avatar + name + a right-aligned
// value. The viewed player's row is always visible — rows outside the top-N
// collapse to "…" plus their row, so nobody's placement is ever hidden.

export type LeaderboardRow = {
  userId: string;
  name: string;
  image: string | null;
  rank: number;
  /** Right-aligned value text ("96th pct", "7 games"). */
  value: string;
};

const RANK_TONES: Record<number, string> = {
  1: "bg-amber-400/20 text-amber-200",
  2: "bg-white/10 text-fg-secondary",
  3: "bg-orange-400/15 text-orange-200",
};

function Row({ row, highlight }: { row: LeaderboardRow; highlight: boolean }) {
  return (
    <li>
      <Link
        to={`/u/${row.userId}`}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-white/5",
          highlight && "bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]/30",
        )}
      >
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-3xs font-bold tabular-nums",
            RANK_TONES[row.rank] ?? "text-fg-muted",
          )}
        >
          {row.rank}
        </span>
        <Avatar name={row.name} image={row.image} size="xs" />
        <span className="min-w-0 flex-1 truncate text-xs text-fg-primary">{row.name}</span>
        <span className="shrink-0 tabular-nums text-2xs text-fg-muted">{row.value}</span>
      </Link>
    </li>
  );
}

export function LeaderboardList({
  rows,
  highlightUserId,
  topN = 5,
}: {
  rows: readonly LeaderboardRow[];
  /** The viewed player — their row always renders, even below the fold. */
  highlightUserId?: string;
  topN?: number;
}) {
  const top = rows.slice(0, topN);
  const own = highlightUserId ? rows.find((r) => r.userId === highlightUserId) : undefined;
  const ownBelowFold = own !== undefined && own.rank > topN;
  return (
    <ul className="flex flex-col gap-0.5">
      {top.map((row) => (
        <Row key={row.userId} row={row} highlight={row.userId === highlightUserId} />
      ))}
      {ownBelowFold && own && (
        <>
          <li aria-hidden className="px-2 text-center text-2xs leading-3 text-fg-muted">
            …
          </li>
          <Row row={own} highlight />
        </>
      )}
    </ul>
  );
}
