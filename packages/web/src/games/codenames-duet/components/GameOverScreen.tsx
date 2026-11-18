import type { DuetPlayerView } from "@boardgames/core/games/codenames-duet/types";
import { useMemo } from "react";
import type { GameOverAction } from "../../../components/game-over";
import { ReviewScreen, roomNotice } from "../../codenames/table";
import { buildDuetReview, duetDetail } from "../logic";

export default function GameOverScreen({
  view,
  names,
  actions,
  campaignLine = null,
  waitingForHost = false,
  error = null,
}: {
  view: DuetPlayerView;
  names: readonly (string | null)[];
  actions: readonly GameOverAction[];
  /** A campaign mission's outcome on the map ("Paris cleared · now open: Madrid"). */
  campaignLine?: string | null;
  /** A room guest: the host decides whether there is another game. */
  waitingForHost?: boolean;
  /** Why a rematch couldn't start (someone left the table). */
  error?: string | null;
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
        tiers: view.seats.map((s) => (s.standIn ? null : s.tier)),
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
      detail={duetDetail(result, campaignLine)}
      actions={actions}
      model={model}
      notice={roomNotice({ error, waitingForHost })}
    />
  );
}
