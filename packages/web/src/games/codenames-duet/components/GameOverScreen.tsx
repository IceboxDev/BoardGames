import type { DuetPlayerView } from "@boardgames/core/games/codenames-duet/types";
import { useMemo } from "react";
import type { GameOverAction } from "../../../components/game-over";
import { ReviewScreen } from "../../codenames/components/review/ReviewScreen";
import { buildDuetReview, DUET_REASON } from "../logic";

export default function GameOverScreen({
  view,
  names,
  actions,
}: {
  view: DuetPlayerView;
  names: readonly (string | null)[];
  actions: readonly GameOverAction[];
}) {
  const model = useMemo(
    () =>
      buildDuetReview({
        words: view.cards.map((c) => c.word),
        // At game over each view carries both sides: its own, then the partner's.
        key: view.cards.map((c) => {
          const mine = c.mine ?? "bystander";
          const theirs = c.theirs ?? "bystander";
          return view.seat === 1 ? [theirs, mine] : [mine, theirs];
        }),
        turns: view.turns,
        tokensTotal: view.tokensTotal,
        tiers: view.tiers,
        names,
      }),
    [view, names],
  );
  const result = view.result;
  if (!result) return null;
  return (
    <ReviewScreen
      title={result.won ? "Mission accomplished" : "Mission failed"}
      tone={result.won ? "win" : "lose"}
      detail={`${DUET_REASON[result.reason] ?? result.reason} · ${result.agentsFound} / 15 agents · ${result.tokensLeft} turn${result.tokensLeft === 1 ? "" : "s"} to spare`}
      actions={actions}
      model={model}
    />
  );
}
