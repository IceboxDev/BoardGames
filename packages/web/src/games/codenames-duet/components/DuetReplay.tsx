import { DuetReplayLogSchema } from "@boardgames/core/games/codenames-duet/record";
import { useMemo } from "react";
import { EmptyState } from "../../../components/ui";
import { ReviewScreen } from "../../codenames/components/review/ReviewScreen";
import type { ReplayProps } from "../../types";
import { buildDuetReview, DUET_REASON } from "../logic";

export default function DuetReplay({ game, onBack }: ReplayProps) {
  const parsed = useMemo(() => DuetReplayLogSchema.safeParse(game), [game]);
  const model = useMemo(
    () =>
      parsed.success
        ? buildDuetReview({
            words: parsed.data.words,
            key: parsed.data.key,
            turns: parsed.data.turns,
            tokensTotal: parsed.data.tokensTotal,
            tiers: parsed.data.ai,
            names: [null, null],
          })
        : null,
    [parsed],
  );
  if (!parsed.success || !model) {
    return <EmptyState title="This replay can't be shown" description="Its format is unknown." />;
  }
  const { result } = parsed.data;
  return (
    <ReviewScreen
      title={result.won ? "Mission accomplished" : "Mission failed"}
      tone="neutral"
      detail={`${DUET_REASON[result.reason] ?? result.reason} · ${result.agentsFound} / 15 agents`}
      {...(onBack ? { onBack } : {})}
      model={model}
    />
  );
}
