import { columnHeight } from "@boardgames/core/games/connect-4/rules";
import {
  type PositionInput,
  searchReach,
  solverInReach,
} from "@boardgames/core/games/connect-4/solver/analysis";
import type { GameRecord, Seat } from "@boardgames/core/games/connect-4/types";
import { type ReactNode, useMemo, useState } from "react";
import { useStepHotkeys } from "../../../../components/replay";
import { MicroLabel, SegmentedControl } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import {
  bestOf,
  keepsResult,
  keyMoments,
  moveStory,
  nearBestOf,
  type Outcome,
  outcomeFromColumns,
  outcomeOf,
  playerSummary,
  timeline,
} from "../../logic/analysis-model";
import { solverClient } from "../../logic/solver-client";
import { chipText, chipTitle, colourName, unsolvedText } from "../../logic/text";
import { type BoardGame, derive, useAnalysisBoard } from "../../logic/useAnalysisBoard";
import { useColumnVerdicts, useGameAnalysis } from "../../logic/useSolver";
import Connect4Board, { type ColumnMark } from "../board/Connect4Board";
import { AnalysisNav } from "./AnalysisNav";
import { GRADES, ONLY_MOVE } from "./grades";
import { KeyMoments } from "./KeyMoments";
import { MoveCard, PracticeCard, SideLineCard, StartCard } from "./MoveCard";
import { MoveList } from "./MoveList";
import { OutcomeGraph } from "./OutcomeGraph";
import { PlayerSummary } from "./PlayerSummary";

interface Props {
  game: GameRecord;
  cols: number;
  rows: number;
  popOut: boolean;
  names: readonly string[];
  /** Seats whose mistakes can be practised: the viewer's (both, in a replay). */
  practiceSeats: readonly Seat[];
}

const SEATS = [0, 1] as const satisfies readonly Seat[];

type PanelTab = "overview" | "moves";

/** The game's position at `ply`, as the solver's question (null at a finished end). */
const positionAt = (game: BoardGame, ply: number): PositionInput | null =>
  derive(game, { ply, line: [], practice: null }).position;

/**
 * A finished game, analysed: the board at any move with every column's
 * outcome over it, what the selected move did and what was best, who was
 * winning across the game, the moments the result changed hands, each
 * player's record — plus what-if side lines and practising your mistakes.
 * Key it by game: a new game starts it over.
 */
export function AnalysisBoard({ game, cols, rows, popOut, names, practiceSeats }: Props) {
  const solvable = !popOut && game.moves.every((m) => m.type === "drop");
  const graded = useMemo(
    () => (solvable ? { cols, rows, moves: game.moves } : null),
    [solvable, cols, rows, game.moves],
  );
  const analysis = useGameAnalysis(graded);
  const boardGame = useMemo<BoardGame>(
    () => ({
      cols,
      rows,
      firstPlayer: game.firstPlayer,
      moves: game.moves,
      endedInFour: game.reason === "connect",
    }),
    [cols, rows, game.firstPlayer, game.moves, game.reason],
  );
  const { state, dispatch, shown } = useAnalysisBoard(boardGame);
  const [playing, setPlaying] = useState(false);
  const [panelTab, setPanelTab] = useState<PanelTab>("overview");
  const n = game.moves.length;
  const { ply, practice } = state;
  const inLine = state.line.length > 0;

  const points = useMemo(
    () =>
      timeline(
        { cols, rows, moves: game.moves, winner: game.winner, reason: game.reason },
        analysis.grades,
      ),
    [cols, rows, game.moves, game.winner, game.reason, analysis.grades],
  );
  const moments = useMemo(() => keyMoments(analysis.grades), [analysis.grades]);
  const summaries = useMemo(
    () => SEATS.map((seat) => playerSummary(game.moves, analysis.grades, seat)),
    [game.moves, analysis.grades],
  );

  // Every column's outcome over the board: for the position on show — or,
  // practising, the task's position: only the columns already tried until
  // it's answered (the rest would give the answer away).
  const chipsInput = solvable ? (practice ? shown.base : shown.position) : null;
  const columnsState = useColumnVerdicts(chipsInput);
  const columns = Array.from({ length: cols }, (_, c) => columnsState.columns[c]);
  const mover = chipsInput?.toMove ?? shown.toMove;
  const best = bestOf(columns, mover);
  // Emphasised over the board: every column as good as the best (a disc off counts).
  const strong = nearBestOf(columns, mover);
  const answered = !practice || practice.solved !== null || practice.revealed;
  const chipShown = (column: number) =>
    chipsInput !== null && (answered || (practice?.tried.includes(column) ?? false));

  // The position before the selected move (for "the only move") and after it, asked behind the rest.
  const browsing = solvable && !inLine && !practice;
  const beforeInput = useMemo(
    () => (browsing && ply > 0 ? positionAt(boardGame, ply - 1) : null),
    [browsing, ply, boardGame],
  );
  const nextInput = useMemo(
    () => (browsing && ply < n ? positionAt(boardGame, ply + 1) : null),
    [browsing, ply, n, boardGame],
  );
  const beforeColumns = useColumnVerdicts(beforeInput, "prefetch");
  useColumnVerdicts(nextInput, "prefetch");

  const selected = !inLine && !practice && ply > 0 ? ply - 1 : null;
  const selectedGrade = selected === null ? undefined : analysis.grades[selected];
  const story = selectedGrade
    ? moveStory(
        selectedGrade,
        beforeColumns.done
          ? Array.from({ length: cols }, (_, c) => beforeColumns.columns[c])
          : undefined,
      )
    : null;
  const practiceIndex =
    practice && practice.at < practice.queue.length ? practice.queue[practice.at] : null;
  const practiceGrade = practiceIndex === null ? undefined : analysis.grades[practiceIndex];
  const practiceStory = practiceGrade ? moveStory(practiceGrade) : null;

  const go = (to: number) => dispatch({ type: "go", ply: to });
  const step = (by: 1 | -1) => dispatch({ type: "step", by });
  const stopPractice = () => dispatch({ type: "stop-practice" });
  const leaveLine = () => dispatch({ type: "leave-line" });
  useStepHotkeys({
    step,
    first: () => go(0),
    last: () => go(n),
    escape: practice ? stopPractice : inLine ? leaveLine : undefined,
  });

  const startPractice = (queue: number[]) => {
    setPlaying(false);
    solverClient.prefetchColumns(
      queue.flatMap((i) => {
        const input = positionAt(boardGame, i);
        return input ? [input] : [];
      }),
    );
    dispatch({ type: "practice", queue });
  };

  // ── The board ──
  // Practising, the task's position (a find is drawn in as a one-move line over it).
  const task = practice ? derive(boardGame, { ...state, line: [] }) : null;
  const droppable = task
    ? practice?.solved
      ? []
      : task.open.filter((c) => columns[c] !== undefined && !practice?.tried.includes(c))
    : solvable
      ? shown.open
      : [];
  const drop = (column: number) => {
    if (!practice) {
      dispatch({ type: "play", column });
      return;
    }
    if (!practiceStory) return;
    const result = keepsResult(columns[column], practiceStory.before, practiceStory.player);
    if (result !== "unknown") dispatch({ type: "answer", column, result });
  };

  const marks: ColumnMark[] = columns.flatMap((verdict, column) => {
    if (verdict === null || !chipShown(column)) return [];
    if (verdict === undefined) {
      return [{ column, label: "", tone: "unknown" as const, best: false, title: "Solving…" }];
    }
    const outcome = outcomeOf(verdict, mover);
    const tone: ColumnMark["tone"] =
      outcome.kind === "win" ? outcome.winner : outcome.kind === "draw" ? "draw" : "unknown";
    return [
      {
        column,
        label: chipText(outcome),
        tone,
        best: answered && strong.includes(column),
        title: chipTitle(outcome, names),
      },
    ];
  });

  const shownStory = practice ? (practice.revealed ? practiceStory : null) : story;
  const flawed =
    shownStory &&
    (shownStory.grade === "inaccuracy" ||
      shownStory.grade === "mistake" ||
      shownStory.grade === "blunder");
  // The best move(s) the selected move passed over, as ghosts where they'd have landed.
  const ghostBoard = task
    ? task.board
    : derive(boardGame, { ply: Math.max(0, ply - 1), line: [], practice: null }).board;
  const ghosts =
    flawed && shownStory
      ? shownStory.best.map((column) => ({
          column,
          row: columnHeight(ghostBoard, column),
          player: shownStory.player,
        }))
      : [];
  const lastMoveMark =
    story && story.change !== "unknown"
      ? story.onlyMove
        ? { color: ONLY_MOVE.fill, badge: ONLY_MOVE.mark }
        : { color: GRADES[story.grade].fill, badge: GRADES[story.grade].mark }
      : null;
  const nextMove = !inLine && !practice ? game.moves[ply] : undefined;
  const winningCells =
    shown.lineEnd?.kind === "four"
      ? shown.lineEnd.cells
      : !inLine && ply === n
        ? game.winningCells
        : [];

  // ── The card under it ──
  const lineOutcome: Outcome =
    shown.lineEnd?.kind === "four"
      ? { kind: "over", winner: shown.moves[shown.moves.length - 1]?.player ?? null }
      : shown.lineEnd?.kind === "full"
        ? { kind: "over", winner: null }
        : outcomeFromColumns(columns, mover);
  const answerColumn = practice?.last ?? undefined;
  const answerVerdict = answerColumn === undefined ? undefined : columns[answerColumn];
  const unsolvedNote = popOut
    ? unsolvedText("popout", { cols, rows }, 0)
    : unsolvedText(
        selected !== null && !solverInReach(cols, rows, selected) ? "too-early" : "budget",
        { cols, rows },
        searchReach(cols, rows),
      );

  let card: ReactNode;
  if (practice) {
    card = (
      <PracticeCard
        practice={practice}
        story={practiceStory}
        answer={
          answerColumn !== undefined && answerVerdict
            ? { column: answerColumn, outcome: outcomeOf(answerVerdict, mover) }
            : null
        }
        best={best}
        solving={!columnsState.done}
        names={names}
        onNext={() => dispatch({ type: "next" })}
        onStop={stopPractice}
      />
    );
  } else if (inLine) {
    card = (
      <SideLineCard
        from={ply}
        line={shown.moves.slice(ply)}
        outcome={lineOutcome}
        end={shown.lineEnd?.kind ?? null}
        names={names}
        onUndo={() => dispatch({ type: "undo" })}
        onBack={leaveLine}
      />
    );
  } else if (selected === null) {
    card = <StartCard outcome={points[0]?.outcome ?? { kind: "unknown" }} names={names} />;
  } else {
    card = (
      <MoveCard
        move={game.moves[selected]}
        index={selected}
        story={solvable ? story : null}
        names={names}
        unsolvedNote={unsolvedNote}
      />
    );
  }

  const describe = (p: number) => {
    const chip = chipText(points[p]?.outcome ?? { kind: "unknown" });
    if (p === 0) return `Start · ${chip}`;
    const move = game.moves[p - 1];
    return `Move ${p} · ${colourName(move.player)} column ${move.column + 1} · now ${chip}`;
  };
  const gradedCount = Object.keys(analysis.grades).length;
  const ticks = Object.values(analysis.grades).flatMap((g) =>
    g.grade === "inaccuracy" || g.grade === "mistake" || g.grade === "blunder"
      ? [{ ply: g.index + 1, fill: GRADES[g.grade].fill }]
      : [],
  );
  // Phones show the panel as two tabs; wide screens show it all at once.
  const narrowOnly = (tab: PanelTab) => panelTab !== tab && "hidden lg:flex";

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1.25fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)] lg:grid-rows-1">
      {/* The board, its transport and what the position means. */}
      <div className="flex min-h-0 min-w-0 flex-col gap-3 px-4 pt-2 pb-3 lg:px-10 lg:pt-4 lg:pb-6">
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <Connect4Board
            className="h-full w-full max-w-3xl"
            motionMode="analysis"
            previewLanding
            cols={cols}
            rows={rows}
            popOut={popOut}
            gameIndex={0}
            moves={shown.moves}
            winningCells={winningCells}
            toMove={shown.toMove}
            droppable={droppable}
            poppable={[]}
            onDrop={drop}
            columnMarks={marks}
            lastMoveMark={lastMoveMark}
            ghosts={ghosts}
            nextColumn={nextMove?.type === "drop" ? nextMove.column : null}
          />
        </div>
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          <AnalysisNav
            ply={ply}
            total={n}
            lineLength={state.line.length}
            playing={playing}
            onPlayingChange={setPlaying}
            onGo={go}
            onStep={step}
            ticks={ticks}
            disabled={practice !== null}
          />
          {card}
          {solvable && !practice && (
            <p className="text-2xs text-fg-disabled">
              Over the columns: <span className="font-mono">#7</span> — that colour wins with their
              7th disc from here · <span className="font-mono">=</span> a draw · drop a disc to
              explore
            </p>
          )}
        </div>
      </div>

      {/* The instrument panel: the game at a glance, then every move. */}
      <aside className="flex min-h-0 min-w-0 flex-col border-t border-line-soft bg-surface-900/40 backdrop-blur-xl lg:border-t-0 lg:border-l">
        <div className="px-4 pt-3 lg:hidden">
          <SegmentedControl
            options={[
              { value: "overview", label: "Overview" },
              { value: "moves", label: "Moves" },
            ]}
            value={panelTab}
            onChange={setPanelTab}
            size="sm"
          />
        </div>
        <div
          className={cn(
            "flex min-h-0 flex-col gap-5 overflow-y-auto px-5 py-4 lg:flex-none lg:overflow-visible",
            narrowOnly("overview"),
          )}
        >
          {solvable ? (
            <>
              <div className="flex flex-col gap-2">
                {!analysis.done && (
                  <div className="flex items-center gap-2 font-mono text-2xs text-fg-muted">
                    <span className="h-px flex-1 overflow-hidden bg-line">
                      <span
                        className="block h-full bg-accent-400 transition-[width] duration-300"
                        style={{ width: `${(gradedCount / Math.max(1, n)) * 100}%` }}
                      />
                    </span>
                    <span className="tabular-nums">
                      grading {gradedCount}/{n}
                    </span>
                  </div>
                )}
                <OutcomeGraph
                  points={points}
                  grades={analysis.grades}
                  ply={ply}
                  onSelect={go}
                  describe={describe}
                />
              </div>
              <div className="grid grid-cols-2 gap-6">
                {summaries.map((summary) => (
                  <PlayerSummary
                    key={summary.seat}
                    summary={summary}
                    names={names}
                    ply={ply}
                    onSelect={go}
                    onPractice={
                      practiceSeats.includes(summary.seat) && analysis.done && !practice
                        ? startPractice
                        : undefined
                    }
                    grading={!analysis.done}
                  />
                ))}
              </div>
              <div className="max-h-40 overflow-y-auto">
                <KeyMoments
                  moments={moments}
                  start={points[0]?.outcome ?? { kind: "unknown" }}
                  names={names}
                  ply={ply}
                  onSelect={go}
                  done={analysis.done}
                />
              </div>
              {analysis.error && (
                <p className="text-xs text-fg-muted">The solver couldn't finish this analysis.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-fg-muted">
              {unsolvedText("popout", { cols, rows }, 0)}, so its moves aren't graded. You can still
              step through every one.
            </p>
          )}
        </div>
        <section
          aria-label="Moves"
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-2 px-5 pt-4 pb-4 lg:border-t lg:border-line-soft",
            narrowOnly("moves"),
          )}
        >
          <MicroLabel className="hidden lg:block">Moves</MicroLabel>
          <div className="-mx-1.5 min-h-0 flex-1 overflow-y-auto px-1.5">
            <MoveList
              moves={game.moves}
              points={points}
              grades={analysis.grades}
              names={names}
              ply={inLine || practice ? -1 : ply}
              onSelect={go}
            />
          </div>
        </section>
      </aside>
    </div>
  );
}
