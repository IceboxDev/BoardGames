import type { Color } from "@boardgames/core/games/chess/engine/types";
import type { ChessAction, ChessPlayerView } from "@boardgames/core/games/chess/schemas";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameScreen } from "../../../components/game-layout";
import { useMuted } from "../../../lib/sound/useMuted";
import { positionAt, useSquareFit } from "../logic/board-view";
import { material } from "../logic/moves";
import { CHESS_MUTE_KEY, playSound, soundForSan } from "../logic/sound";
import { LOW_TIME_MS, useClockMs } from "../logic/useClockMs";
import { ActionBar } from "./ActionBar";
import ChessBoard, { type BoardArrow } from "./board/ChessBoard";
import { type MoveGrade, MoveList } from "./MoveList";
import { PlayerStrip } from "./PlayerStrip";

/** Room for the two player strips (name + captured row + clock) and their gaps. */
const STRIPS_H = 2 * 48 + 8;

interface Props {
  view: ChessPlayerView;
  /** The viewer's colour, or `null` for a spectator / replay. */
  color: Color | null;
  names: Readonly<Record<Color, string>>;
  legal: readonly ChessAction[];
  send: (action: ChessAction) => void;
  /** Extra buttons for the action bar (game over: PGN, analysis). */
  actionExtra?: ReactNode;
  /** Analysis overlays for the browsed position. */
  arrows?: readonly BoardArrow[];
  grades?: readonly MoveGrade[];
  /** Shown beside the board, given the board's size in px (the analysis eval bar). */
  besideBoard?: (boardSize: number) => ReactNode;
  /** Shown above the move list (analysis summary). */
  sidebarExtra?: ReactNode;
  /** Report the ply on screen and its FEN (analysis follows it). */
  onShownChange?: (shown: { ply: number; fen: string }) => void;
  /** Controlled browsing (analysis drives it); otherwise local. */
  viewing?: number | null;
  onViewingChange?: (ply: number | null) => void;
}

export default function GameBoard({
  view,
  color,
  names,
  legal,
  send,
  actionExtra,
  arrows,
  grades,
  besideBoard,
  sidebarExtra,
  onShownChange,
  viewing: viewingProp,
  onViewingChange,
}: Props) {
  const [orientation, setOrientation] = useState<Color>(color ?? "w");
  const [localViewing, setLocalViewing] = useState<number | null>(null);
  const viewing = viewingProp !== undefined ? viewingProp : localViewing;
  const setViewing = onViewingChange ?? setLocalViewing;
  const [premove, setPremove] = useState<string | null>(null);
  const [muted, toggleMuted] = useMuted(CHESS_MUTE_KEY);
  const [fitRef, size] = useSquareFit<HTMLDivElement>(besideBoard ? 40 : 0, STRIPS_H);

  const live = viewing === null;
  const shownFen = live ? view.fen : (positionAt(view, viewing) ?? view.fen);
  const shownLast = live
    ? (view.history.at(-1)?.uci ?? null)
    : viewing > 0
      ? (view.history[viewing - 1]?.uci ?? null)
      : null;
  const shownPly = viewing ?? view.history.length;
  useEffect(() => {
    onShownChange?.({ ply: shownPly, fen: shownFen });
  }, [onShownChange, shownPly, shownFen]);
  const moveUcis = useMemo(
    () => (live ? legal.flatMap((a) => (a.kind === "move" ? [a.uci] : [])) : []),
    [legal, live],
  );
  const over = view.result !== null;
  const toMove: Color = view.fen.split(" ")[1] === "b" ? "b" : "w";
  const myTurn = color !== null && toMove === color && !over;

  // A queued premove plays the moment it becomes legal — or is dropped.
  useEffect(() => {
    if (!premove || !myTurn) return;
    if (moveUcis.includes(premove)) send({ kind: "move", uci: premove });
    setPremove(null);
  }, [premove, myTurn, moveUcis, send]);
  useEffect(() => {
    if (over) setPremove(null);
  }, [over]);

  // Sounds for every new move, and one at the end.
  const seenPlies = useRef(view.history.length);
  useEffect(() => {
    const plies = view.history.length;
    if (plies > seenPlies.current && !muted) {
      const last = view.history[plies - 1];
      if (last) playSound(soundForSan(last.san, last.captured !== null));
    }
    seenPlies.current = plies;
  }, [view.history, muted]);
  const ended = useRef(over);
  useEffect(() => {
    if (over && !ended.current && !muted) playSound("end");
    ended.current = over;
  }, [over, muted]);

  const myMs = useClockMs(view.clock, color ?? "w");
  const warned = useRef(false);
  useEffect(() => {
    if (!color || !view.clock || view.clock.running !== color || myMs === null) return;
    if (myMs < LOW_TIME_MS && !warned.current) {
      warned.current = true;
      if (!muted) playSound("low-time");
    }
    if (myMs >= LOW_TIME_MS) warned.current = false;
  }, [myMs, color, view.clock, muted]);

  const step = useCallback(
    (delta: number) => {
      const total = view.history.length;
      const current = viewing ?? total;
      const next = Math.max(0, Math.min(total, current + delta));
      setViewing(next === total ? null : next);
    },
    [view.history.length, viewing, setViewing],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true], svg")) return;
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "Home") setViewing(view.history.length === 0 ? null : 0);
      else if (e.key === "End") setViewing(null);
      else if (e.key === "f" || e.key === "F") setOrientation((o) => (o === "w" ? "b" : "w"));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, setViewing, view.history.length]);

  const { taken, lead } = material(shownFen, view.history.slice(0, shownPly));
  const top: Color = orientation === "w" ? "b" : "w";
  const bottom: Color = orientation;
  const seatOf = (c: Color) => view.seatColors.indexOf(c);
  const strip = (c: Color) => (
    <PlayerStrip
      name={names[c]}
      color={c}
      isAi={view.aiSeats.includes(seatOf(c))}
      thinking={view.aiThinking && toMove === c}
      taken={taken[c]}
      lead={c === "w" ? lead : -lead}
      clock={view.clock}
      disconnected={view.disconnected.includes(seatOf(c))}
      toMove={!over && toMove === c}
    />
  );

  const startFields = view.startFen.split(" ");

  return (
    <GameScreen
      sidebar={
        <div className="flex min-h-0 flex-col gap-3">
          {sidebarExtra}
          <MoveList
            history={view.history}
            viewing={viewing}
            onSelect={setViewing}
            startNumber={Number(startFields[5] ?? "1") || 1}
            startsWithBlack={startFields[1] === "b"}
            grades={grades}
          />
        </div>
      }
      actionBar={
        <ActionBar
          legal={legal}
          send={send}
          onFlip={() => setOrientation((o) => (o === "w" ? "b" : "w"))}
          muted={muted}
          onToggleMute={toggleMuted}
          extra={actionExtra}
        />
      }
    >
      {/* Strips and board are one block sized to the space, so the names and
          clocks stay against the board's edges at every width. */}
      <div ref={fitRef} className="flex min-h-0 flex-1 items-center justify-center">
        <div className="flex items-center gap-2">
          {besideBoard?.(size)}
          <div className="flex flex-col gap-1" style={{ width: size }}>
            {strip(top)}
            <div style={{ width: size, height: size }}>
              {size > 0 && (
                <ChessBoard
                  className="size-full overflow-hidden rounded-card-md shadow-lg"
                  fen={shownFen}
                  orientation={orientation}
                  moves={myTurn ? moveUcis : []}
                  onMove={(uci) => send({ kind: "move", uci })}
                  premoveColor={live && !over && color && !myTurn ? color : null}
                  premove={premove}
                  onPremove={setPremove}
                  lastMove={shownLast}
                  arrows={arrows}
                  aria-label={`Chess board, ${toMove === "w" ? "White" : "Black"} to move`}
                />
              )}
            </div>
            {strip(bottom)}
          </div>
        </div>
      </div>
    </GameScreen>
  );
}
