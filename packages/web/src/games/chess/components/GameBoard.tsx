import type { Color } from "@boardgames/core/games/chess/engine/types";
import type { ChessAction, ChessPlayerView } from "@boardgames/core/games/chess/schemas";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameScreen } from "../../../components/game-layout";
import { useTurnAlert } from "../../../hooks/useTurnAlert";
import { useMuted } from "../../../lib/sound/useMuted";
import { positionAt } from "../logic/board-view";
import { material } from "../logic/moves";
import { CHESS_MUTE_KEY, playSound, soundForSan } from "../logic/sound";
import { LOW_TIME_MS, useClockMs } from "../logic/useClockMs";
import { useOfferNotices } from "../logic/useOfferNotices";
import { ActionBar } from "./ActionBar";
import { BoardStage } from "./BoardStage";
import { BrowseChip } from "./BrowseChip";
import ChessBoard from "./board/ChessBoard";
import { MoveList } from "./MoveList";
import { PlayerStrip } from "./PlayerStrip";

interface Props {
  view: ChessPlayerView;
  /** The viewer's colour, or `null` for a spectator. */
  color: Color | null;
  names: Readonly<Record<Color, string>>;
  legal: readonly ChessAction[];
  send: (action: ChessAction) => void;
  /** The colour at the bottom, kept by the caller so the review opens the same way up. */
  orientation: Color;
  onOrientationChange: (orientation: Color) => void;
}

/**
 * The live game: the board between the player strips, the score sheet, the
 * action bar. Once the game ends `ReviewBoard` takes its place, laid out the
 * same (`BoardStage`), so the board stays where it was.
 */
export default function GameBoard({
  view,
  color,
  names,
  legal,
  send: sendRaw,
  orientation,
  onOrientationChange,
}: Props) {
  const [viewing, setViewing] = useState<number | null>(null);
  const [premove, setPremove] = useState<string | null>(null);
  const [muted, toggleMuted] = useMuted(CHESS_MUTE_KEY);
  const flip = useCallback(
    () => onOrientationChange(orientation === "w" ? "b" : "w"),
    [orientation, onOrientationChange],
  );

  const live = viewing === null;
  const shownFen = live ? view.fen : (positionAt(view, viewing) ?? view.fen);
  const shownLast = live
    ? (view.history.at(-1)?.uci ?? null)
    : viewing > 0
      ? (view.history[viewing - 1]?.uci ?? null)
      : null;
  const shownPly = viewing ?? view.history.length;
  const moveUcis = useMemo(
    () => (live ? legal.flatMap((a) => (a.kind === "move" ? [a.uci] : [])) : []),
    [legal, live],
  );
  const over = view.result !== null;
  const toMove: Color = view.fen.split(" ")[1] === "b" ? "b" : "w";
  const myTurn = color !== null && toMove === color && !over;
  const opponentIsAi =
    color !== null && view.aiSeats.includes(view.seatColors.indexOf(color === "w" ? "b" : "w"));
  const notices = useOfferNotices(view, color, opponentIsAi, sendRaw);
  const send = notices.send;
  useTurnAlert(myTurn ? "Your move" : null);

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

  // A move that arrived while browsing: the chip says so.
  const browsedAt = useRef<number | null>(null);
  if (live) browsedAt.current = null;
  else browsedAt.current ??= view.history.length;
  const fresh = !live && view.history.length > (browsedAt.current ?? view.history.length);

  const step = useCallback(
    (delta: number) => {
      const total = view.history.length;
      const current = viewing ?? total;
      const next = Math.max(0, Math.min(total, current + delta));
      setViewing(next === total ? null : next);
    },
    [view.history.length, viewing],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable=true], [data-board-keys="on"]'))
        return;
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "Home") setViewing(view.history.length === 0 ? null : 0);
      else if (e.key === "End") setViewing(null);
      else if (e.key === "f" || e.key === "F") flip();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, flip, view.history.length]);

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
      status={notices.status[c]}
      highlightTurn
    />
  );

  const startFields = view.startFen.split(" ");

  return (
    <GameScreen
      sidebar={
        <MoveList
          history={view.history}
          viewing={viewing}
          onSelect={setViewing}
          startNumber={Number(startFields[5] ?? "1") || 1}
          startsWithBlack={startFields[1] === "b"}
        />
      }
      actionBar={
        <ActionBar
          legal={legal}
          send={send}
          onFlip={flip}
          onStep={step}
          muted={muted}
          onToggleMute={toggleMuted}
        />
      }
    >
      <BoardStage
        top={strip(top)}
        bottom={strip(bottom)}
        overlay={
          !live && !over ? (
            <BrowseChip
              ply={shownPly}
              total={view.history.length}
              fresh={fresh}
              onLive={() => setViewing(null)}
            />
          ) : null
        }
      >
        {() => (
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
            onInertPress={!live && !over ? () => setViewing(null) : undefined}
            aria-label={`Chess board, ${toMove === "w" ? "White" : "Black"} to move`}
          />
        )}
      </BoardStage>
    </GameScreen>
  );
}
