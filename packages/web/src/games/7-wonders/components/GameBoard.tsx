import type { SevenWondersPlayerView } from "@boardgames/core/games/7-wonders/machine";
import type {
  CardId,
  LogEntry,
  Payment,
  SevenWondersAction,
} from "@boardgames/core/games/7-wonders/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import ActionLog from "../../../components/action-log/ActionLog";
import { CardFan } from "../../../components/card-fan";
import GameScreen from "../../../components/game-layout/GameScreen";
import { Button } from "../../../components/ui";
import { AGE_LABEL, SCIENCE_GLYPH } from "../card-utils";
import { mapSevenWondersLog } from "../log-mapper";
import { CardFaceHand } from "./CardFace";
import DiscardPickerOverlay from "./DiscardPickerOverlay";
import MilitaryBanner from "./MilitaryBanner";
import PaymentModal from "./PaymentModal";
import PlayerPanel from "./PlayerPanel";
import TableauDisplay from "./TableauDisplay";
import WonderBoard from "./WonderBoard";

type InnerAction =
  | { type: "play-card"; cardId: CardId; payment: Payment }
  | {
      type: "build-wonder";
      cardId: CardId;
      payment: { kind: "resources"; left: number; right: number };
    }
  | { type: "discard"; cardId: CardId };

interface GameBoardProps {
  view: SevenWondersPlayerView;
  myIndex: number;
  legalActions: SevenWondersAction[];
  onAction: (action: SevenWondersAction) => void;
  isGameOver?: boolean;
  onShowResults?: () => void;
}

export default function GameBoard({
  view,
  myIndex,
  legalActions,
  onAction,
  isGameOver,
  onShowResults,
}: GameBoardProps) {
  const [selectedCardId, setSelectedCardId] = useState<CardId | null>(null);
  const [paymentPick, setPaymentPick] = useState<{
    cardId: CardId;
    intent: "play" | "wonder";
    options: Payment[];
  } | null>(null);

  const me = view.me;
  const myBoard = view.players[myIndex];
  const n = view.playerCount;

  const pending = view.phase === "pending" ? view.pending : null;
  const pendingMine = pending?.playerIndex === myIndex;
  const babylonMode = pendingMine && pending?.kind === "babylon-seventh";
  const halikarnassosMode = pendingMine && pending?.kind === "halikarnassos";
  const canAct = !isGameOver && view.phase === "selecting" && me !== null && !me.hasSelected;

  const labelFor = useCallback((i: number) => (i === myIndex ? "You" : `P${i + 1}`), [myIndex]);

  // During the Babylon 7th-card pick, legal actions arrive wrapped in
  // play-seventh — unwrap for the shared button flow and re-wrap on send.
  const effectiveActions = useMemo<InnerAction[]>(() => {
    if (babylonMode) {
      return legalActions.flatMap((a) => (a.type === "play-seventh" ? [a.action] : []));
    }
    return legalActions.flatMap((a) =>
      a.type === "play-card" || a.type === "build-wonder" || a.type === "discard" ? [a] : [],
    );
  }, [legalActions, babylonMode]);

  const sendInner = useCallback(
    (action: InnerAction) => {
      setSelectedCardId(null);
      setPaymentPick(null);
      onAction(babylonMode ? { type: "play-seventh", action } : action);
    },
    [onAction, babylonMode],
  );

  // Clear a stale selection when the hand rotates.
  const hand = me?.hand ?? [];
  useEffect(() => {
    if (selectedCardId && !hand.includes(selectedCardId)) setSelectedCardId(null);
  }, [hand, selectedCardId]);

  // Surface each new end-of-age military resolution once.
  const militaryEntries = useMemo(
    () =>
      view.actionLog.filter(
        (e): e is Extract<LogEntry, { type: "military" }> => e.type === "military",
      ),
    [view.actionLog],
  );
  const [seenMilitary, setSeenMilitary] = useState(() => militaryEntries.length);
  useEffect(() => {
    if (militaryEntries.length <= seenMilitary) return;
    const timer = setTimeout(() => setSeenMilitary(militaryEntries.length), 6000);
    return () => clearTimeout(timer);
  }, [militaryEntries.length, seenMilitary]);
  const bannerEntry =
    militaryEntries.length > seenMilitary ? militaryEntries[militaryEntries.length - 1] : null;

  const selectable = canAct || babylonMode;
  const playOptions = selectedCardId
    ? effectiveActions.flatMap((a) =>
        a.type === "play-card" && a.cardId === selectedCardId ? [a.payment] : [],
      )
    : [];
  const wonderOptions = selectedCardId
    ? effectiveActions.flatMap((a) =>
        a.type === "build-wonder" && a.cardId === selectedCardId ? [a.payment] : [],
      )
    : [];
  const canDiscard = selectedCardId
    ? effectiveActions.some((a) => a.type === "discard" && a.cardId === selectedCardId)
    : false;

  const pickWithOptions = (intent: "play" | "wonder", options: Payment[]) => {
    if (!selectedCardId) return;
    if (options.length === 1) {
      const payment = options[0];
      if (intent === "play") {
        sendInner({ type: "play-card", cardId: selectedCardId, payment });
      } else if (payment.kind === "resources") {
        sendInner({ type: "build-wonder", cardId: selectedCardId, payment });
      }
      return;
    }
    setPaymentPick({ cardId: selectedCardId, intent, options });
  };

  const opponents = Array.from({ length: n - 1 }, (_, k) => {
    const idx = (myIndex + 1 + k) % n;
    const neighborSide = k === 0 ? ("left" as const) : k === n - 2 ? ("right" as const) : undefined;
    return { idx, neighborSide };
  });

  const statusText = isGameOver
    ? "Game over"
    : halikarnassosMode
      ? "Pick a card from the discard pile"
      : babylonMode
        ? "Play your 7th card (Babylon)"
        : pending && !pendingMine
          ? `${labelFor(pending.playerIndex)} is resolving ${
              pending.kind === "halikarnassos" ? "Halikarnassos" : "Babylon"
            }…`
          : view.phase === "revealing"
            ? "Revealing…"
            : me?.hasSelected
              ? "Waiting for the other players…"
              : "Select a card from your hand";

  return (
    <>
      <GameScreen
        sidebar={<ActionLog blocks={mapSevenWondersLog(view.actionLog, myIndex)} />}
        leftSidebar={
          <div className="flex flex-col gap-2 text-xs text-fg-secondary">
            <p className="text-sm font-bold text-fg-primary">
              {AGE_LABEL[view.age]} · Turn {view.turn}/6
            </p>
            {myBoard && (
              <>
                <p>🪙 {myBoard.coins} coins</p>
                <p>🛡️ {myBoard.shields} shields</p>
                <p>
                  ⚔️ tokens:{" "}
                  {myBoard.militaryTokens.length === 0
                    ? "none"
                    : myBoard.militaryTokens.map((t) => (t > 0 ? `+${t}` : `${t}`)).join(" ")}
                </p>
                <p>
                  {(Object.keys(SCIENCE_GLYPH) as Array<keyof typeof SCIENCE_GLYPH>)
                    .map((s) => `${SCIENCE_GLYPH[s]}${myBoard.scienceCounts[s]}`)
                    .join(" ")}
                  {myBoard.scienceWildcards > 0 ? ` ❓${myBoard.scienceWildcards}` : ""}
                </p>
              </>
            )}
            <p>🗑️ discard: {view.discardCount}</p>
          </div>
        }
        leftSidebarTitle="Status"
        fan={
          hand.length > 0 ? (
            <CardFan
              cards={hand}
              getCardId={(id) => id}
              renderCard={(id) => (
                <CardFaceHand cardId={id} selected={id === selectedCardId} disabled={!selectable} />
              )}
              renderPreview={(id) => <CardFaceHand cardId={id} />}
              onCardClick={(id) => selectable && setSelectedCardId(id)}
              disabled={!selectable}
            />
          ) : undefined
        }
        fanActions={
          <div className="flex items-center justify-center gap-2">
            {isGameOver && onShowResults ? (
              <Button
                variant="tinted"
                tone="orange"
                size="md"
                onClick={onShowResults}
                className="px-8"
              >
                View Final Results
              </Button>
            ) : selectable && selectedCardId ? (
              <>
                <Button
                  variant="tinted"
                  tone="emerald"
                  size="xs"
                  disabled={playOptions.length === 0}
                  onClick={() => pickWithOptions("play", playOptions)}
                >
                  Build
                </Button>
                <Button
                  variant="tinted"
                  tone="orange"
                  size="xs"
                  disabled={wonderOptions.length === 0}
                  onClick={() => pickWithOptions("wonder", wonderOptions)}
                >
                  Wonder stage
                </Button>
                <Button
                  variant="secondary"
                  size="xs"
                  disabled={!canDiscard}
                  onClick={() =>
                    selectedCardId && sendInner({ type: "discard", cardId: selectedCardId })
                  }
                >
                  Discard +3🪙
                </Button>
                <Button variant="link" size="xs" onClick={() => setSelectedCardId(null)}>
                  Cancel
                </Button>
              </>
            ) : (
              <span className="text-sm text-fg-secondary">{statusText}</span>
            )}
          </div>
        }
      >
        <div className="flex flex-wrap gap-2">
          {opponents.map(({ idx, neighborSide }) => (
            <PlayerPanel
              key={idx}
              player={view.players[idx]}
              label={`P${idx + 1}`}
              neighborSide={n > 2 ? neighborSide : undefined}
              isSelecting={view.phase === "selecting"}
            />
          ))}
        </div>
        {myBoard && (
          <div className="mt-auto rounded-lg border border-white/10 bg-surface-900/70 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-fg-primary">Your city</span>
              {view.phase === "selecting" && me?.hasSelected && (
                <span className="text-xs text-emerald-400">✓ picked</span>
              )}
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="min-w-64 flex-1">
                <WonderBoard player={myBoard} />
              </div>
              <div className="min-w-56 flex-[2]">
                <TableauDisplay tableau={myBoard.tableau} />
              </div>
            </div>
          </div>
        )}
      </GameScreen>

      {paymentPick && (
        <PaymentModal
          cardId={paymentPick.cardId}
          intent={paymentPick.intent}
          options={paymentPick.options}
          onPick={(payment) => {
            if (paymentPick.intent === "play") {
              sendInner({ type: "play-card", cardId: paymentPick.cardId, payment });
            } else if (payment.kind === "resources") {
              sendInner({ type: "build-wonder", cardId: paymentPick.cardId, payment });
            }
          }}
          onClose={() => setPaymentPick(null)}
        />
      )}

      {halikarnassosMode && (
        <DiscardPickerOverlay
          pickActions={legalActions.flatMap((a) => (a.type === "pick-discard" ? [a] : []))}
          onPick={onAction}
          onSkip={() => onAction({ type: "skip-pending" })}
        />
      )}

      {bannerEntry && (
        <MilitaryBanner
          entry={bannerEntry}
          labelFor={labelFor}
          onDismiss={() => setSeenMilitary(militaryEntries.length)}
        />
      )}
    </>
  );
}
