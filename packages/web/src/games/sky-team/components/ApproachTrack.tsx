import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import Plane from "./board/Plane";
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
 *
 * The 240/88 ratio is the slots' NATURAL size only — every level of the
 * column (`ol`, `li`) carries `min-h-0` so on short viewports the slots
 * compress evenly and the whole track always fits the sidebar without
 * scrolling. The airliner planes are sized relative to the slot height,
 * so they scale down with it.
 */
export default function ApproachTrack({ view }: Props) {
  const { airliners, current, airportIndex } = view.approach;
  const spaces = airliners.length;
  // Top → bottom = highest index (airport) → lowest (start).
  const order = Array.from({ length: spaces }, (_, k) => spaces - 1 - k);

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
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

      <ol className="flex min-h-0 flex-col gap-1.5">
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
                // at the top of the cockpit (240 × 88) when space allows;
                // min-h-0 lets the slot squash on short viewports.
                "sky-slot-bg relative flex min-h-0 aspect-[240/88] items-center justify-center overflow-hidden rounded-md border",
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
                  className="absolute inset-0 flex items-center justify-center gap-1.5"
                  role="img"
                  aria-label={`${planes} airliner${planes === 1 ? "" : "s"}`}
                >
                  {Array.from({ length: planes }, (_, k) => (
                    // SVG silhouette instead of the ✈ text glyph — Apple
                    // devices render U+2708 as the color emoji, the SVG is
                    // identical everywhere. rotate=45 from nose-up matches
                    // the old climbing-to-the-right orientation.
                    <Plane
                      // biome-ignore lint/suspicious/noArrayIndexKey: identical airliner glyphs, no other identity
                      key={`a-${i}-${k}`}
                      rotate={45}
                      color="#ffffff"
                      className="h-[55%] drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]"
                    />
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
