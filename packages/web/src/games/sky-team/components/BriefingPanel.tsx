import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";

interface Props {
  view: SkyTeamPlayerView;
  onReady: () => void;
}

export default function BriefingPanel({ view, onReady }: Props) {
  const myReady = view.readyForRoll[view.viewerIndex];
  const oppIdx = (1 - view.viewerIndex) as 0 | 1;
  const oppReady = view.readyForRoll[oppIdx];
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-md border-2 border-amber-700 bg-amber-950/40 p-6 text-center">
      <h2 className="text-xl font-bold text-amber-200">
        Round {view.round} of {view.scenario.totalRounds} — Briefing
      </h2>
      <p className="text-sm text-amber-100/80">
        Discuss your plan now. Once you click Ready, the dice are rolled and you must be{" "}
        <strong>silent about specific dice values</strong> for the rest of the round.
      </p>
      <div className="flex w-full justify-around text-xs">
        <div className="flex flex-col items-center gap-1">
          <span className="text-sky-300">Pilot</span>
          <span
            className={[
              "rounded-full px-3 py-1",
              view.readyForRoll[0] ? "bg-emerald-700 text-white" : "bg-slate-700 text-slate-300",
            ].join(" ")}
          >
            {view.readyForRoll[0] ? "Ready" : "Not ready"}
          </span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-orange-300">Co-Pilot</span>
          <span
            className={[
              "rounded-full px-3 py-1",
              view.readyForRoll[1] ? "bg-emerald-700 text-white" : "bg-slate-700 text-slate-300",
            ].join(" ")}
          >
            {view.readyForRoll[1] ? "Ready" : "Not ready"}
          </span>
        </div>
      </div>
      <button
        type="button"
        disabled={myReady}
        onClick={onReady}
        className="rounded-md bg-emerald-600 px-6 py-2 font-bold text-white shadow disabled:bg-slate-700 disabled:text-slate-400"
      >
        {myReady ? (oppReady ? "Rolling…" : "Waiting for partner") : "Ready to roll"}
      </button>
    </div>
  );
}
