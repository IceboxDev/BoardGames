import { buildPlayerView } from "@boardgames/core/games/senso-battle-for-japan/player-view";
import {
  isSensoReplay,
  type ReplayStep,
  replaySteps,
  type SensoReplay,
} from "@boardgames/core/games/senso-battle-for-japan/replay";
import type { LogEntry } from "@boardgames/core/games/senso-battle-for-japan/types";
import {
  AI_STRATEGY_LABELS,
  CLAN_LABELS,
} from "@boardgames/core/games/senso-battle-for-japan/types";
import { useMemo } from "react";
import { ReplayControls, useReplayPlayback } from "../../../components/replay";
import useDocumentTitle from "../../../hooks/useDocumentTitle";
import type { ReplayProps } from "../../types";
import { cardLabel } from "../logic/cards";
import GameBoard from "./GameBoard";

function seatName(strategy: string | null, clan: string | null): string {
  const who =
    strategy === null
      ? "You"
      : (AI_STRATEGY_LABELS[strategy as keyof typeof AI_STRATEGY_LABELS] ?? strategy);
  return clan ? `${who} · ${CLAN_LABELS[clan as keyof typeof CLAN_LABELS]}` : `${who} · Emperor`;
}

function describe(step: ReplayStep, names: readonly string[]): string {
  const { entry, action } = step;
  if (!entry || !action) return "Round 1 · cards dealt";
  const name = (seat: number) => names[seat] ?? `Seat ${seat + 1}`;
  switch (entry.kind) {
    case "trick-won": {
      if (action.type !== "play") return "";
      const seat = entry.plays.find((p) => p.card === action.card)?.seat ?? 0;
      const last = entry.plays[entry.plays.length - 1]?.card === action.card;
      const played = `Round ${entry.round} · trick ${entry.trick} · ${name(seat)} plays ${cardLabel(action.card)}`;
      return last ? `${played} — ${name(entry.winner)} wins the trick` : played;
    }
    case "reward":
      return `Round ${entry.round} · ${name(entry.player)} (tier ${entry.tier}): ${rewardLabel(entry)}`;
    case "reward-pass":
      return `Round ${entry.round} · ${name(entry.player)} passes the reward`;
    case "bonus":
      return `Bonus · ${name(entry.player)} places a cube in region ${entry.region + 1}`;
    case "bonus-pass":
      return `Bonus · ${name(entry.player)} passes`;
    default:
      return "";
  }
}

function rewardLabel(entry: Extract<LogEntry, { kind: "reward" }>): string {
  const a = entry.action;
  const region = (r: number) => `region ${r + 1}`;
  switch (a.type) {
    case "determination":
      return `Determination in ${region(a.region)}`;
    case "aggression":
      return `Aggression in ${region(a.region)}`;
    case "balance-swap":
      return `Balance (swap) in ${region(a.region)}`;
    case "balance-move":
      return `Balance (move) ${region(a.region)} → ${region(a.to)}`;
    case "balance-replace":
      return `Balance (replace) ${region(a.region)} → ${region(a.to)}`;
    default:
      return "Reward";
  }
}

/** Re-simulate the record; a game played under an earlier ruleset no longer replays. */
function stepsOf(replay: SensoReplay | null): { steps: ReplayStep[]; stale: boolean } {
  if (!replay) return { steps: [], stale: false };
  try {
    return { steps: replaySteps(replay), stale: false };
  } catch {
    return { steps: [], stale: true };
  }
}

export default function GameReplay({ game }: ReplayProps) {
  const replay = isSensoReplay(game) ? game : null;
  const { steps, stale } = useMemo(() => stepsOf(replay), [replay]);
  const playback = useReplayPlayback(steps.length);
  const names = useMemo(
    () => (replay ? replay.strategies.map((s, i) => seatName(s, replay.clans[i] ?? null)) : []),
    [replay],
  );
  const humanSeat = replay ? Math.max(0, replay.strategies.indexOf(null)) : 0;
  useDocumentTitle(
    replay
      ? `Replay · ${replay.playerCount} players · ${replay.scores.join("–")} · Sensō`
      : "Replay · Sensō",
  );
  if (stale) {
    return (
      <p className="p-4 text-sm text-fg-muted">
        This game was recorded under an earlier ruleset and can no longer be re-simulated.
      </p>
    );
  }
  if (!replay || steps.length === 0) {
    return <p className="p-4 text-sm text-fg-muted">This replay cannot be shown.</p>;
  }
  const step = steps[playback.stepIndex];
  const view = buildPlayerView(step.state, humanSeat);
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <GameBoard
          view={view}
          legalActions={[]}
          isMyTurn={false}
          isAiThinking={false}
          playerNames={names}
          onAction={() => {}}
        />
      </div>
      <ReplayControls
        playback={playback}
        description={describe(step, names)}
        className="border-t border-line px-3 py-2"
      />
    </div>
  );
}
