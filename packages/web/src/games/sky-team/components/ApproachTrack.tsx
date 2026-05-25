import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";

interface Props {
  view: SkyTeamPlayerView;
}

/**
 * Vertical approach corridor for the left sidebar. Rendered bottom-up: the plane
 * sits near the BOTTOM and "flies upward" toward the airport (YUL) at the TOP as
 * it advances — so passed spaces are below it and the destination is above.
 * Fills the full height of the sidebar. Mirrors `view.approach`.
 */
export default function ApproachTrack({ view }: Props) {
  const { airliners, current, airportIndex } = view.approach;
  const spaces = airliners.length;
  const remaining = airliners.reduce((a, b) => a + b, 0);
  // Top → bottom = highest space (airport) → lowest (start). Plane flies up.
  const order = Array.from({ length: spaces }, (_, k) => spaces - 1 - k);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 text-xs">
      <div className="flex shrink-0 items-center justify-between text-[10px] uppercase tracking-wide text-slate-400">
        <span>
          Space <span className="font-bold text-slate-200">{current + 1}</span> / {airportIndex + 1}
        </span>
        <span className={remaining > 0 ? "text-rose-300" : "text-emerald-300"}>
          {remaining} airliner{remaining === 1 ? "" : "s"}
        </span>
      </div>

      <ol className="flex min-h-0 flex-1 flex-col gap-1">
        {order.map((i) => {
          const isCurrent = i === current;
          const isAirport = i === airportIndex;
          const planes = airliners[i] ?? 0;
          const passed = i < current;
          return (
            <li
              key={`space-${i + 1}`}
              className={[
                "flex flex-1 items-center gap-2 rounded-md border px-2",
                isCurrent
                  ? "border-sky-400 bg-sky-500/15"
                  : isAirport
                    ? "border-amber-500/50 bg-amber-500/10"
                    : "border-slate-700/60 bg-slate-800/40",
                passed ? "opacity-40" : "",
              ].join(" ")}
            >
              <span className="w-4 shrink-0 text-center text-[10px] text-slate-500">{i + 1}</span>

              <div className="flex flex-1 items-center gap-1.5">
                {isAirport && (
                  <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-slate-900">
                    🛬 YUL
                  </span>
                )}
                {planes > 0 && (
                  <span
                    className="flex items-center gap-0.5 text-rose-400"
                    title={`${planes} airliner(s)`}
                  >
                    {Array.from({ length: planes }, (_, k) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: identical airliner glyphs, no other identity
                      <span key={`a-${i}-${k}`}>✈</span>
                    ))}
                  </span>
                )}
                {!isAirport && planes === 0 && !isCurrent && (
                  <span className="text-slate-600">·</span>
                )}
              </div>

              {isCurrent && (
                <span className="flex shrink-0 items-center gap-1 text-sky-300">
                  <span className="text-sm">✈</span>
                  <span className="text-[10px] font-semibold uppercase">You</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
