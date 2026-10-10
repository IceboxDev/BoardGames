import { GoReplayLogSchema } from "@boardgames/core/games/go/replay-log";
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { Button, EmptyState } from "../../../components/ui";
import type { ReplayProps } from "../../types";
import { useReplayReview } from "../api";
import { downloadSgf } from "../logic/sgf-download";
import ReviewBoard, { type ReviewGame } from "./ReviewBoard";

/** A finished online match, with its KataGo review (queued automatically when the game ended). */
export default function GameReplay({ game, onBack }: ReplayProps) {
  const parsed = useMemo(() => GoReplayLogSchema.safeParse(game), [game]);
  const params = useParams<{ replayId: string }>();
  const replayId = Number.parseInt(params.replayId ?? "", 10);
  const review = useReplayReview(parsed.success && replayId > 0 ? replayId : null);
  const reviewGame = useMemo<ReviewGame | null>(
    () =>
      parsed.success
        ? {
            size: parsed.data.size,
            komi: parsed.data.komi,
            handicap: parsed.data.handicap,
            moves: parsed.data.moves.map((m) => ({ color: m.c, point: m.p })),
            dead: parsed.data.end.dead,
          }
        : null,
    [parsed],
  );
  if (!parsed.success || !reviewGame) {
    return (
      <EmptyState
        title="This replay can't be read"
        description="It was saved in an older format."
      />
    );
  }
  const log = parsed.data;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-2">
      <div className="flex items-center justify-between gap-2">
        {onBack ? (
          <Button size="sm" variant="ghost" onClick={onBack}>
            ← Back
          </Button>
        ) : (
          <span />
        )}
        <span className="text-sm text-fg-secondary">
          {log.size}×{log.size} · komi {log.komi}
          {log.handicap > 0 && ` · ${log.handicap} stones`} · {log.end.result}
        </span>
        <Button size="sm" variant="secondary" onClick={() => downloadSgf(log, ["Black", "White"])}>
          Download SGF
        </Button>
      </div>
      <ReviewBoard game={reviewGame} review={review.data} reviewLoading={review.isLoading} />
    </div>
  );
}
