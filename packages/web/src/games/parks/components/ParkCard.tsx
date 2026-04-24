import type { Park, ResourceType } from "@boardgames/core/games/parks/types";
import { RESOURCE_COLORS, RESOURCE_EMOJI } from "@boardgames/core/games/parks/types";

interface ParkCardProps {
  park: Park;
  affordable?: boolean;
  onClick?: () => void;
  compact?: boolean;
}

function CostPills({ park }: { park: Park }) {
  const pills: { r: ResourceType; count: number }[] = [];
  for (const r of ["M", "F", "S", "W", "A"] as ResourceType[]) {
    if (park.cost[r] > 0) pills.push({ r, count: park.cost[r] });
  }
  return (
    <div className="flex flex-wrap gap-0.5">
      {pills.map(({ r, count }) => (
        <span
          key={r}
          className="inline-flex items-center gap-0.5 rounded-full px-1 py-0.5 text-[9px] font-bold text-white ring-1 ring-white/10"
          style={{ backgroundColor: `${RESOURCE_COLORS[r]}33` }}
          title={`${count} × ${r}`}
        >
          <span>{RESOURCE_EMOJI[r]}</span>
          <span className="text-[10px]">{count}</span>
        </span>
      ))}
    </div>
  );
}

function RefundPills({ park }: { park: Park }) {
  const pills: { r: ResourceType; count: number }[] = [];
  for (const r of ["M", "F", "S", "W", "A"] as ResourceType[]) {
    if (park.refund[r] > 0) pills.push({ r, count: park.refund[r] });
  }
  if (pills.length === 0 && !park.endGameDividedBonus) return null;
  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <span className="text-[9px] font-bold text-emerald-400">+</span>
      {pills.map(({ r, count }) => (
        <span
          key={r}
          className="inline-flex items-center gap-0.5 rounded-full px-1 py-0.5 text-[9px] font-bold text-white ring-1 ring-white/10"
          style={{ backgroundColor: `${RESOURCE_COLORS[r]}33` }}
        >
          <span>{RESOURCE_EMOJI[r]}</span>
          <span className="text-[10px]">{count}</span>
        </span>
      ))}
      {park.endGameDividedBonus && (
        <span
          className="inline-flex items-center rounded-full bg-violet-900/40 px-1 py-0.5 text-[9px] font-bold text-violet-200"
          title="End-game scoring bonus"
        >
          ★
        </span>
      )}
    </div>
  );
}

export default function ParkCard({ park, affordable, onClick, compact }: ParkCardProps) {
  const interactive = onClick && affordable;
  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      className={`flex ${compact ? "min-w-[120px]" : "min-w-[140px]"} flex-col gap-1 rounded-md border bg-stone-900/60 p-1.5 text-left transition disabled:cursor-default ${
        interactive
          ? "cursor-pointer border-emerald-500/60 ring-1 ring-emerald-400/30 hover:bg-stone-800"
          : affordable === false
            ? "border-stone-700/60 opacity-60"
            : "border-stone-700/60"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={`text-[11px] font-bold leading-tight ${compact ? "" : "line-clamp-2"} text-white`}
        >
          {park.name}
        </div>
        <span className="rounded bg-yellow-900/40 px-1.5 py-0.5 text-[10px] font-bold text-yellow-300">
          {park.pt} PT
        </span>
      </div>
      <CostPills park={park} />
      <RefundPills park={park} />
    </button>
  );
}
