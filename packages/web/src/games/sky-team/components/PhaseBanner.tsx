import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";

interface Props {
  view: SkyTeamPlayerView;
  isAiThinking?: boolean;
}

export default function PhaseBanner({ view, isAiThinking }: Props) {
  if (view.outcome) return null;

  const seatBadge = (
    <span
      className={[
        "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        view.viewerIndex === 0 ? "bg-sky-700 text-sky-100" : "bg-orange-700 text-orange-100",
      ].join(" ")}
    >
      You: {view.viewerIndex === 0 ? "Pilot" : "Co-Pilot"}
    </span>
  );

  if (view.phase === "briefing") {
    return (
      <span className="flex items-center gap-2 text-sm">
        {seatBadge}
        <span className="text-amber-300">
          Round {view.round}/{view.scenario.totalRounds} briefing — discuss, then Ready
        </span>
      </span>
    );
  }

  if (view.phase === "placement") {
    if (isAiThinking) {
      return (
        <span className="flex items-center gap-2 text-sm">
          {seatBadge}
          <span className="text-purple-300">AI is thinking…</span>
        </span>
      );
    }
    const placerLabel = view.toPlace === 0 ? "Pilot" : "Co-Pilot";
    const meTurn = view.toPlace === view.viewerIndex;
    return (
      <span className="flex items-center gap-2 text-sm">
        {seatBadge}
        <span
          className={[
            "rounded px-2 py-0.5",
            meTurn
              ? "bg-yellow-500/20 text-yellow-200 ring-1 ring-yellow-400/40"
              : "text-slate-400",
          ].join(" ")}
        >
          {meTurn
            ? `Round ${view.round}/${view.scenario.totalRounds} — your turn to place`
            : `Waiting for ${placerLabel}…`}
        </span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2 text-sm text-slate-400">
      {seatBadge}
      <span>…</span>
    </span>
  );
}
