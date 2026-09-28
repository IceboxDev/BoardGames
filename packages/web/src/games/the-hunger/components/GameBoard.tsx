import type { Action, HungerPlayerView } from "@boardgames/core/games/the-hunger/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionLog } from "../../../components/action-log";
import { CardFan } from "../../../components/card-fan";
import { GameScreen } from "../../../components/game-layout";
import { MicroLabel } from "../../../components/ui";
import { useMediaQuery, WIDE_BOARD_QUERY } from "../../../hooks/useMediaQuery";
import { mapHungerLog } from "../log-mapper";
import { attentionFor, VIEWS, type ViewId } from "../logic/attention";
import { useHungerInteraction } from "../logic/interaction";
import ActionBar from "./ActionBar";
import ChoiceDialogs from "./ChoiceDialogs";
import HungerCard from "./HungerCard";
import HuntReveal from "./HuntReveal";
import ViewNavigator from "./ViewNavigator";
import MapView from "./views/MapView";
import OverviewView from "./views/OverviewView";
import PlayerView from "./views/PlayerView";
import ShopView from "./views/ShopView";

interface Props {
  view: HungerPlayerView;
  legalActions: Action[];
  isMyTurn: boolean;
  isAiThinking: boolean;
  playerNames: readonly (string | null)[];
  onAction: (action: Action) => void;
  /** Tests / previews: open on a given view. */
  initialView?: ViewId;
}

const VIEW_KEY = "the-hunger:view";

const FIT = { width: 1900, height: 1000 } as const;

function rememberedView(): ViewId {
  try {
    const v = sessionStorage.getItem(VIEW_KEY);
    return VIEWS.some((x) => x.id === v) ? (v as ViewId) : "map";
  } catch {
    return "map";
  }
}

/**
 * The game as four views — Map, your board, the Hunt, the Overview — chosen
 * from the navigator in the left panel, under one action bar. Every view
 * reads the same interaction state, so a choice can start in one and end in
 * another.
 */
export default function GameBoard({
  view,
  legalActions,
  isMyTurn,
  playerNames,
  onAction,
  initialView,
}: Props) {
  const wide = useMediaQuery(WIDE_BOARD_QUERY);
  const [current, setCurrent] = useState<ViewId>(() => initialView ?? rememberedView());
  const ix = useHungerInteraction({ view, legalActions, isMyTurn, onAction });
  const attention = attentionFor(ix.step, legalActions, ix.pending);

  // Whose board the Player view shows: yours, or any other Vampire's.
  const [boardSeat, setBoardSeat] = useState(() => Math.max(0, view.me));

  const select = useCallback(
    (next: ViewId, seat?: number) => {
      setCurrent(next);
      if (next === "player") setBoardSeat(seat ?? Math.max(0, view.me));
      try {
        sessionStorage.setItem(VIEW_KEY, next);
      } catch {
        // A private window may refuse storage; the view still switches.
      }
    },
    [view.me],
  );

  // Arming a pick takes you to where it is made: clicking Hypnosis means
  // "on the Hunt Track", a pile-targeting Instant the same, a Chest one the map.
  const armed = ix.pending
    ? ix.pending.kind === "hypnosis"
      ? "shop"
      : ix.pending.kind === "token"
        ? "player"
        : ix.pending.kind === "instant"
          ? ix.armed.some((a) => a.space)
            ? "map"
            : ix.armed.some((a) => a.row !== undefined)
              ? "shop"
              : null
          : null
    : null;
  const armedKey = ix.pending ? `${ix.pending.kind}:${armed}` : "";
  const lastArmed = useRef("");
  useEffect(() => {
    if (armedKey === lastArmed.current) return;
    lastArmed.current = armedKey;
    if (armed) select(armed);
  }, [armedKey, armed, select]);

  // Keys 1–3 switch views; 4 and up open the boards.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      const n = Number(e.key);
      if (n >= 4 && n <= 9) {
        // Boards: yours is 4, then the rest of the table in seat order.
        const seats = view.players
          .map((p) => p.index)
          .sort((a, b) => (a === view.me ? -1 : b === view.me ? 1 : a - b));
        const seat = seats[n - 4];
        if (seat !== undefined) select("player", seat);
        return;
      }
      const hit = VIEWS.find((v) => v.key === e.key);
      if (hit) select(hit.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select, view.players, view.me]);

  // Your next hand, fanned under your board while it's in your hand.
  const showHand = current === "player" && boardSeat === view.me && ix.hand.length > 0;

  const log = useMemo(
    () => mapHungerLog(view.log, view, playerNames),
    [view.log, view, playerNames],
  );

  const navigator = (
    <ViewNavigator
      view={view}
      names={playerNames}
      current={current}
      boardSeat={boardSeat}
      activeSeat={ix.activeSeat}
      attention={attention}
      onSelect={select}
      compact={!wide}
    />
  );

  return (
    <GameScreen
      background="bg-surface-950"
      // Designed on a 1900 × 1000 canvas (a 1080p screen under the nav):
      // every screen shows the same map / rails / History proportions.
      fitTo={FIT}
      leftSidebar={wide ? navigator : undefined}
      sidebar={<ActionLog blocks={log} />}
      actionBar={<ActionBar ix={ix} current={current} onGo={select} />}
      fan={
        showHand ? (
          <CardFan
            cards={ix.hand}
            getCardId={(c) => c}
            renderCard={(c) => <HungerCard card={c} />}
            renderPreview={(c) => <HungerCard card={c} variant="showcase" />}
            disabled
          />
        ) : undefined
      }
      fanActions={showHand ? <MicroLabel>Your next hand</MicroLabel> : undefined}
    >
      {!wide && navigator}
      {current === "map" && <MapView ix={ix} />}
      {current === "player" && <PlayerView ix={ix} names={playerNames} seat={boardSeat} />}
      {current === "shop" && <ShopView ix={ix} />}
      {current === "overview" && <OverviewView ix={ix} names={playerNames} />}
      <ChoiceDialogs view={view} legal={legalActions} onAction={ix.send} />
      <HuntReveal view={view} />
    </GameScreen>
  );
}
