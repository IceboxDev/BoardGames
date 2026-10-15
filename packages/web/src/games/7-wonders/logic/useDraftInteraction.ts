import type { SevenWondersPlayerView } from "@boardgames/core/games/7-wonders/machine";
import type { CardId, Payment, SevenWondersAction } from "@boardgames/core/games/7-wonders/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type CardOptions, cardOptions, type InnerAction, paymentTotal } from "./affordability";

export interface PaymentPick {
  cardId: CardId;
  intent: "play" | "wonder";
  options: Payment[];
  participate: boolean;
}

/**
 * One turn of the draft, shared by the fan, its buttons and every view:
 * which card is picked up, what it can do, how it is paid for, and what was
 * sent. Babylon's 7th card arrives wrapped in `play-seventh`; it is unwrapped
 * here so the same buttons work, and wrapped again on send.
 */
export function useDraftInteraction({
  view,
  myIndex,
  legalActions,
  onAction,
  isGameOver = false,
}: {
  view: SevenWondersPlayerView;
  myIndex: number;
  legalActions: readonly SevenWondersAction[];
  onAction: (action: SevenWondersAction) => void;
  isGameOver?: boolean;
}) {
  const me = view.me;
  const hand = useMemo(() => me?.hand ?? [], [me?.hand]);
  const pending = view.phase === "pending" ? view.pending : null;
  const pendingMine = pending?.playerIndex === myIndex;
  const babylonMode = !isGameOver && pendingMine && pending?.kind === "babylon-seventh";
  const halikarnassosMode = !isGameOver && pendingMine && pending?.kind === "halikarnassos";
  const canAct = !isGameOver && view.phase === "selecting" && me !== null && !me.hasSelected;
  const selectable = canAct || babylonMode;

  const actions = useMemo<InnerAction[]>(() => {
    if (babylonMode) {
      return legalActions.flatMap((a) => (a.type === "play-seventh" ? [a.action] : []));
    }
    return legalActions.flatMap((a) =>
      a.type === "play-card" || a.type === "build-wonder" || a.type === "discard" ? [a] : [],
    );
  }, [legalActions, babylonMode]);

  const myTableau = view.players[myIndex]?.tableau;
  const options = useMemo(
    () => cardOptions(hand, actions, myTableau ?? []),
    [hand, actions, myTableau],
  );

  const [selected, setSelected] = useState<CardId | null>(null);
  const [participate, setParticipate] = useState(false);
  const [paymentPick, setPaymentPick] = useState<PaymentPick | null>(null);
  // The card you sent this turn — the view only says *that* you picked.
  const [chosen, setChosen] = useState<CardId | null>(null);

  // A new hand (or a card gone from it) clears the pick and the stamp.
  useEffect(() => {
    setSelected((s) => (s && hand.includes(s) ? s : null));
    setChosen((c) => (c && hand.includes(c) ? c : null));
  }, [hand]);
  useEffect(() => {
    if (!selectable) setSelected(null);
  }, [selectable]);
  // The stamp only lasts while you wait for the others.
  useEffect(() => {
    if (!me?.hasSelected && !babylonMode) setChosen(null);
  }, [me?.hasSelected, babylonMode]);

  const send = useCallback(
    (action: InnerAction) => {
      setSelected(null);
      setPaymentPick(null);
      setParticipate(false);
      setChosen(action.cardId);
      onAction(babylonMode ? { type: "play-seventh", action } : action);
    },
    [onAction, babylonMode],
  );

  const current: CardOptions | null = selected ? (options.get(selected) ?? null) : null;

  const edifice = view.edifices?.[view.age - 1];
  const alreadyJoined =
    edifice !== undefined &&
    (view.playerEdifice?.[myIndex]?.participation ?? []).includes(edifice.age);
  const joinOffered = edifice?.status === "project" && !alreadyJoined;

  const commit = useCallback(
    (intent: "play" | "wonder", payments: Payment[]) => {
      if (!selected || payments.length === 0) return;
      const join = intent === "wonder" && participate && (current?.canParticipate ?? false);
      // A way that costs nothing needs no question.
      const free = payments.find((p) => paymentTotal(p) === 0);
      if (payments.length === 1 || free) {
        const payment = free ?? payments[0];
        if (intent === "play") send({ type: "play-card", cardId: selected, payment });
        else if (payment.kind === "resources") {
          send({ type: "build-wonder", cardId: selected, payment, participate: join });
        }
        return;
      }
      setPaymentPick({ cardId: selected, intent, options: payments, participate: join });
    },
    [selected, participate, current, send],
  );

  const build = useCallback(() => commit("play", current?.play ?? []), [commit, current]);
  const wonder = useCallback(() => commit("wonder", current?.wonder ?? []), [commit, current]);
  const discard = useCallback(() => {
    if (selected && current?.canDiscard) send({ type: "discard", cardId: selected });
  }, [selected, current, send]);

  const pay = useCallback(
    (payment: Payment) => {
      if (!paymentPick) return;
      if (paymentPick.intent === "play") {
        send({ type: "play-card", cardId: paymentPick.cardId, payment });
      } else if (payment.kind === "resources") {
        send({
          type: "build-wonder",
          cardId: paymentPick.cardId,
          payment,
          participate: paymentPick.participate,
        });
      }
    },
    [paymentPick, send],
  );

  const select = useCallback(
    (id: CardId | null) => {
      if (!selectable) return;
      setSelected((s) => (s === id ? null : id));
    },
    [selectable],
  );

  return {
    view,
    myIndex,
    hand,
    pending,
    babylonMode,
    halikarnassosMode,
    canAct,
    selectable,
    options,
    selected,
    select,
    current,
    // Stamped only once the server has the pick: a send that never lands
    // (a dropped socket, a game the server lost) leaves the hand live.
    chosen: me?.hasSelected ? chosen : null,
    participate,
    setParticipate,
    joinOffered,
    edifice,
    build,
    wonder,
    discard,
    cancel: () => setSelected(null),
    paymentPick,
    pay,
    closePayment: () => setPaymentPick(null),
    /** Halikarnassos: the discard-pile picks. */
    discardPicks: legalActions.flatMap((a) => (a.type === "pick-discard" ? [a] : [])),
    sendRaw: onAction,
  };
}

export type DraftInteraction = ReturnType<typeof useDraftInteraction>;
