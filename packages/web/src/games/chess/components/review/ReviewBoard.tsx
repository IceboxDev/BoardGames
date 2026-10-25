import { toFen } from "@boardgames/core/games/chess/engine/fen";
import type { Color } from "@boardgames/core/games/chess/engine/types";
import { replayGame } from "@boardgames/core/games/chess/game";
import type {
  ChessResult,
  ClockView,
  HistoryEntry,
  TimeControl,
} from "@boardgames/core/games/chess/schemas";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameScreen } from "../../../../components/game-layout";
import type { GameOverAction } from "../../../../components/game-over";
import { useStepHotkeys } from "../../../../components/replay/useStepHotkeys";
import { useMediaQuery, WIDE_BOARD_QUERY } from "../../../../hooks/useMediaQuery";
import { EvalBar, type GraphTick } from "../../analysis/EvalBar";
import { type PositionEval, reviewGame, type Score } from "../../analysis/grade";
import { legalAt, lineText, playLine, terminalScore } from "../../analysis/line";
import { judge, keyMoments, practiceQueue, storyOf } from "../../analysis/review-model";
import { useAnalysis } from "../../analysis/useAnalysis";
import { useReview } from "../../analysis/useReview";
import { material } from "../../logic/moves";
import { resultBadges, resultText } from "../../logic/result-text";
import { playSound, readMuted, soundForSan } from "../../logic/sound";
import { BoardStage } from "../BoardStage";
import ChessBoard, { type BoardArrow } from "../board/ChessBoard";
import { PlayerStrip } from "../PlayerStrip";
import { PracticeCard, type PracticeView, SideLineCard, StartCard, StoryCard } from "./MoveCard";
import { RepertoireCard } from "./RepertoireCard";
import { ReviewActions } from "./ReviewActions";
import { type HeadlineTone, type PracticeItem, ReviewRail } from "./ReviewRail";

/** A miss stays on the board this long before it's taken back. */
const MISS_SHOWN_MS = 700;
/** Stepping quickly asks the engine about the position you stop on, not each one passed. */
const EXPLORE_DEBOUNCE_MS = 220;

const GRADE_TICK: Record<string, string> = {
  inaccuracy: "rgb(252 211 77)",
  mistake: "rgb(251 146 60)",
  blunder: "rgb(251 113 133)",
};

export interface ReviewBoardProps {
  readonly startFen: string;
  readonly moves: readonly HistoryEntry[];
  readonly result: ChessResult;
  readonly timeControl: TimeControl | null;
  readonly names: Readonly<Record<Color, string>>;
  readonly aiColors: readonly Color[];
  /** The viewer's colour; `null` when watching someone else's game. */
  readonly viewer: Color | null;
  /** When it was played (shown under the result). */
  readonly date: Date;
  readonly endActions: readonly GameOverAction[];
  readonly orientation: Color;
  readonly onOrientationChange: (orientation: Color) => void;
  /** The game just ended here: play its last move's sound and the ending. */
  readonly announce?: boolean;
  /** More buttons for the action bar ("Play from here"), for the game position on screen. */
  readonly extraActions?: (ply: number, fen: string) => ReactNode;
}

/** Each side's clock after `ply` moves, from the clocks the moves recorded. */
function clockAfter(
  moves: readonly HistoryEntry[],
  ply: number,
  timeControl: TimeControl | null,
): ClockView | null {
  if (!timeControl) return null;
  const left = { w: timeControl.initialMs, b: timeControl.initialMs };
  for (const m of moves.slice(0, ply)) if (m.clockMs !== null) left[m.by] = m.clockMs;
  return { remainingMs: left, running: null, incrementMs: timeControl.incrementMs, serverNow: 0 };
}

function headlineFor(
  result: ChessResult,
  viewer: Color | null,
): { text: string; tone: HeadlineTone } {
  if (result.winner === null) return { text: "Draw", tone: "draw" };
  if (viewer === null)
    return { text: `${result.winner === "w" ? "White" : "Black"} won`, tone: "neutral" };
  return result.winner === viewer
    ? { text: "You won", tone: "win" }
    : { text: "You lost", tone: "lose" };
}

const controlLabel = (tc: TimeControl | null) =>
  tc ? `${tc.initialMs / 60_000}+${tc.incrementMs / 1000}` : "Untimed";

/**
 * A finished game, on the board it was played on: the live game turns into
 * this the moment it ends (same `BoardStage`, so nothing moves), and Match
 * History opens it too. Stockfish runs through every move at once; the rail
 * shows the graph, accuracy, key moments and the graded score sheet; any
 * move on the board starts a what-if line; "Learn from mistakes" deals your
 * mistakes again to find a better move.
 */
export function ReviewBoard({
  startFen,
  moves,
  result,
  timeControl,
  names,
  aiColors,
  viewer,
  date,
  endActions,
  orientation,
  onOrientationChange,
  announce = false,
  extraActions,
}: ReviewBoardProps) {
  const total = moves.length;
  const wide = useMediaQuery(WIDE_BOARD_QUERY);
  const ucis = useMemo(() => moves.map((m) => m.uci), [moves]);
  const analysis = useAnalysis(startFen, ucis);
  const [state, dispatch] = useReview(total);
  const { ply, line, practice } = state;

  // The engine works through the game at once; it's cached for the replay.
  const started = useRef(false);
  const { start } = analysis;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start();
  }, [start]);

  // The game's last sounds, when it has just ended here (once, on arrival).
  const announced = useRef(!announce);
  useEffect(() => {
    if (announced.current) return;
    announced.current = true;
    if (readMuted()) return;
    const last = moves.at(-1);
    if (last) playSound(soundForSan(last.san, last.captured !== null));
    setTimeout(() => playSound("end"), 250);
  }, [moves]);

  const fens = useMemo(() => {
    try {
      return replayGame(startFen, moves).positions.map(toFen);
    } catch {
      return [startFen];
    }
  }, [startFen, moves]);

  const stories = useMemo(
    () => moves.map((_, i) => storyOf(moves, analysis.evals, i)),
    [moves, analysis.evals],
  );
  const review = useMemo(() => reviewGame(moves, analysis.evals), [moves, analysis.evals]);
  const moments = useMemo(() => keyMoments(stories), [stories]);
  const queue = useMemo(
    () => practiceQueue(stories, viewer ? [viewer] : ["w", "b"]),
    [stories, viewer],
  );
  const analysed = !analysis.running && analysis.evals.filter(Boolean).length >= fens.length;

  // ── The position on screen ────────────────────────────────────────────
  const baseFen = fens[ply] ?? startFen;
  const tried = practice?.tried ?? null;
  const extra = useMemo(() => (line ? line.moves : tried ? [tried] : []), [line, tried]);
  const played = useMemo(() => playLine(baseFen, extra), [baseFen, extra]);
  const shownFen = played.fens.at(-1) ?? baseFen;
  const shownLast =
    extra.length > 0 ? (extra.at(-1) ?? null) : ply > 0 ? (moves[ply - 1]?.uci ?? null) : null;

  // The engine's lines for the shown position (arrows; the score off the game line).
  const [lines, setLines] = useState<{ fen: string; lines: PositionEval[] } | null>(null);
  const { explore } = analysis;
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      explore(shownFen)
        .then((l) => live && setLines({ fen: shownFen, lines: l }))
        .catch(() => {});
    }, EXPLORE_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [explore, shownFen]);
  const shownLines = lines?.fen === shownFen ? lines.lines : [];
  const shownScore: Score | null =
    extra.length === 0
      ? (analysis.evals[ply]?.score ?? shownLines[0]?.score ?? null)
      : (terminalScore(shownFen) ?? shownLines[0]?.score ?? null);

  // ── Practice ──────────────────────────────────────────────────────────
  const current = practice ? practice.queue[practice.at] : undefined;
  const currentMove = current !== undefined ? moves[current] : undefined;
  const [judged, setJudged] = useState<{ drop: number } | null>(null);
  // The tree's move, marked where "Your repertoire" says the game left it.
  const [mark, setMark] = useState<{ ply: number; uci: string } | null>(null);
  const tryMove = useCallback(
    (uci: string) => {
      if (!practice || current === undefined || !currentMove) return;
      const best = analysis.evals[current]?.score;
      const after = playLine(fens[current] ?? startFen, [uci]).fens[0];
      if (!best || !after) return;
      dispatch({ type: "try", uci });
      setJudged(null);
      const scored = terminalScore(after);
      const answer = scored
        ? Promise.resolve(scored)
        : explore(after).then((l) => l[0]?.score ?? null);
      void answer.then((score) => {
        if (!score) return;
        const { verdict, drop } = judge(best, score, currentMove.by);
        dispatch({ type: "answer", verdict });
        if (verdict === "miss") {
          setJudged({ drop });
          setTimeout(() => dispatch({ type: "retry" }), MISS_SHOWN_MS);
        }
      });
    },
    [practice, current, currentMove, analysis.evals, fens, startFen, explore, dispatch],
  );
  // A new practice position starts without the last one's miss.
  const practiceAt = practice ? practice.at : null;
  useEffect(() => {
    if (practiceAt !== undefined) setJudged(null);
  }, [practiceAt]);
  // Each practice position is shown from its mover's side.
  useEffect(() => {
    if (currentMove && currentMove.by !== orientation) onOrientationChange(currentMove.by);
  }, [currentMove, orientation, onOrientationChange]);

  // ── Keys ──────────────────────────────────────────────────────────────
  const flip = useCallback(
    () => onOrientationChange(orientation === "w" ? "b" : "w"),
    [orientation, onOrientationChange],
  );
  useStepHotkeys({
    step: (by) => dispatch({ type: "step", by }),
    first: () => dispatch({ type: "go", ply: 0 }),
    last: () => dispatch({ type: "go", ply: total }),
    escape: line
      ? () => dispatch({ type: "leave-line" })
      : practice
        ? () => dispatch({ type: "stop-practice" })
        : undefined,
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof Element &&
        e.target.closest("input, textarea, [contenteditable=true]")
      )
        return;
      if (e.key === "f" || e.key === "F") flip();
      else if (e.key === "Enter" && practice?.solved) dispatch({ type: "next" });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip, practice?.solved, dispatch]);

  // ── Words ─────────────────────────────────────────────────────────────
  const describe = useCallback(
    (p: number) => {
      if (p === 0) return "Start";
      const m = moves[p - 1];
      if (!m) return "";
      const fields = (fens[p - 1] ?? startFen).split(" ");
      const n = Number(fields[5] ?? "1") || 1;
      const mark = stories[p - 1]?.grade;
      const glyph =
        mark === "inaccuracy" ? "?!" : mark === "mistake" ? "?" : mark === "blunder" ? "??" : "";
      return `${n}${m.by === "w" ? "." : "…"} ${m.san}${glyph}`;
    },
    [moves, fens, startFen, stories],
  );

  const practiceView = (): PracticeView => {
    if (!practice || current === undefined) return { kind: "done", found: 0, total: 0 };
    if (practice.done) {
      return {
        kind: "done",
        found: practice.found.filter(Boolean).length,
        total: practice.queue.length,
      };
    }
    const against = describe(current + 1).replace(/[?!]+$/, "");
    if (practice.solved) {
      const pv = shownLines[0]?.pv ?? [];
      return {
        kind: "solved",
        verdict: practice.solved,
        line: lineText(fens[current] ?? startFen, [practice.tried ?? "", ...pv].filter(Boolean)),
      };
    }
    if (practice.tried && !judged) return { kind: "judging", against };
    if (practice.revealed) {
      const best = analysis.evals[current];
      return { kind: "revealed", answer: lineText(fens[current] ?? startFen, best?.pv ?? [], 3) };
    }
    // A miss stays said after the board takes the move back, until the next try.
    if (judged) return { kind: "miss", drop: judged.drop, against };
    return { kind: "ask", against };
  };

  const story = ply > 0 && extra.length === 0 ? (stories[ply - 1] ?? null) : null;
  const card = practice ? (
    <PracticeCard
      view={practiceView()}
      at={(practice.at ?? 0) + 1}
      total={practice.queue.length}
      onNext={() => dispatch({ type: "next" })}
      onStop={() => dispatch({ type: "stop-practice" })}
    />
  ) : line ? (
    <SideLineCard
      text={lineText(fens[line.from] ?? startFen, line.moves, 8)}
      score={shownScore}
      onBack={() => dispatch({ type: "leave-line" })}
    />
  ) : ply === 0 ? (
    <StartCard score={shownScore} />
  ) : (
    <StoryCard
      label={describe(ply).replace(/[?!]+$/, "")}
      story={story}
      bestLine={
        story?.best
          ? lineText(fens[ply - 1] ?? startFen, analysis.evals[ply - 1]?.pv ?? [], 4)
          : null
      }
      pending={analysis.running}
    />
  );

  // ── Board ─────────────────────────────────────────────────────────────
  const marked =
    mark && mark.ply === ply && extra.length === 0 && !practice
      ? [
          {
            from: mark.uci.slice(0, 2),
            to: mark.uci.slice(2, 4),
            tone: "pick" as const,
            emphasis: true,
          },
        ]
      : [];
  const arrows: BoardArrow[] =
    marked.length > 0
      ? marked
      : practice
        ? practice.revealed && current !== undefined && analysis.evals[current]?.best
          ? [
              {
                from: (analysis.evals[current]?.best ?? "").slice(0, 2),
                to: (analysis.evals[current]?.best ?? "").slice(2, 4),
                tone: "best",
              },
            ]
          : []
        : shownLines.slice(0, 3).flatMap((l, i) => {
            const uci = l.pv[0];
            return uci
              ? [
                  {
                    from: uci.slice(0, 2),
                    to: uci.slice(2, 4),
                    tone: i === 0 ? ("best" as const) : ("alt" as const),
                  },
                ]
              : [];
          });
  const canTry = practice && !practice.done && !practice.tried && !practice.solved;
  const boardMoves = practice ? (canTry ? legalAt(shownFen) : []) : legalAt(shownFen);
  const badgeGrade = story?.grade ?? null;
  const badgeMove = ply > 0 ? moves[ply - 1] : undefined;

  // ── Strips ────────────────────────────────────────────────────────────
  const badges = resultBadges(result);
  const shownHistory = useMemo(
    () => [...moves.slice(0, ply), ...played.entries.map((e) => ({ ...e, clockMs: null }))],
    [moves, ply, played.entries],
  );
  const { taken, lead } = material(shownFen, shownHistory);
  const clock = clockAfter(moves, ply, timeControl);
  const strip = (c: Color) => (
    <PlayerStrip
      name={names[c]}
      color={c}
      isAi={aiColors.includes(c)}
      thinking={false}
      taken={taken[c]}
      lead={c === "w" ? lead : -lead}
      clock={clock}
      toMove={false}
      status={badges[c]}
      highlightTurn
    />
  );
  const top: Color = orientation === "w" ? "b" : "w";

  const ticks: GraphTick[] = stories.flatMap((s) =>
    s?.grade && GRADE_TICK[s.grade] ? [{ ply: s.index + 1, color: GRADE_TICK[s.grade] ?? "" }] : [],
  );
  const practiceItems: PracticeItem[] | null = practice
    ? practice.queue.map((index, i) => ({
        label: `${describe(index + 1).replace(/[?!]+$/, "")} · ${stories[index]?.words ?? ""}`,
        state:
          i === practice.at && !practice.done
            ? "current"
            : practice.found[i]
              ? "found"
              : i < practice.at || practice.done
                ? "shown"
                : "waiting",
      }))
    : null;

  const subtitle = [
    resultText(result),
    `${Math.ceil(total / 2)} moves`,
    controlLabel(timeControl),
    date.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
  ].join(" · ");

  return (
    <GameScreen
      sidebarTitle="Review"
      sidebar={
        <ReviewRail
          headline={headlineFor(result, viewer)}
          subtitle={subtitle}
          card={wide ? card : null}
          ply={ply}
          onGo={(p) => dispatch({ type: "go", ply: p })}
          scores={fens.map((_, i) => analysis.evals[i]?.score)}
          ticks={ticks}
          describe={describe}
          names={names}
          accuracy={review.accuracy}
          stories={stories}
          moments={moments}
          practice={practiceItems}
          repertoire={
            viewer ? (
              <RepertoireCard
                color={viewer}
                startFen={startFen}
                moves={ucis}
                onShow={(index, uci) => {
                  dispatch({ type: "go", ply: index });
                  setMark(uci ? { ply: index, uci } : null);
                }}
              />
            ) : null
          }
          history={moves}
          grades={review.grades}
          startFen={startFen}
          sideLine={line ? lineText(fens[line.from] ?? startFen, line.moves, 8) : null}
          progress={analysed ? null : analysis.progress}
          error={analysis.error}
        />
      }
      actionBar={
        <ReviewActions
          onFlip={flip}
          onStep={(by) => dispatch({ type: "step", by })}
          endActions={endActions}
          practice={
            analysed && queue.length === 0
              ? null
              : {
                  count: queue.length,
                  ready: analysed,
                  onStart: () => dispatch({ type: "practice", queue }),
                }
          }
          pgn={{
            startFen,
            moves,
            result,
            timeControl,
            white: names.w,
            black: names.b,
            date,
          }}
          extra={extraActions?.(ply, baseFen)}
        />
      }
    >
      <BoardStage
        top={strip(top)}
        bottom={strip(orientation)}
        beside={(size) => <EvalBar score={shownScore} orientation={orientation} height={size} />}
        under={<div className="pt-1">{card}</div>}
      >
        {() => (
          <ChessBoard
            className="size-full overflow-hidden rounded-card-md shadow-lg"
            fen={shownFen}
            orientation={orientation}
            moves={boardMoves}
            onMove={(uci) => (practice ? tryMove(uci) : dispatch({ type: "play", uci }))}
            lastMove={shownLast}
            arrows={arrows}
            squareBadge={
              badgeGrade && badgeMove
                ? {
                    square: badgeMove.uci.slice(2, 4),
                    text:
                      badgeGrade === "best"
                        ? "★"
                        : badgeGrade === "inaccuracy"
                          ? "?!"
                          : badgeGrade === "mistake"
                            ? "?"
                            : "??",
                    tone: badgeGrade,
                  }
                : null
            }
            aria-label="Game review board"
          />
        )}
      </BoardStage>
    </GameScreen>
  );
}
