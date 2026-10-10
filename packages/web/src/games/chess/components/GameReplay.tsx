import { applyMove } from "@boardgames/core/games/chess/engine/apply";
import { parseFen, toFen } from "@boardgames/core/games/chess/engine/fen";
import { legalMoves } from "@boardgames/core/games/chess/engine/movegen";
import { toSan } from "@boardgames/core/games/chess/engine/san";
import { moveToUci } from "@boardgames/core/games/chess/engine/uci";
import { replayGame } from "@boardgames/core/games/chess/game";
import { CHESS_STRATEGIES } from "@boardgames/core/games/chess/manifest";
import {
  type ChessPlayerView,
  type ChessReplayLog,
  ChessReplayLogSchema,
} from "@boardgames/core/games/chess/schemas";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ReplayControls } from "../../../components/replay/ReplayControls";
import { useReplayPlayback } from "../../../components/replay/useReplayPlayback";
import { Button, EmptyState, ProgressBar, StatTile } from "../../../components/ui";
import type { ReplayProps } from "../../types";
import { EvalBar, EvalGraph } from "../analysis/EvalBar";
import { formatScore, type PositionEval, reviewGame } from "../analysis/grade";
import { useAnalysis } from "../analysis/useAnalysis";
import { resultText } from "../logic/result-text";
import type { BoardArrow } from "./board/ChessBoard";
import GameBoard from "./GameBoard";
import { PgnButtons } from "./PgnButtons";

function nameOf(strategy: string | null | undefined, fallback: string): string {
  if (!strategy) return fallback;
  return CHESS_STRATEGIES.find((s) => s.id === strategy)?.label ?? strategy;
}

/** A replay log as the board's view: the final position with the whole history. */
function toView(log: ChessReplayLog, finalFen: string): ChessPlayerView {
  return {
    fen: finalFen,
    startFen: log.startFen,
    color: null,
    seatColors: ["w", "b"],
    aiSeats: log.strategies.flatMap((s, i) => (s ? [i] : [])),
    history: log.moves,
    clock: null,
    drawOffer: null,
    takebackRequest: null,
    claimableDraw: null,
    disconnected: [],
    abandoned: [],
    aiThinking: false,
    result: log.result,
    timeControl: log.timeControl,
  };
}

/** A PV as SAN text, played out from `fen`. */
function pvSan(fen: string, pv: readonly string[], max = 6): string {
  try {
    let pos = parseFen(fen);
    const out: string[] = [];
    for (const uci of pv.slice(0, max)) {
      const legal = legalMoves(pos);
      const move = legal.find((m) => moveToUci(m) === uci);
      if (!move) break;
      out.push(toSan(pos, move, legal));
      pos = applyMove(pos, move);
    }
    return out.join(" ");
  } catch {
    return "";
  }
}

/**
 * A finished game, move by move, with Stockfish analysis on request: an eval
 * bar and graph, the best move as an arrow, every move graded (?! ? ??), each
 * side's accuracy, and the engine's top three lines for the shown position.
 */
export default function GameReplay({ game }: ReplayProps) {
  const parsed = useMemo(() => ChessReplayLogSchema.safeParse(game), [game]);
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

function Replay({ log }: { log: ChessReplayLog }) {
  const ucis = useMemo(() => log.moves.map((m) => m.uci), [log.moves]);
  const analysis = useAnalysis(log.startFen, ucis);
  // The board's "live" position is the game's last one; browsing goes back from it.
  const view = useMemo(() => {
    let finalFen = log.startFen;
    try {
      finalFen = toFen(replayGame(log.startFen, log.moves).position);
    } catch {
      // A log that doesn't replay shows its start position.
    }
    return toView(log, finalFen);
  }, [log]);
  return <ReplayBoard log={log} view={view} analysis={analysis} />;
}

function ReplayBoard({
  log,
  view: baseView,
  analysis,
}: {
  log: ChessReplayLog;
  view: ChessPlayerView;
  analysis: ReturnType<typeof useAnalysis>;
}) {
  const n = log.moves.length;
  const playback = useReplayPlayback(n + 1, 900);
  const viewing = playback.stepIndex >= n ? null : playback.stepIndex;
  const [shown, setShown] = useState<{ ply: number; fen: string }>({ ply: n, fen: "" });
  const [lines, setLines] = useState<PositionEval[]>([]);

  const names = { w: nameOf(log.strategies[0], "White"), b: nameOf(log.strategies[1], "Black") };
  const review = useMemo(() => reviewGame(log.moves, analysis.evals), [log.moves, analysis.evals]);
  const analysed = analysis.evals.length > 0;

  // The engine's top lines for the position on screen, once the game is analysed.
  const { explore } = analysis;
  useEffect(() => {
    if (!analysed || analysis.running || !shown.fen) return;
    let live = true;
    explore(shown.fen)
      .then((l) => live && setLines(l))
      .catch(() => live && setLines([]));
    return () => {
      live = false;
    };
  }, [analysed, analysis.running, explore, shown.fen]);

  const shownEval = analysis.evals[shown.ply];
  const arrows: BoardArrow[] = lines.slice(0, 3).flatMap((line, i) => {
    const best = line.pv[0];
    if (!best || best.includes("@")) return [];
    return [
      {
        from: best.slice(0, 2),
        to: best.slice(2, 4),
        tone: i === 0 ? ("best" as const) : ("alt" as const),
      },
    ];
  });

  const onShownChange = useCallback((s: { ply: number; fen: string }) => {
    setShown((prev) => (prev.ply === s.ply && prev.fen === s.fen ? prev : s));
  }, []);

  const summary = (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-secondary">{resultText(log.result)}</p>
      {!analysed && !analysis.running && (
        <Button
          size="sm"
          variant="primary"
          onClick={analysis.start}
          title="Run Stockfish over every move"
        >
          Analyse with Stockfish
        </Button>
      )}
      {analysis.running && (
        <ProgressBar value={analysis.progress * 100} label="Analysis progress" size="sm" />
      )}
      {analysis.error && <p className="text-xs text-rose-300">{analysis.error}</p>}
      {analysed && (
        <>
          <EvalGraph
            scores={analysis.evals.map((e) => e?.score)}
            current={shown.ply}
            onSelect={(ply) => playback.goTo(ply)}
          />
          <div className="grid grid-cols-2 gap-2">
            {(["w", "b"] as const).map((c) => (
              <StatTile
                key={c}
                size="sm"
                label={`${names[c]} accuracy`}
                value={review.accuracy[c] === null ? "–" : `${review.accuracy[c]}%`}
                sub={`${review.counts[c].inaccuracy} ?! · ${review.counts[c].mistake} ? · ${review.counts[c].blunder} ??`}
              />
            ))}
          </div>
          {lines.length > 0 && (
            <ol className="flex flex-col gap-1 text-xs" aria-label="Engine lines">
              {lines.map((line, i) => (
                <li key={line.pv.join(" ") || i} className="flex gap-2">
                  <span className="w-10 shrink-0 font-mono font-semibold text-fg-strong">
                    {formatScore(line.score)}
                  </span>
                  <span className="truncate text-fg-secondary">{pvSan(shown.fen, line.pv)}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );

  return (
    <GameBoard
      view={baseView}
      color={null}
      names={names}
      legal={[]}
      send={() => {}}
      viewing={viewing}
      onViewingChange={(ply) => playback.goTo(ply ?? n)}
      onShownChange={onShownChange}
      grades={analysed ? review.grades : undefined}
      arrows={analysed ? arrows : undefined}
      besideBoard={
        analysed
          ? (size) => <EvalBar score={shownEval?.score ?? null} orientation="w" height={size} />
          : undefined
      }
      sidebarExtra={summary}
      actionExtra={
        <div className="flex flex-wrap items-center gap-2">
          <ReplayControls playback={playback} />
          <PgnButtons
            input={{
              startFen: log.startFen,
              moves: log.moves,
              result: log.result,
              timeControl: log.timeControl,
              white: names.w,
              black: names.b,
            }}
          />
        </div>
      }
    />
  );
}
