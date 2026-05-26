import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import "./board/cockpit.css";

interface Props {
  view: SkyTeamPlayerView;
}

/**
 * Vertical approach corridor for the left sidebar. Slots match the
 * weather/altitude HUD aspect ratio (240/88) and gradient (`sky-slot-bg`)
 * so the three blue blocks read as a family. Reversed top-down: airport
 * sits at the top, the player's plane is at the current slot (marked by an
 * amber outline only — no plane glyph) and "flies upward" as it advances.
 *
 * Slot labels are relative to the player's current position: the current
 * slot is "1" and labels count up from there, so the airport is always
 * `airportIndex - current + 1` regardless of how far along the player is.
 * Slots already passed get no label.
 */
export default function ApproachTrack({ view }: Props) {
  const { airliners, current, airportIndex } = view.approach;
  const spaces = airliners.length;
  // Top → bottom = highest index (airport) → lowest (start).
  const order = Array.from({ length: spaces }, (_, k) => spaces - 1 - k);

  return (
    <div className="flex h-full flex-col justify-center gap-3">
      {/* Approach card title — names the destination rather than scattering
          tiny YUL pills across the slot grid. The lime colour itself encodes
          the route variant (Sky Team's YUL ships green / orange / red routes);
          the route name doesn't need to be spelled out. */}
      <header className="shrink-0 text-center">
        <div className="text-base font-extrabold uppercase tracking-[0.22em] text-lime-400">
          YUL
        </div>
        <div className="text-[10px] uppercase tracking-wide text-slate-400">Montréal-Trudeau</div>
      </header>

      <ol className="flex flex-col gap-1.5">
        {order.map((i) => {
          const isCurrent = i === current;
          const isAirport = i === airportIndex;
          const planes = airliners[i] ?? 0;
          const passed = i < current;
          const relLabel = i >= current ? i - current + 1 : null;
          return (
            <li
              key={`space-${i + 1}`}
              className={[
                // Identical aspect ratio to the weather + altitude HUD slots
                // at the top of the cockpit (240 × 88).
                "sky-slot-bg relative flex aspect-[240/88] items-center justify-center overflow-hidden rounded-md border",
                isCurrent
                  ? "border-amber-300/90 ring-2 ring-amber-300/60"
                  : isAirport
                    ? "border-lime-400/70"
                    : "border-slate-700/60",
                passed ? "opacity-40 saturate-50" : "",
              ].join(" ")}
              aria-label={isAirport ? "YUL airport" : undefined}
            >
              {relLabel !== null && (
                <span className="absolute left-1.5 top-0.5 text-[10px] font-semibold text-slate-200/80">
                  {relLabel}
                </span>
              )}

              {planes > 0 && (
                <div
                  className="flex items-center justify-center gap-1.5"
                  role="img"
                  aria-label={`${planes} airliner${planes === 1 ? "" : "s"}`}
                >
                  {Array.from({ length: planes }, (_, k) => (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: identical airliner glyphs, no other identity
                      key={`a-${i}-${k}`}
                      aria-hidden="true"
                      className="-rotate-45 text-4xl leading-none text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]"
                    >
                      ✈
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
