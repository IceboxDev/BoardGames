import type { Color } from "@boardgames/core/games/chess/engine/types";
import { ChessConfigSchema } from "@boardgames/core/games/chess/manifest";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../../components/ui";
import { playFromHereUrl } from "../../logic/play-line";

/**
 * "Play from here": a new game against the AI from the review's position on
 * screen, as `side`. Hidden where there's nothing to play (the game's final
 * mate) or the line is longer than a set-up line may be.
 */
export function PlayFromHere({
  moves,
  side,
  before,
}: {
  moves: readonly string[];
  side: Color;
  /** Close what's on screen first (the finished solo game). */
  before?: () => void;
}) {
  const navigate = useNavigate();
  if (!ChessConfigSchema.shape.openingMoves.safeParse(moves).success) return null;
  return (
    <Button
      size="xs"
      variant="secondary"
      onClick={() => {
        before?.();
        navigate(playFromHereUrl(moves, side), { replace: true });
      }}
      title="Play this position against the AI"
    >
      ▶ Play from here
    </Button>
  );
}
