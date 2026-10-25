import type { Color } from "@boardgames/core/games/chess/engine/types";
import { CHESS_STRATEGIES } from "@boardgames/core/games/chess/manifest";
import { type ChessReplayLog, ChessReplayLogSchema } from "@boardgames/core/games/chess/schemas";
import type { MatchSummary } from "@boardgames/core/protocol";
import { useMemo, useState } from "react";
import { EmptyState } from "../../../components/ui";
import type { ReplayProps } from "../../types";
import { ReviewBoard } from "./review/ReviewBoard";

const SIDES: readonly Color[] = ["w", "b"];

/** Each side's name: the person's, or the AI's label; the colour when neither is known. */
function namesOf(log: ChessReplayLog, match: MatchSummary | undefined): Record<Color, string> {
  const name = (seat: number, fallback: string) => {
    const s = match?.seats.find((x) => x.seat === seat);
    if (s?.kind === "human" && s.name) return s.isViewer ? `${s.name} (you)` : s.name;
    const strategy = log.strategies[seat];
    if (strategy) return CHESS_STRATEGIES.find((x) => x.id === strategy)?.label ?? strategy;
    return fallback;
  };
  return { w: name(0, "White"), b: name(1, "Black") };
}

/**
 * A finished game from Match History, on the review board the game ended on:
 * from the viewer's side (seat 0 plays White), with their names, analysed by
 * Stockfish in the browser — at once from the cache when the game was
 * reviewed here before.
 */
export default function GameReplay({ game, match, onBack }: ReplayProps) {
  const parsed = useMemo(() => ChessReplayLogSchema.safeParse(game), [game]);
  if (!parsed.success) {
    return (
      <EmptyState
        title="This replay can't be shown"
        description="Its record is from an unknown format."
      />
    );
  }
  return <Replay log={parsed.data} match={match} onBack={onBack} />;
}

function Replay({
  log,
  match,
  onBack,
}: {
  log: ChessReplayLog;
  match: MatchSummary | undefined;
  onBack?: () => void;
}) {
  const viewer: Color | null = match?.viewerSeat === 0 ? "w" : match?.viewerSeat === 1 ? "b" : null;
  const [orientation, setOrientation] = useState<Color>(viewer ?? "w");
  return (
    <ReviewBoard
      startFen={log.startFen}
      moves={log.moves}
      result={log.result}
      timeControl={log.timeControl}
      names={namesOf(log, match)}
      aiColors={SIDES.filter((_, seat) => log.strategies[seat] != null)}
      viewer={viewer}
      date={match ? new Date(match.createdAt) : new Date()}
      endActions={
        onBack ? [{ label: "Back to history", variant: "secondary", onClick: onBack }] : []
      }
      orientation={orientation}
      onOrientationChange={setOrientation}
    />
  );
}
