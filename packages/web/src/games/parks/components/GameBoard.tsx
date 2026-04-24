import type { Action, ParksPlayerView, PassionId } from "@boardgames/core/games/parks/types";
import { SEASON_LABELS, TRAIL_PARKS_INDEX } from "@boardgames/core/games/parks/types";
import { useCallback, useMemo, useState } from "react";
import { ActionLog } from "../../../components/action-log";
import { GameScreen } from "../../../components/game-layout";
import { mapParksLog } from "../log-mapper";
import ActionPanel from "./ActionPanel";
import CanteenDisplay from "./CanteenDisplay";
import GearMarketDisplay from "./GearMarketDisplay";
import ParkCard from "./ParkCard";
import PassionPickOverlay from "./PassionPickOverlay";
import PlayerArea from "./PlayerArea";
import SeasonMissionsPanel from "./SeasonMissionsPanel";
import TrailDisplay from "./TrailDisplay";

interface GameBoardProps {
  view: ParksPlayerView;
  legalActions: Action[];
  playerIndex: number;
  isMyTurn: boolean;
  isAiThinking: boolean;
  onAction: (action: Action) => void;
}

export default function GameBoard({
  view,
  legalActions,
  playerIndex,
  isMyTurn,
  isAiThinking,
  onAction,
}: GameBoardProps) {
  const [selectedHikerId, setSelectedHikerId] = useState<0 | 1 | null>(null);

  // Build move-target map per hiker from legal actions
  const moveTargetsByHiker = useMemo(() => {
    const map = new Map<0 | 1, Set<number>>();
    map.set(0, new Set());
    map.set(1, new Set());
    for (const a of legalActions) {
      if (a.type === "move") {
        map.get(a.hikerId)?.add(a.targetPosition);
      }
    }
    return map;
  }, [legalActions]);

  const myView = view.players[playerIndex];
  const opponentView = view.players[1 - playerIndex];

  // Hikers the player can still move (any with at least one legal target)
  const movableHikers = useMemo(() => {
    const set = new Set<0 | 1>();
    for (const a of legalActions) {
      if (a.type === "move") set.add(a.hikerId);
    }
    return set;
  }, [legalActions]);

  // Auto-select the only movable hiker if there's exactly one
  const effectiveSelectedHiker: 0 | 1 | null = useMemo(() => {
    if (selectedHikerId !== null && movableHikers.has(selectedHikerId)) return selectedHikerId;
    if (movableHikers.size === 1) {
      const only = Array.from(movableHikers)[0];
      return only;
    }
    return null;
  }, [selectedHikerId, movableHikers]);

  const effectiveTargets =
    effectiveSelectedHiker !== null
      ? (moveTargetsByHiker.get(effectiveSelectedHiker) ?? new Set<number>())
      : new Set<number>();

  const handleSelectMoveTarget = useCallback(
    (pos: number) => {
      if (effectiveSelectedHiker === null) return;
      const action = legalActions.find(
        (a) =>
          a.type === "move" && a.hikerId === effectiveSelectedHiker && a.targetPosition === pos,
      );
      if (action) {
        onAction(action);
        setSelectedHikerId(null);
      }
    },
    [effectiveSelectedHiker, legalActions, onAction],
  );

  const handleSelectCanteen = useCallback(
    (canteenId: number) => {
      const action = legalActions.find(
        (a) => a.type === "use-canteen" && a.canteenId === canteenId,
      );
      if (action) {
        onAction(action);
      }
    },
    [legalActions, onAction],
  );

  // Find buy-park / buy-park-reserved action for a given park
  const buyActionByPark = useMemo(() => {
    const map = new Map<number, Action & { type: "buy-park" | "buy-park-reserved" }>();
    for (const a of legalActions) {
      if (a.type === "buy-park" || a.type === "buy-park-reserved") map.set(a.parkId, a);
    }
    return map;
  }, [legalActions]);

  const handleBuyPark = useCallback(
    (parkId: number) => {
      const action = buyActionByPark.get(parkId);
      if (action) onAction(action);
    },
    [buyActionByPark, onAction],
  );

  // True only when the player's hiker is on Parks site this turn (so park clicks are meaningful)
  const onParksSite = myView.hikers.some((h) => h.position === TRAIL_PARKS_INDEX);

  // Allow canteens during regular playing phase
  const canUseCanteens =
    isMyTurn && view.phase === "playing" && legalActions.some((a) => a.type === "use-canteen");

  // Selected hiker can be toggled by clicking own hiker tokens — but for simplicity
  // we just pre-select via movableHikers; manual override available below if both
  // hikers are movable.
  const showHikerToggle = movableHikers.size === 2 && view.phase === "playing" && isMyTurn;

  const showPassionOverlay = isMyTurn && view.phase === "awaiting-passion-choice";
  const passionOptions = myView.passionOptions;

  const handlePickPassion = useCallback(
    (passionId: PassionId) => {
      onAction({ type: "choose-passion", passionId });
    },
    [onAction],
  );

  return (
    <GameScreen
      sidebar={<ActionLog blocks={mapParksLog(view.actionLog, playerIndex)} />}
      fanActions={
        <ActionPanel
          view={view}
          legalActions={legalActions}
          isMyTurn={isMyTurn}
          isAiThinking={isAiThinking}
          onAction={onAction}
        />
      }
      fan={
        <div className="grid h-60 grid-cols-2 gap-2">
          <PlayerArea
            player={myView}
            isMe
            isActive={view.activePlayer === playerIndex}
            selectedCanteenId={null}
            onSelectCanteen={handleSelectCanteen}
            canUseCanteens={canUseCanteens}
            hasShutterbug={view.shutterbugHolder === playerIndex}
            hasFirstPlayerToken={view.firstPlayerToken === playerIndex}
            legalActions={isMyTurn ? legalActions : undefined}
            onAction={onAction}
          />
          <PlayerArea
            player={opponentView}
            isMe={false}
            isActive={view.activePlayer !== playerIndex}
            selectedCanteenId={null}
            canUseCanteens={false}
            hasShutterbug={view.shutterbugHolder === 1 - playerIndex}
            hasFirstPlayerToken={view.firstPlayerToken === 1 - playerIndex}
          />
        </div>
      }
    >
      {/* Top bar — season + status */}
      <div className="flex shrink-0 items-center justify-between gap-3 rounded-lg bg-stone-900/40 px-3 py-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
            {SEASON_LABELS[view.season]}
          </span>
          <span className="text-[10px] text-stone-400">
            Turn {view.turnCount + 1} · Parks deck {view.parksDeckCount}
          </span>
        </div>
        {showHikerToggle && (
          <div className="flex items-center gap-1 text-[10px]">
            <span className="text-stone-400">Hiker:</span>
            {([0, 1] as (0 | 1)[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setSelectedHikerId(id)}
                className={`rounded-md border px-2 py-0.5 font-bold transition ${
                  effectiveSelectedHiker === id
                    ? "border-emerald-400 bg-emerald-500/30 text-white"
                    : "border-stone-600 bg-stone-800 text-stone-300 hover:bg-stone-700"
                }`}
              >
                {id + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Info bar — [canteens / missions] · parks · gear */}
      <div className="grid shrink-0 grid-cols-1 gap-2 lg:grid-cols-[auto_1fr_auto]">
        <div className="flex flex-col gap-2">
          <CanteenDisplay
            view={view}
            legalActions={legalActions}
            isMyTurn={isMyTurn}
            onAction={onAction}
          />
          <SeasonMissionsPanel view={view} myIndex={playerIndex} />
        </div>
        <div className="rounded-lg bg-stone-900/40 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
              Parks Available
            </span>
            {onParksSite && isMyTurn && (
              <span className="text-[10px] text-emerald-400">
                Hiker on Parks site — affordable parks highlighted
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-stretch gap-1.5">
            {view.parksDisplay.map((park) => {
              const affordable = buyActionByPark.has(park.id);
              return (
                <ParkCard
                  key={park.id}
                  park={park}
                  affordable={affordable}
                  onClick={affordable ? () => handleBuyPark(park.id) : undefined}
                  compact
                />
              );
            })}
            {view.parksDeckCount > 0 && (
              <div
                className="flex min-w-[80px] flex-col items-center justify-center rounded-md border border-stone-600/60 bg-stone-800/60 p-1.5 text-center"
                title="Park deck"
              >
                <div className="text-lg">{"\uD83C\uDFDE\uFE0F"}</div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-stone-300">
                  Deck
                </div>
                <div className="text-[9px] text-stone-500">{view.parksDeckCount}</div>
              </div>
            )}
            {view.parksDisplay.length === 0 && view.parksDeckCount === 0 && (
              <span className="text-xs italic text-stone-500">No parks remaining</span>
            )}
          </div>
        </div>
        <GearMarketDisplay
          view={view}
          legalActions={legalActions}
          isMyTurn={isMyTurn}
          onAction={onAction}
        />
      </div>

      {/* Trail */}
      <TrailDisplay
        view={view}
        selectedHikerId={effectiveSelectedHiker}
        legalMoveTargets={effectiveTargets}
        onSelectMoveTarget={handleSelectMoveTarget}
        myIndex={playerIndex}
      />

      {showPassionOverlay && (
        <PassionPickOverlay options={passionOptions} onPick={handlePickPassion} />
      )}
    </GameScreen>
  );
}
