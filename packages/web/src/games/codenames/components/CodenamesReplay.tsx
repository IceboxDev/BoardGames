import { CodenamesReplayLogSchema } from "@boardgames/core/games/codenames/record";
import { useMemo } from "react";
import { EmptyState } from "../../../components/ui";
import type { ReplayProps } from "../../types";
import { teamName } from "../logic/labels";
import { buildClassicReview } from "../logic/review";
import { ReviewScreen } from "./review/ReviewScreen";

// A saved game, on the same debrief as the game-over screen.

export default function CodenamesReplay({ game, onBack }: ReplayProps) {
  const parsed = useMemo(() => CodenamesReplayLogSchema.safeParse(game), [game]);
  const model = useMemo(
    () =>
      parsed.success
        ? buildClassicReview({
            words: parsed.data.words,
            key: parsed.data.key,
            startingTeam: parsed.data.startingTeam,
            turns: parsed.data.turns,
            ai: parsed.data.ai,
            names: Array.from({ length: parsed.data.seatCount }, () => null),
          })
        : null,
    [parsed],
  );
  if (!parsed.success || !model) {
    return <EmptyState title="This replay can't be shown" description="Its format is unknown." />;
  }
  const { result, turns } = parsed.data;
  const how =
    result.reason === "assassin"
      ? `${teamName((1 - result.winner) as 0 | 1)} touched the assassin`
      : "every agent found";
  return (
    <ReviewScreen
      title={`${teamName(result.winner)} wins`}
      tone="neutral"
      detail={`${how} · ${turns.length} turns`}
      {...(onBack ? { onBack } : {})}
      model={model}
    />
  );
}
