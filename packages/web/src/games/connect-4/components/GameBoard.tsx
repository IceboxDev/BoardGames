import type { Action, Connect4PlayerView } from "@boardgames/core/games/connect-4/types";
import { useMemo } from "react";
import { ActionLog } from "../../../components/action-log";
import { GameScreen } from "../../../components/game-layout";
import { useMuted } from "../../../lib/sound/useMuted";
import { mapConnect4Log } from "../log-mapper";
import { CONNECT4_MUTE_KEY } from "../logic/sound";
import { endWords, seatName } from "../logic/text";
import { useAssists } from "../logic/useAssists";
import { useBackgroundAnalysis } from "../logic/useBackgroundAnalysis";
import { useBoardHotkeys } from "../logic/useBoardHotkeys";
import { useMoveSender } from "../logic/useMoveSender";
import { useMoveSounds } from "../logic/useMoveSounds";
import { ActionBar } from "./ActionBar";
import Connect4Board from "./board/Connect4Board";
import { seatInk } from "./board/palette";
import { EvalBar } from "./EvalBar";
import { PlayersPanel } from "./PlayersPanel";

interface Props {
  view: Connect4PlayerView;
  legal: readonly Action[];
  /** The viewer's seat, or null for a spectator. */
  seat: number | null;
  names: readonly string[];
  isAiThinking: boolean;
  send: (action: Action) => void;
}

/** One line over the board: whose move, or how the game just ended. */
function statusLine(
  view: Connect4PlayerView,
  seat: number | null,
  names: readonly string[],
  thinking: boolean,
): string {
  if (view.phase !== "playing") {
    const last = view.games.at(-1);
    if (!last) return "";
    const { status } = endWords(last, names);
    return view.phase === "between-games" ? `${status} · next game starts shortly` : status;
  }
  if (seat === view.currentPlayer) return "Your move";
  const name = seatName(view.currentPlayer, names);
  return thinking ? `${name} is thinking…` : `${name} to move`;
}

export default function GameBoard({ view, legal, seat, names, isAiThinking, send }: Props) {
  const [muted, toggleMuted] = useMuted(CONNECT4_MUTE_KEY);
  useMoveSounds(view, muted);
  useBackgroundAnalysis(view);

  const mover = useMoveSender(legal, send, `${view.gameIndex}:${view.moves.length}`);
  const droppable = useMemo(
    () => (mover.pending ? [] : legal.flatMap((a) => (a.type === "drop" ? [a.column] : []))),
    [legal, mover.pending],
  );
  const poppable = useMemo(
    () => (mover.pending ? [] : legal.flatMap((a) => (a.type === "pop" ? [a.column] : []))),
    [legal, mover.pending],
  );
  const myTurn = droppable.length + poppable.length > 0;

  const assists = useAssists(view, myTurn);
  const focus = useBoardHotkeys({
    cols: view.cols,
    myTurn,
    drop: mover.drop,
    pop: mover.pop,
    hint: assists.requestHint,
    toggleEval: assists.evalAvailable ? assists.toggleEval : null,
  });

  const playing = view.phase === "playing";
  return (
    <GameScreen
      leftSidebarLabel="Players"
      leftSidebar={
        <PlayersPanel view={view} seat={seat} names={names} aiThinking={isAiThinking}>
          {assists.evalOn && (
            <EvalBar
              state={assists.evaluation}
              toMove={view.currentPlayer}
              names={names}
              board={view}
              reach={assists.reach}
            />
          )}
        </PlayersPanel>
      }
      sidebar={
        <ActionLog
          blocks={mapConnect4Log(view.games, { moves: view.moves, inProgress: playing }, names)}
          emptyMessage="No moves yet"
        />
      }
      actionBar={
        <ActionBar
          legal={legal}
          send={send}
          assists={assists}
          muted={muted}
          onToggleMute={toggleMuted}
        />
      }
    >
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2">
        <p
          className="text-center text-sm font-semibold text-fg-primary"
          aria-live="polite"
          style={playing ? { color: seatInk(view.currentPlayer) } : undefined}
        >
          {statusLine(view, seat, names, isAiThinking)}
        </p>
        <Connect4Board
          className="min-h-0 w-full flex-1"
          cols={view.cols}
          rows={view.rows}
          popOut={view.config.popOut}
          gameIndex={view.gameIndex}
          moves={view.moves}
          winningCells={playing ? [] : view.winningCells}
          toMove={view.currentPlayer}
          droppable={droppable}
          poppable={poppable}
          onDrop={mover.drop}
          onPop={mover.pop}
          highlight={assists.hint.flatMap((m) => (m.type === "drop" ? [m.column] : []))}
          highlightPops={assists.hint.flatMap((m) => (m.type === "pop" ? [m.column] : []))}
          focusColumn={myTurn ? focus : null}
        />
      </div>
    </GameScreen>
  );
}
