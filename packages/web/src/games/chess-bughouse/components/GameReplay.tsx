import { BUGHOUSE_STRATEGIES } from "@boardgames/core/games/chess-bughouse/manifest";
import {
  type BughouseReplayLog,
  BughouseReplayLogSchema,
} from "@boardgames/core/games/chess-bughouse/schemas";
import { useMemo } from "react";
import { ReplayControls } from "../../../components/replay/ReplayControls";
import { useReplayPlayback } from "../../../components/replay/useReplayPlayback";
import { EmptyState } from "../../../components/ui";
import ChessBoard from "../../chess/components/board/ChessBoard";
import type { ReplayProps } from "../../types";
import { bughouseResultText } from "../result-text";

const BOARD = ["Board A", "Board B"] as const;

function nameOf(strategy: string | null | undefined, seat: number): string {
  const fallback = ["A-White", "A-Black", "B-White", "B-Black"][seat] ?? "Player";
  if (!strategy) return fallback;
  return BUGHOUSE_STRATEGIES.find((s) => s.id === strategy)?.label ?? strategy;
}

/** Both boards, stepped through in the order the moves were played across the table. */
export default function GameReplay({ game }: ReplayProps) {
  const parsed = useMemo(() => BughouseReplayLogSchema.safeParse(game), [game]);
  if (!parsed.success) {
    return (
      <EmptyState
        title="This replay can't be shown"
        description="Its record is from an unknown format."
      />
    );
  }
  return <Replay log={parsed.data} />;
}

function Replay({ log }: { log: BughouseReplayLog }) {
  // Position of both boards after each step (step 0 = the start).
  const steps = useMemo(() => {
    const out: { fens: [string, string]; last: [string | null, string | null]; caption: string }[] =
      [{ fens: [log.startFen, log.startFen], last: [null, null], caption: "Start" }];
    for (const m of log.moves) {
      const prev = out[out.length - 1] ?? out[0];
      if (!prev) break;
      const fens: [string, string] = [...prev.fens];
      const last: [string | null, string | null] = [...prev.last];
      fens[m.board] = m.fenAfter;
      fens[m.board === 0 ? 1 : 0] = m.otherFenAfter;
      last[m.board] = m.uci;
      out.push({
        fens,
        last,
        caption: `${BOARD[m.board]}: ${m.san} (${(m.at / 1000).toFixed(1)} s)`,
      });
    }
    return out;
  }, [log]);
  const playback = useReplayPlayback(steps.length, 600);
  const step = steps[playback.stepIndex] ?? steps[0];
  const names = log.strategies.map((s, i) => nameOf(s, i));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
      <p className="text-center text-sm text-fg-secondary">
        {bughouseResultText(log.result, names)}
      </p>
      <div className="flex flex-wrap justify-center gap-6">
        {([0, 1] as const).map((i) => (
          <figure key={BOARD[i]} className="flex w-full max-w-md flex-col gap-1">
            <figcaption className="text-xs text-fg-muted">
              {BOARD[i]} — {names[i * 2]} (White) vs {names[i * 2 + 1]} (Black)
            </figcaption>
            <div className="aspect-square w-full">
              <ChessBoard
                bughouse
                className="size-full overflow-hidden rounded-card-md"
                fen={step?.fens[i] ?? log.startFen}
                orientation={i === 0 ? "w" : "b"}
                moves={[]}
                lastMove={step?.last[i] ?? null}
                aria-label={`${BOARD[i]}`}
              />
            </div>
          </figure>
        ))}
      </div>
      <ReplayControls
        playback={playback}
        description={step?.caption}
        className="mx-auto w-full max-w-2xl"
      />
    </div>
  );
}
