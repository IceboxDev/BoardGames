import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import { BoardOverlay } from "../../../../components/board";
import rerollDiceUrl from "../../assets/reroll-dice.svg";
import { HUD_ALTITUDE, HUD_REROLL, HUD_REROLL_WELL, HUD_WEATHER } from "./geometry";

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
          className="cockpit-hud cockpit-hud--weather"
          role="img"
          aria-label={`Weather forecast — round ${view.round} of ${view.scenario.totalRounds}`}
        >
          <span className="cockpit-weather__icons">☁ ☁</span>
          <span className="cockpit-weather__dice">⚂ ⚂</span>
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
          className="cockpit-hud cockpit-hud--altitude"
          role="img"
          aria-label={`Altitude ${view.altitude.feet} feet${view.isFinalRound ? " — final round" : ""}`}
        >
          {view.altitude.feet}
        </div>
      </BoardOverlay>
    </>
  );
}
