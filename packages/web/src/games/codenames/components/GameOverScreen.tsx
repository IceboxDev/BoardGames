import type { CodenamesPlayerView, Team } from "@boardgames/core/games/codenames/types";
import { useMemo } from "react";
import type { GameOverAction } from "../../../components/game-over";
import { teamName } from "../logic/labels";
import { buildClassicReview } from "../logic/review";
import { ReviewScreen } from "./review/ReviewScreen";

// Game over: the debrief — who won and how, then every clue with what it
// meant and every touch with why.

export default function GameOverScreen({
  view,
  names,
  actions,
}: {
  view: CodenamesPlayerView;
  names: readonly (string | null)[];
  actions: readonly GameOverAction[];
}) {
  const model = useMemo(
    () =>
      buildClassicReview({
        words: view.cards.map((c) => c.word),
        key: view.cards.map((c) => c.key ?? "bystander"),
        startingTeam: view.startingTeam,
        turns: view.turns,
        ai: view.seats.map((s) => s.tier),
        names,
      }),
    [view, names],
  );
  const result = view.result;
  if (!result) return null;

  const won = view.team !== null && result.winner === view.team;
  const loser = (1 - result.winner) as Team;
  const title =
    view.team === null ? `${teamName(result.winner)} wins` : won ? "You win!" : "You lose";
  const how =
    result.reason === "assassin"
      ? `${teamName(loser)} touched the assassin`
      : `${teamName(result.winner)} found every agent`;

  return (
    <ReviewScreen
      title={title}
      tone={view.team === null ? "neutral" : won ? "win" : "lose"}
      detail={`${how} · Red ${result.agentsFound[0]} · Blue ${result.agentsFound[1]} · ${view.turns.length} turns`}
      actions={actions}
      model={model}
    />
  );
}
