import { REGIONS } from "@boardgames/core/games/senso-battle-for-japan/map";
import type {
  Action,
  CardId,
  SensoPlayerView,
} from "@boardgames/core/games/senso-battle-for-japan/types";
import {
  CLAN_KANJI,
  CLAN_LABELS,
  regionLabel,
} from "@boardgames/core/games/senso-battle-for-japan/types";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { ActionLog } from "../../../components/action-log";
import { GameScreen, PromptRow } from "../../../components/game-layout";
import { Button } from "../../../components/ui";
import { useMediaQuery, WIDE_BOARD_QUERY } from "../../../hooks/useMediaQuery";
import { mapSensoLog } from "../log-mapper";
import { activeSeatOf } from "../logic/active-seat";
import { cardLabel } from "../logic/cards";
import {
  aggressionSquares,
  balanceSources,
  balanceTargets,
  bonusRegions,
  determinationRegions,
  passAction,
  squareKey,
} from "../logic/legal";
import { IDLE, type PickerState, pickerAs, reducePicker } from "../logic/reward-picker";
import { seatLabel, seatShortLabel } from "../logic/seat-labels";
import AdvantageStrip from "./AdvantageStrip";
import { LAYOUTS } from "./board/geometry";
import { useMapOrientation } from "./board/orientation";
import SensoMap, { type MapTargetSpec } from "./board/SensoMap";
import ClanRail from "./ClanRail";
import PlayerHand from "./PlayerHand";
import RewardControls from "./RewardControls";
import TricksTray from "./TricksTray";
import TrickTable from "./TrickTable";

interface GameBoardProps {
  view: SensoPlayerView;
  legalActions: Action[];
  isMyTurn: boolean;
  isAiThinking: boolean;
  playerNames: readonly (string | null)[];
  onAction: (action: Action) => void;
  /** Dev preview only: start the reward picker in a given step. */
  initialPickerState?: PickerState;
}

function lowestOccupied(squares: readonly (string | null)[]): number {
  for (let i = squares.length - 1; i >= 0; i--) if (squares[i] !== null) return i;
  return -1;
}

export default function GameBoard({
  view,
  legalActions,
  isMyTurn,
  isAiThinking,
  playerNames,
  onAction,
  initialPickerState,
}: GameBoardProps) {
  const [selectedCard, setSelectedCard] = useState<CardId | null>(null);
  const [picker, dispatch] = useReducer(reducePicker, initialPickerState ?? IDLE);
  const wide = useMediaQuery(WIDE_BOARD_QUERY);
  const orientation = useMapOrientation();

  const me = view.players[view.me];
  const activeSeat = activeSeatOf(view);
  const slot = view.rewardQueue[0] ?? null;
  const myRewardTurn = isMyTurn && view.phase === "rewards" && slot?.player === view.me;
  const myBonusTurn = isMyTurn && view.phase === "bonus" && view.bonusQueue[0] === view.me;
  const needsClan = me?.clan === null;
  const pickerPhase = myRewardTurn ? "rewards" : myBonusTurn ? "bonus" : "other";

  // Re-arm the picker whenever the server hands this seat a (new) decision:
  // a new slot, the second Focus pick, a bonus seat, or any board change.
  const decisionKey = [
    pickerPhase,
    slot?.player ?? "-",
    slot?.picksLeft ?? "-",
    view.bonusQueue[0] ?? "-",
    view.board.map((squares) => squares.map((c) => c?.[0] ?? ".").join("")).join("|"),
  ].join("/");
  useEffect(() => {
    if (initialPickerState) return;
    if (!decisionKey) return;
    dispatch({ type: "reset", phase: pickerPhase, needsClan });
  }, [decisionKey, pickerPhase, needsClan, initialPickerState]);

  const trickKey = `${view.phase}/${view.turn}/${view.trickNumber}`;
  useEffect(() => {
    if (trickKey) setSelectedCard(null);
  }, [trickKey]);

  const as = pickerAs(picker);
  const names = playerNames;

  // Auto-select the only cube that can start a Balance reward.
  const sources = useMemo(() => balanceSources(legalActions, as), [legalActions, as]);
  useEffect(() => {
    if (picker.step === "balance-source" && sources.size === 1) {
      const [only] = sources.values();
      if (only) dispatch({ type: "pick-source", region: only.region, square: only.square });
    }
  }, [picker.step, sources]);

  const targets = useMemo((): MapTargetSpec[] => {
    const squareLabel = (region: number, square: number) =>
      `region ${regionLabel(region)}, square ${square + 1}`;
    const whose = as === undefined ? "Your" : CLAN_LABELS[as];
    const sourceSpec = (region: number, square: number, selected = false): MapTargetSpec => ({
      id: `src:${squareKey(region, square)}`,
      kind: "source",
      region,
      square,
      label: selected
        ? `Selected cube in ${squareLabel(region, square)} — click to deselect`
        : `${whose} cube in ${squareLabel(region, square)}`,
      selected,
    });
    switch (picker.step) {
      case "balance-source":
        return [...sources.values()].map(({ region, square }) => sourceSpec(region, square));
      case "balance-dest": {
        const { from } = picker;
        const t = balanceTargets(legalActions, from, as);
        const out: MapTargetSpec[] = [];
        if (t.swap) {
          out.push({
            id: "swap",
            kind: "swap",
            region: from.region,
            square: from.square - 1,
            label: `Swap up into ${squareLabel(from.region, from.square - 1)}`,
          });
        }
        for (const to of t.moves.keys()) {
          out.push({
            id: `move:${to}`,
            kind: "place",
            region: to,
            label: `March into region ${regionLabel(to)}`,
          });
        }
        const struck = new Set<string>();
        for (const to of t.replaces.keys()) {
          const square = lowestOccupied(view.board[to]);
          struck.add(squareKey(to, square));
          out.push({
            id: `replace:${to}`,
            kind: "strike",
            region: to,
            square,
            label: `Push out the lowest cube of region ${regionLabel(to)}`,
          });
        }
        // Every source stays clickable so the player can hop from cube to cube
        // without leaving the reward. Drawn last: a cube inside a march-target
        // region takes the click, the region around it still marches. A cube
        // that is itself the push-out victim (the Emperor pushing out the
        // colour it moves) yields to the strike.
        for (const { region, square } of sources.values()) {
          if (struck.has(squareKey(region, square))) continue;
          out.push(sourceSpec(region, square, region === from.region && square === from.square));
        }
        return out;
      }
      case "target":
        if (picker.kind === "determination") {
          return [...determinationRegions(legalActions, as).keys()].map((region) => ({
            id: `det:${region}`,
            kind: "place",
            region,
            label: `Reinforce region ${regionLabel(region)}`,
          }));
        }
        if (picker.kind === "aggression") {
          return [...aggressionSquares(legalActions, as).values()].flatMap((a) =>
            a.type === "aggression"
              ? [
                  {
                    id: `agg:${squareKey(a.region, a.square)}`,
                    kind: "strike" as const,
                    region: a.region,
                    square: a.square,
                    label: `Strike the cube in ${squareLabel(a.region, a.square)}`,
                  },
                ]
              : [],
          );
        }
        return [...bonusRegions(legalActions).keys()].map((region) => ({
          id: `bonus:${region}`,
          kind: "place",
          region,
          label: `Place the bonus cube in region ${regionLabel(region)}`,
        }));
      default:
        return [];
    }
  }, [picker, legalActions, as, sources, view.board]);

  const send = useCallback(
    (action: Action | undefined) => {
      if (!action) return;
      onAction(action);
      dispatch({ type: "cancel" });
    },
    [onAction],
  );

  const handleTarget = useCallback(
    (id: string) => {
      const colon = id.indexOf(":");
      const kind = colon === -1 ? id : id.slice(0, colon);
      const rest = colon === -1 ? undefined : id.slice(colon + 1);
      if (kind === "src" && rest) {
        const [r, s] = rest.split(":").map(Number);
        const reselect =
          picker.step === "balance-dest" && picker.from.region === r && picker.from.square === s;
        dispatch(reselect ? { type: "back" } : { type: "pick-source", region: r, square: s });
        return;
      }
      if (picker.step === "balance-dest") {
        const t = balanceTargets(legalActions, picker.from, as);
        if (id === "swap") return send(t.swap ?? undefined);
        if (kind === "move" && rest) return send(t.moves.get(Number(rest)));
        if (kind === "replace" && rest) return send(t.replaces.get(Number(rest)));
      }
      if (kind === "det" && rest)
        return send(determinationRegions(legalActions, as).get(Number(rest)));
      if (kind === "agg" && rest) return send(aggressionSquares(legalActions, as).get(rest));
      if (kind === "bonus" && rest) return send(bonusRegions(legalActions).get(Number(rest)));
    },
    [picker, legalActions, as, send],
  );

  const playSelected = useCallback(() => {
    if (!selectedCard) return;
    const action = legalActions.find((a) => a.type === "play" && a.card === selectedCard);
    if (action) onAction(action);
    setSelectedCard(null);
  }, [selectedCard, legalActions, onAction]);

  const pass = useCallback(() => send(passAction(legalActions)), [legalActions, send]);

  // Say in words what the Affected marker is hiding: a neighbour another seat
  // touched this phase cannot be a destination, and a full neighbour has no
  // square to march into.
  const balanceNote = useMemo(() => {
    if (picker.step !== "balance-dest") return null;
    const parts: string[] = [];
    for (const to of REGIONS[picker.from.region].adjacent) {
      const lock = view.affected.find((a) => a.region === to && a.by !== view.me);
      if (lock) {
        parts.push(
          `Region ${regionLabel(to)} is locked — ${seatShortLabel(view, lock.by, names)} acted there this phase`,
        );
      } else if (view.board[to].every((c) => c !== null)) {
        parts.push(`Region ${regionLabel(to)} is full`);
      }
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [picker, view, names]);

  const activeLabel = activeSeat >= 0 ? seatLabel(view, activeSeat, names) : "";
  const trumpLabel = `${CLAN_KANJI[view.trumpSuit]}`;

  function fanActions() {
    switch (view.phase) {
      case "trick":
        if (isMyTurn && selectedCard) {
          return (
            <div className="flex items-center justify-center gap-2">
              <Button variant="success" size="xs" onClick={playSelected}>
                Play {cardLabel(selectedCard)}
              </Button>
              <Button variant="secondary" size="xs" onClick={() => setSelectedCard(null)}>
                Cancel
              </Button>
            </div>
          );
        }
        if (isMyTurn) {
          return (
            <PromptRow
              title="Your turn"
              message={
                view.leadSuit
                  ? `Follow ${CLAN_KANJI[view.leadSuit]} if you can · trump ${trumpLabel}`
                  : view.table.length === 0
                    ? `Lead a card · trump ${trumpLabel}`
                    : `A Ninja was led · play anything`
              }
            />
          );
        }
        return (
          <PromptRow
            title={isAiThinking ? "AI" : activeLabel}
            tone="waiting"
            pulse
            message={isAiThinking ? "thinking…" : "playing a card…"}
          />
        );
      case "trick-settle":
        return (
          <PromptRow
            title="Conflict"
            tone="waiting"
            message={`${view.completedTrick ? seatShortLabel(view, view.completedTrick.winner, names) : ""} wins the conflict`}
          />
        );
      case "rewards":
      case "bonus":
        if (myRewardTurn || myBonusTurn) {
          return (
            <RewardControls
              legal={legalActions}
              picker={picker}
              dispatch={dispatch}
              slot={slot}
              onPass={pass}
              note={balanceNote}
            />
          );
        }
        return (
          <PromptRow
            title={activeLabel}
            tone="waiting"
            pulse
            message={view.phase === "bonus" ? "placing a bonus cube…" : "choosing a reward…"}
          >
            {slot?.picksLeft === 2 && <span className="text-3xs text-amber-300">2 picks</span>}
          </PromptRow>
        );
      default:
        return <PromptRow title="Game over" tone="waiting" message="tallying the provinces" />;
    }
  }

  const activeIndex = (view.round - 1) % 4;
  const myTricks = me?.tricksWon ?? 0;

  return (
    <GameScreen
      background="senso-kanji bg-surface-950"
      leftSidebarLabel="Clans"
      leftSidebar={<ClanRail view={view} names={names} activeSeat={activeSeat} />}
      sidebar={<ActionLog blocks={mapSensoLog(view.log, view, names)} />}
      fan={
        view.hand.length > 0 ? (
          <PlayerHand
            hand={view.hand}
            trump={view.trumpSuit}
            legalActions={legalActions}
            selected={selectedCard}
            onSelect={setSelectedCard}
            disabled={!isMyTurn || view.phase !== "trick"}
          />
        ) : (
          <TricksTray count={myTricks} />
        )
      }
      fanActions={fanActions()}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <div className="flex shrink-0 flex-col gap-3 lg:order-last lg:w-64">
          <AdvantageStrip
            row={view.advantageRow}
            active={activeIndex}
            round={view.round}
            compact={!wide}
          />
          <TrickTable view={view} names={names} className="lg:flex-1" />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
          <div
            className="w-full max-w-4xl"
            style={{ aspectRatio: LAYOUTS[orientation].aspect, maxHeight: "100%" }}
          >
            <SensoMap
              view={view}
              targets={targets}
              onTarget={handleTarget}
              affectedLabel={(seat) => seatShortLabel(view, seat, names)}
              orientation={orientation}
            />
          </div>
        </div>
      </div>
    </GameScreen>
  );
}
