import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import { Button } from "../../../components/ui/Button";

interface Props {
  view: SkyTeamPlayerView;
  isAiThinking?: boolean;
  onEndRound?: () => void;
  onAcknowledgeGameOver?: () => void;
}

const OUTCOME_HEADLINES: Record<string, { label: string; tone: "win" | "lose" }> = {
  win: { label: "Smooth landing!", tone: "win" },
  "loss-spin": { label: "Crash — axis spin", tone: "lose" },
  "loss-collision": { label: "Crash — airliner collision", tone: "lose" },
  "loss-overshoot": { label: "Crash — overshot the airport", tone: "lose" },
  "loss-overrun": { label: "Crash — runway overrun", tone: "lose" },
  "loss-undershoot": { label: "Crash — out of altitude", tone: "lose" },
  "loss-mandatory": { label: "Crash — mandatory dice unplaced", tone: "lose" },
  "loss-airliners-remain": { label: "Crash — airliners not cleared", tone: "lose" },
  "loss-gear-or-flaps": { label: "Crash — gear/flaps not deployed", tone: "lose" },
  "loss-axis-not-level": { label: "Crash — axis not level on touchdown", tone: "lose" },
};

export default function PhaseBanner({
  view,
  isAiThinking,
  onEndRound,
  onAcknowledgeGameOver,
}: Props) {
  // Game just ended (crash or victory). The machine is parked in
  // `awaitingGameOver` until a human dispatches `acknowledge-game-over`,
  // which lets the team study the final board (e.g. which die triggered
  // the collision) before the GameOverScreen swaps in.
  if (view.canAcknowledgeGameOver) {
    const meta = view.outcome ? OUTCOME_HEADLINES[view.outcome] : undefined;
    const tone = meta?.tone ?? "lose";
    return (
      <span className="flex items-center gap-3">
        <span
          className={[
            "text-sm font-semibold",
            tone === "win" ? "text-emerald-300" : "text-rose-300",
          ].join(" ")}
        >
          {meta?.label ?? "Game over"}
        </span>
        <Button
          variant="primary"
          size="sm"
          onClick={onAcknowledgeGameOver}
          disabled={!onAcknowledgeGameOver}
          className={
            tone === "win"
              ? "!bg-emerald-600 hover:!bg-emerald-500 !shadow-emerald-500/20"
              : "!bg-rose-600 hover:!bg-rose-500 !shadow-rose-500/20"
          }
        >
          {tone === "win" ? "Review landing" : "View crash"}
        </Button>
      </span>
    );
  }

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
