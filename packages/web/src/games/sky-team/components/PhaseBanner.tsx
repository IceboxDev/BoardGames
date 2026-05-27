import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import { Button } from "../../../components/ui/Button";

interface Props {
  view: SkyTeamPlayerView;
  isAiThinking?: boolean;
  onEndRound?: () => void;
}

export default function PhaseBanner({ view, isAiThinking, onEndRound }: Props) {
  if (view.outcome) return null;

  // The game runs 7 rounds (printed rules); the 7th is the final-approach
  // landing round. The counter reads "Round N/7" the whole way, and we
  // tack on "— Final Approach" for the last one so the player still gets
  // the heads-up that the landing check is about to fire.
  const roundLabel = view.isFinalRound
    ? `Round ${view.round}/${view.scenario.totalRounds} — Final Approach`
    : `Round ${view.round}/${view.scenario.totalRounds}`;

  // All dice placed — the machine is parked in `awaitingEndRound` until a
  // human dispatches `end-round`. The button itself reads as "End round"
  // (or "Land the plane" on the final approach); no helper text needed.
  if (view.canEndRound) {
    return (
      <Button
        variant="primary"
        size="sm"
        onClick={onEndRound}
        disabled={!onEndRound}
        className="!bg-emerald-600 hover:!bg-emerald-500 !shadow-emerald-500/20"
      >
        {view.isFinalRound ? "Land the plane" : "End round"}
      </Button>
    );
  }

  if (view.phase === "briefing") {
    // Once you've confirmed Ready (and in solo we auto-confirm), the
    // "discuss, then Ready" copy is stale — switch to a partner-wait
    // message so the brief gap before placement reads as "the other side
    // is catching up" rather than "you still need to do something".
    const meReady = view.readyForRoll[view.viewerIndex];
    return (
      <span className="text-sm text-amber-300">
        {meReady ? "Waiting for partner…" : `${roundLabel} briefing — discuss, then Ready`}
      </span>
    );
  }

  if (view.phase === "placement") {
    if (isAiThinking) {
      return <span className="text-sm text-purple-300">AI is thinking…</span>;
    }
    const placerLabel = view.toPlace === 0 ? "Pilot" : "Co-Pilot";
    const meTurn = view.toPlace === view.viewerIndex;
    return (
      <span
        className={[
          "rounded px-2 py-0.5 text-sm",
          meTurn ? "bg-yellow-500/20 text-yellow-200 ring-1 ring-yellow-400/40" : "text-slate-400",
        ].join(" ")}
      >
        {meTurn ? `${roundLabel} — your turn to place` : `Waiting for ${placerLabel}…`}
      </span>
    );
  }

  return <span className="text-sm text-slate-400">…</span>;
}
