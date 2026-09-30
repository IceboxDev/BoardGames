import { failsNeeded, MAX_REJECTIONS, teamSize } from "@boardgames/core/games/the-resistance/rules";
import { MicroLabel } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";

interface MissionTrackProps {
  playerCount: number;
  results: readonly (boolean | null)[];
  /** Fail counts per mission, where played. */
  fails: readonly (number | null)[];
  /** The mission being attempted now, if known. */
  current: number | null;
  rejections: number;
}

/** The five missions (team size, the double-fail mark, results) and the vote track. */
export function MissionTrack({
  playerCount,
  results,
  fails,
  current,
  rejections,
}: MissionTrackProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      <ol className="flex flex-wrap items-start justify-center gap-3 sm:gap-5">
        {results.map((result, m) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the five missions are positional
          <li key={m} className="flex flex-col items-center gap-1.5">
            <div
              className={cn(
                "flex h-14 w-14 flex-col items-center justify-center rounded-full border-2 transition-colors sm:h-16 sm:w-16",
                result === true && "border-sky-400 bg-sky-500/20",
                result === false && "border-rose-500 bg-rose-500/20",
                result === null && current === m && "border-amber-400 bg-fill",
                result === null && current !== m && "border-line-strong bg-fill-soft",
              )}
            >
              {result === null ? (
                <span className="text-xl font-bold text-fg-strong">{teamSize(playerCount, m)}</span>
              ) : (
                <span
                  className={cn("text-lg font-bold", result ? "text-sky-300" : "text-rose-300")}
                >
                  {result ? "✓" : "✗"}
                </span>
              )}
              {result !== null && (fails[m] ?? 0) > 0 && (
                <span className="text-3xs text-fg-secondary">
                  {fails[m]} fail{fails[m] === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <MicroLabel>
              {failsNeeded(playerCount, m) > 1 ? "2 fails" : `Mission ${m + 1}`}
            </MicroLabel>
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-2" title="Rejected proposals this round">
        <MicroLabel>Rejected</MicroLabel>
        {Array.from({ length: MAX_REJECTIONS }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed vote-track pips
            key={i}
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              i < rejections
                ? i === MAX_REJECTIONS - 1
                  ? "bg-rose-500"
                  : "bg-amber-400"
                : "bg-fill-strong",
            )}
          />
        ))}
        {rejections === MAX_REJECTIONS - 1 && (
          <span className="text-2xs font-semibold text-rose-400">Hammer — a rejection loses</span>
        )}
      </div>
    </div>
  );
}
