import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import { BoardOverlay } from "../../../../components/board";
import { COCKPIT_VIEWBOX, HUD_ALTITUDE, HUD_REROLL, HUD_WEATHER } from "./geometry";

interface Props {
  view: SkyTeamPlayerView;
}

/**
 * Top HUD strip: reroll medallion + weather/scenario panel + altitude readout.
 * Rendered as three HTML islands anchored to viewBox coords so they scale with
 * the board.
 */
export default function TopHud({ view }: Props) {
  return (
    <>
      <BoardOverlay
        at={HUD_REROLL.center}
        anchor="center"
        width={HUD_REROLL.radius * 2}
        height={HUD_REROLL.radius * 2}
      >
        <div className="relative flex h-full w-full flex-col items-center justify-center rounded-full border-[3px] border-[#2b5869] bg-[radial-gradient(circle_at_33%_39%,#35abdb_0_8%,transparent_10%),radial-gradient(circle_at_68%_36%,#eab52d_0_9%,transparent_11%),radial-gradient(circle_at_61%_70%,#2a4ea2_0_10%,transparent_12%),conic-gradient(#2c60c0_0_32%,#eeb52e_32%_58%,#28439b_58%_100%)] text-white shadow-md">
          <span className="absolute inset-0 grid place-items-center text-2xl font-extrabold drop-shadow-[0_1px_2px_rgba(0,0,0,.35)]">
            {view.rerollTokens}
          </span>
        </div>
      </BoardOverlay>

      <BoardOverlay
        at={{ x: HUD_WEATHER.x + HUD_WEATHER.w / 2, y: HUD_WEATHER.y + HUD_WEATHER.h / 2 }}
        anchor="center"
        width={HUD_WEATHER.w}
        height={HUD_WEATHER.h}
      >
        <div className="flex h-full w-full flex-col items-center justify-center rounded-b-lg bg-[#163757] text-slate-100 shadow-md">
          <div className="text-[10px] uppercase tracking-[3px] text-slate-300">
            Round {view.round} / {view.scenario.totalRounds}
          </div>
          <div className="text-[10px] font-medium uppercase tracking-[2px] text-slate-300/85">
            {view.scenario.name}
          </div>
        </div>
      </BoardOverlay>

      <BoardOverlay
        at={{ x: HUD_ALTITUDE.x + HUD_ALTITUDE.w / 2, y: HUD_ALTITUDE.y + HUD_ALTITUDE.h / 2 }}
        anchor="center"
        width={HUD_ALTITUDE.w}
        height={HUD_ALTITUDE.h}
      >
        <div
          className={`flex h-full w-full items-center justify-center rounded-b-lg border-2 ${
            view.isFinalRound ? "border-amber-400 bg-amber-900/70" : "border-[#10324d] bg-[#163757]"
          } text-slate-100 shadow-md`}
        >
          <div className="flex items-baseline gap-2 px-3">
            <span className="text-[10px] uppercase tracking-widest text-slate-300">Alt</span>
            <span className="font-mono text-lg font-extrabold text-emerald-300">
              {view.altitude.feet}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-slate-400">ft</span>
            {view.isFinalRound ? (
              <span className="ml-2 rounded bg-amber-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-50">
                Final
              </span>
            ) : null}
          </div>
        </div>
      </BoardOverlay>

      {/* Tiny anchor reference for future absolute work; keeps tree resilient. */}
      <BoardOverlay at={{ x: 0, y: 0 }} anchor="top-left" width={0} height={0}>
        <span className="sr-only">
          Cockpit viewBox {COCKPIT_VIEWBOX.width}×{COCKPIT_VIEWBOX.height}
        </span>
      </BoardOverlay>
    </>
  );
}
