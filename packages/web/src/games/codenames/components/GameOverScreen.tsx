import type { CodenamesPlayerView } from "@boardgames/core/games/codenames/types";
import { useMemo } from "react";
import type { GameOverAction } from "../../../components/game-over";
import { teamName } from "../logic/labels";
import { buildClassicReview, classicDetail } from "../logic/review";
import { ReviewScreen, roomNotice } from "../table";

// Game over: the debrief — who won and how, then every clue with what it
// meant and every touch with why.

export default function GameOverScreen({
  view,
  names,
  actions,
  waitingForHost = false,
  error = null,
}: {
  view: CodenamesPlayerView;
  names: readonly (string | null)[];
  actions: readonly GameOverAction[];
  /** A room guest: the host decides whether there is another game. */
  waitingForHost?: boolean;
  /** Why a rematch couldn't start (someone left the table). */
  error?: string | null;
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
  const title =
    view.team === null ? `${teamName(result.winner)} wins` : won ? "You win!" : "You lose";
  return (
    <ReviewScreen
      title={title}
      tone={view.team === null ? "neutral" : won ? "win" : "lose"}
      detail={classicDetail(result, view.turns.length)}
      actions={actions}
      model={model}
      notice={roomNotice({ error, waitingForHost })}
    />
  );
}
