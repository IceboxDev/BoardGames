import type { SevenWondersPlayerView } from "@boardgames/core/games/7-wonders/machine";
import type { CardId, SevenWondersAction, WonderId } from "@boardgames/core/games/7-wonders/types";
import { leftOf, rightOf } from "@boardgames/core/games/7-wonders/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import ActionLog from "../../../components/action-log/ActionLog";
import { CardFan } from "../../../components/card-fan";
import GameScreen from "../../../components/game-layout/GameScreen";
import { useMediaQuery, WIDE_BOARD_QUERY } from "../../../hooks/useMediaQuery";
import { mapSevenWondersLog } from "../log-mapper";
import { SHEET_URL } from "../logic/card-art";
import { attentionFor, navKeys, seatLabels, seatsFrom, type ViewId } from "../logic/table";
import { useDraftInteraction } from "../logic/useDraftInteraction";
import CardArt from "./CardArt";
import CityNavigator from "./CityNavigator";
import DiscardPickerOverlay from "./DiscardPickerOverlay";
import HandActions, { HandCard } from "./HandActions";
import PaymentModal from "./PaymentModal";
import ChainsView from "./views/ChainsView";
import CityView from "./views/CityView";
import EdificeView from "./views/EdificeView";
import OverviewView from "./views/OverviewView";
import TableView from "./views/TableView";
import WarReveal from "./WarReveal";

interface GameBoardProps {
  view: SevenWondersPlayerView;
  myIndex: number;
  legalActions: SevenWondersAction[];
  onAction: (action: SevenWondersAction) => void;
  /** Seat names in seat order (rooms: people's names; solo: You / AI names). */
  seatNames?: readonly string[];
  isGameOver?: boolean;
  onShowResults?: () => void;
  /** Game over: open the results on their own once the last war has been shown. */
  autoShowResults?: boolean;
  /** Tests / the dev lab: open on a given view. */
  initialView?: ViewId;
  /** Dev lab: replay the latest war on mount. */
  replayWar?: boolean;
}

const VIEW_KEY = "7-wonders:view";
const FIT = { width: 1900, height: 1000 } as const;
const VIEWS: readonly ViewId[] = ["city", "table", "overview", "edifice", "chains"];
/**
 * The table under the board: quiet and dark like every other game's, a
 * faint warm lamp-glow from above the only flourish — the cards and boards
 * carry the painting, the background never competes with them.
 */
const TABLE_BACKDROP =
  "radial-gradient(ellipse 70% 55% at 50% 0%, rgb(217 165 32 / 0.07), transparent 70%)";

function rememberedView(): ViewId {
  try {
    const v = sessionStorage.getItem(VIEW_KEY);
    return VIEWS.includes(v as ViewId) ? (v as ViewId) : "city";
  } catch {
    return "city";
  }
}

/**
 * The game as views — your city, any other city, the table, the overview,
 * the Edifice projects — chosen from the navigator in the left panel, above
 * the hand that every card game shares. The hand and its buttons stay put on
 * every view; the views are for looking.
 */
export default function GameBoard({
  view,
  myIndex,
  legalActions,
  onAction,
  seatNames,
  isGameOver = false,
  onShowResults,
  autoShowResults = false,
  initialView,
  replayWar = false,
}: GameBoardProps) {
  const wide = useMediaQuery(WIDE_BOARD_QUERY);
  const ix = useDraftInteraction({ view, myIndex, legalActions, onAction, isGameOver });
  const n = view.playerCount;
  const me = Math.max(0, myIndex);

  // People by name; AI seats (whose names all read "… (AI)") by their wonder.
  const wonders = view.players.map((p) => p.wonderId).join("|");
  const names = useMemo(
    () => seatLabels(wonders.split("|") as WonderId[], myIndex, seatNames),
    [wonders, myIndex, seatNames],
  );

  const [current, setCurrent] = useState<ViewId>(() => {
    const v = initialView ?? rememberedView();
    return v === "edifice" && !view.edifices ? "city" : v;
  });
  const [citySeat, setCitySeat] = useState(me);

  const select = useCallback(
    (next: ViewId, seat?: number) => {
      setCurrent(next);
      if (next === "city") setCitySeat(seat ?? me);
      try {
        sessionStorage.setItem(VIEW_KEY, next);
      } catch {
        // A private window may refuse storage; the view still switches.
      }
    },
    [me],
  );

  // Keys: the rail in order — 1 Table, 2 Overview, 3 Chains, 4 Edifice (when
  // in play), then the cities, yours first (`navKeys`);
  // B / W / D act on the picked-up card, Esc puts it back.
  const { build, wonder, discard, cancel, selected } = ix;
  const choosing = Boolean(ix.paymentPick || ix.halikarnassosMode);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      if (document.querySelector("[role='dialog']")) return;
      const k = e.key.toLowerCase();
      // A choice is waiting (peeked away): Esc belongs to the peek, and the card is spoken for.
      if (choosing && ["escape", "b", "w", "d"].includes(k)) return;
      if (k === "escape" && selected) return cancel();
      if (selected && k === "b") return build();
      if (selected && k === "w") return wonder();
      if (selected && k === "d") return discard();
      const keys = navKeys(Boolean(view.edifices));
      for (const [v, key] of Object.entries(keys.views)) {
        if (k === key) return select(v as ViewId);
      }
      const seats = seatsFrom(myIndex, n);
      const i = seats.findIndex((_, j) => keys.city(j) === k);
      if (i >= 0) select("city", seats[i]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select, myIndex, n, view.edifices, selected, build, wonder, discard, cancel, choosing]);

  // The art sheet, fetched before the first hand needs it.
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = SHEET_URL;
    document.head.appendChild(link);
    return () => link.remove();
  }, []);

  // The final war plays out on the board; a beat after it closes, the count.
  const [warOpen, setWarOpen] = useState(false);
  useEffect(() => {
    if (!isGameOver || !autoShowResults || warOpen || !onShowResults) return;
    const t = setTimeout(onShowResults, 1600);
    return () => clearTimeout(t);
  }, [isGameOver, autoShowResults, warOpen, onShowResults]);

  const attention = attentionFor(view, myIndex, isGameOver);
  const log = useMemo(
    () => mapSevenWondersLog(view.actionLog, myIndex, names),
    [view.actionLog, myIndex, names],
  );

  const navigator = (
    <CityNavigator
      view={view}
      myIndex={myIndex}
      names={names}
      current={current}
      citySeat={citySeat}
      attention={attention}
      onSelect={select}
      compact={!wide}
    />
  );

  return (
    <>
      <GameScreen
        background="bg-surface-950"
        backdrop={TABLE_BACKDROP}
        fitTo={FIT}
        leftSidebar={wide ? navigator : undefined}
        leftSidebarLabel="Cities"
        sidebar={<ActionLog blocks={log} />}
        fan={
          ix.hand.length > 0 ? (
            <CardFan
              cards={ix.hand}
              getCardId={(id: CardId) => id}
              renderCard={(id) => <HandCard ix={ix} cardId={id} />}
              renderPreview={(id) => <CardArt cardId={id} variant="showcase" />}
              onCardClick={(id) => ix.select(id)}
              disabled={!ix.selectable}
            />
          ) : (
            // An empty hand keeps its slot (and the buttons above it): the board never moves.
            <span aria-hidden />
          )
        }
        fanActions={<HandActions ix={ix} isGameOver={isGameOver} onShowResults={onShowResults} />}
      >
        {!wide && navigator}
        {current === "city" && <CityView ix={ix} seat={citySeat} names={names} />}
        {current === "table" && (
          <TableView ix={ix} names={names} onOpen={(seat) => select("city", seat)} />
        )}
        {current === "overview" && (
          <OverviewView ix={ix} names={names} onOpen={(seat) => select("city", seat)} />
        )}
        {current === "edifice" && <EdificeView ix={ix} names={names} />}
        {current === "chains" && <ChainsView ix={ix} />}
      </GameScreen>

      {ix.paymentPick && (
        <PaymentModal
          cardId={ix.paymentPick.cardId}
          intent={ix.paymentPick.intent}
          options={ix.paymentPick.options}
          leftName={names[leftOf(me, n)]}
          rightName={names[rightOf(me, n)]}
          onPick={ix.pay}
          onClose={ix.closePayment}
        />
      )}

      {ix.halikarnassosMode && (
        <DiscardPickerOverlay
          pickActions={ix.discardPicks}
          onPick={onAction}
          onSkip={() => onAction({ type: "skip-pending" })}
        />
      )}

      <WarReveal
        view={view}
        myIndex={myIndex}
        names={names}
        force={replayWar}
        onOpenChange={setWarOpen}
      />
    </>
  );
}
