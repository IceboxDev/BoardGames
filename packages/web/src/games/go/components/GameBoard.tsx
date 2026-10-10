import type { GoAction, GoPlayerView } from "@boardgames/core/games/go/view";
import { useMemo } from "react";
import { ActionLog } from "../../../components/action-log";
import { GameScreen } from "../../../components/game-layout";
import { useMediaQuery, WIDE_BOARD_QUERY } from "../../../hooks/useMediaQuery";
import { mapGoLog } from "../log-mapper";
import { playablePoints, togglablePoints } from "../logic/actions";
import ActionBar from "./ActionBar";
import GoBoard from "./board/GoBoard";
import PlayerRail from "./PlayerRail";

interface Props {
  readonly view: GoPlayerView;
  readonly legal: readonly GoAction[];
  readonly names: readonly string[];
  readonly vsAi: boolean;
  readonly send: (action: GoAction) => void;
}

/** The game in progress: rails, the board, and the action bar. */
export default function GameBoard({ view, legal, names, vsAi, send }: Props) {
  const wide = useMediaQuery(WIDE_BOARD_QUERY);
  const scoring = view.scoring;
  const active = useMemo(
    () => (scoring ? togglablePoints(legal) : playablePoints(legal)),
    [legal, scoring],
  );
  const onPoint = (point: number) => {
    const action = legal.find(
      (a) => (a.type === "play" || a.type === "toggle-dead") && a.point === point,
    );
    if (action) send(action);
  };
  const last = view.moves.at(-1);
  return (
    <GameScreen
      leftSidebar={<PlayerRail view={view} names={names} />}
      leftSidebarTitle="Players"
      leftSidebarLabel="Players"
      sidebar={
        <ActionLog
          blocks={mapGoLog(view.size, view.moves, names, view.result)}
          emptyMessage="No moves yet"
        />
      }
      actionBar={<ActionBar view={view} legal={legal} vsAi={vsAi} send={send} />}
    >
      {!wide && <PlayerRail view={view} names={names} compact />}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <GoBoard
          size={view.size}
          board={view.board}
          lastMove={last?.point ?? null}
          koPoint={view.koPoint}
          active={active}
          ghost={scoring ? null : view.you}
          onPoint={onPoint}
          dead={scoring ? new Set(scoring.dead) : undefined}
          ownership={scoring && !scoring.proposing ? scoring.breakdown.ownership : null}
          className="aspect-square h-full max-h-full w-full max-w-full"
        />
      </div>
    </GameScreen>
  );
}
