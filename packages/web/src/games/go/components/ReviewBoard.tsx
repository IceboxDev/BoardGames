import { fromGtp, toGtp } from "@boardgames/core/games/go/coords";
import { newGame, play } from "@boardgames/core/games/go/game";
import type { Color, GoGame } from "@boardgames/core/games/go/types";
import type { GoReview } from "@boardgames/core/protocol";
import { useMemo } from "react";
import { ReplayControls, useReplayPlayback } from "../../../components/replay";
import { Surface } from "../../../components/ui";
import ReviewPanel from "./analysis/ReviewPanel";
import GoBoard, { type BoardMark } from "./board/GoBoard";

export interface ReviewGame {
  readonly size: number;
  readonly komi: number;
  readonly handicap: number;
  readonly moves: readonly { readonly color: Color; readonly point: number | null }[];
  /** Stones marked dead at the end, shown on the final position. */
  readonly dead?: readonly number[];
}

/** Every position, start first (handicap stones only). Records may skip a pass; insert it. */
function positions(g: ReviewGame): GoGame[] {
  let game = newGame({ size: g.size, komi: g.komi, handicap: g.handicap });
  const out = [game];
  for (const m of g.moves) {
    if (m.color !== game.toMove) game = play(game, null);
    game = play(game, m.point);
    out.push(game);
  }
  return out;
}

interface Props {
  readonly game: ReviewGame;
  readonly review?: GoReview;
  readonly reviewLoading?: boolean;
}

/** A finished game stepped move by move, with KataGo's review beside it when there is one. */
export default function ReviewBoard({ game, review, reviewLoading = false }: Props) {
  const steps = useMemo(() => positions(game), [game]);
  const playback = useReplayPlayback(steps.length, 700);
  const at = steps[playback.stepIndex] ?? steps[0];
  const movesPlayed = at?.moves.length ?? 0;
  const movers = useMemo(() => steps.at(-1)?.moves.map((m) => m.color) ?? [], [steps]);
  if (!at) return null;
  const last = at.moves.at(-1);
  const best = review?.analysis?.moves[movesPlayed]?.best;
  const bestPoint = best ? fromGtp(game.size, best) : undefined;
  const marks: BoardMark[] =
    bestPoint !== undefined && bestPoint !== null ? [{ point: bestPoint, tone: "best" }] : [];

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex flex-col gap-3">
        <Surface variant="raised" padding="sm" className="mx-auto w-full max-w-xl">
          <GoBoard
            size={game.size}
            board={at.board}
            lastMove={last?.point ?? null}
            dead={playback.isLast && game.dead ? new Set(game.dead) : undefined}
            marks={marks}
            className="aspect-square w-full"
          />
        </Surface>
        <ReplayControls
          playback={playback}
          description={
            movesPlayed === 0
              ? "Start"
              : `Move ${movesPlayed}: ${last?.color === 0 ? "Black" : "White"} ${toGtp(game.size, last?.point ?? null)}`
          }
        />
      </div>
      <ReviewPanel
        review={review}
        loading={reviewLoading}
        at={movesPlayed}
        movers={movers}
        onSelect={(moves) => playback.goTo(Math.min(steps.length - 1, Math.max(0, moves)))}
      />
    </div>
  );
}
