import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import { BoardOverlay } from "../../../../components/board";
import rerollDiceUrl from "../../assets/reroll-dice.svg";
import AltitudeWindow from "./AltitudeWindow";
import { HUD_ALTITUDE, HUD_REROLL, HUD_REROLL_WELL, HUD_WEATHER } from "./geometry";
import PlaneTop from "./PlaneTop";

interface Props {
  view: SkyTeamPlayerView;
}

/**
 * Top HUD — circular reroll medallion (with a small token-count badge) on the
 * left, weather/dice glyph panel in the middle, altitude readout on the right.
 *
 * Matches sky-team-lab `.top-hud`, `.reroll`, `.hud.weather`, `.hud.altitude`
 * 1:1 (same conic+radial gradients, same dark navy panel, same `↻` glyph).
 */
export default function TopHud({ view }: Props) {
  const rerollSize = HUD_REROLL.radius * 2;
  return (
    <>
      {/* Recessed well behind the reroll token — flat top, semicircular bottom. */}
      <BoardOverlay
        className="cockpit-reroll-well-shell"
        at={{ x: HUD_REROLL_WELL.x, y: HUD_REROLL_WELL.y }}
        anchor="top-left"
        width={HUD_REROLL_WELL.w}
        height={HUD_REROLL_WELL.h}
      >
        <div className="cockpit-reroll-well" aria-hidden="true" />
      </BoardOverlay>

      <BoardOverlay
        className="cockpit-reroll-shell"
        at={HUD_REROLL.center}
        anchor="center"
        width={rerollSize}
        height={rerollSize}
      >
        {/* biome-ignore lint/correctness/noRestrictedElements: medallion carries a custom navy 3D disc + dice icon; <Button> would override it. */}
        <button
          type="button"
          className="cockpit-reroll"
          aria-label={`Reroll tokens: ${view.rerollTokens}`}
        >
          <img src={rerollDiceUrl} alt="" className="cockpit-reroll__icon" />
        </button>
      </BoardOverlay>

      <BoardOverlay
        className="cockpit-hud-shell"
        at={{ x: HUD_WEATHER.x + HUD_WEATHER.w / 2, y: HUD_WEATHER.y + HUD_WEATHER.h / 2 }}
        anchor="center"
        width={HUD_WEATHER.w}
        height={HUD_WEATHER.h}
      >
        <div
          className="cockpit-hud cockpit-hud--current-approach sky-slot-bg"
          role="img"
          aria-label={`Current approach slot — ${view.approach.airliners[view.approach.current] ?? 0} airliner(s)`}
        >
          {Array.from({ length: view.approach.airliners[view.approach.current] ?? 0 }, (_, k) => (
            // Top-view SVG silhouette (not the ✈ text glyph — Apple devices
            // render U+2708 as the color emoji; and traffic on the approach
            // reads from above). rotate=45 from nose-up = the old text tilt.
            <PlaneTop
              // biome-ignore lint/suspicious/noArrayIndexKey: identical airliner glyphs, no other identity
              key={`current-airliner-${k}`}
              rotate={45}
              color="#ffffff"
              className="cockpit-current-airliner"
            />
          ))}
        </div>
      </BoardOverlay>

      <BoardOverlay
        className="cockpit-hud-shell"
        at={{ x: HUD_ALTITUDE.x + HUD_ALTITUDE.w / 2, y: HUD_ALTITUDE.y + HUD_ALTITUDE.h / 2 }}
        anchor="center"
        width={HUD_ALTITUDE.w}
        height={HUD_ALTITUDE.h}
      >
        <div
          className="cockpit-hud cockpit-hud--altitude sky-slot-bg"
          role="img"
          aria-label={`Altitude ${view.altitude.feet} feet — ${
            view.firstThisRound === 0 ? "Pilot" : "Co-Pilot"
          } places first${view.isFinalRound ? " — final round" : ""}`}
        >
          <AltitudeWindow view={view} />
        </div>
      </BoardOverlay>
    </>
  );
}
