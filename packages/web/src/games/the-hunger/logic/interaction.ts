import { deciderOf, mandatoryDraws } from "@boardgames/core/games/the-hunger/rules";
import type {
  Action,
  CardId,
  HungerPlayerView,
  PlayCard,
} from "@boardgames/core/games/the-hunger/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MapTarget } from "../components/board/HungerMap";
import { spaceLabel } from "./labels";

/** A choice started but not finished: its source picked, its target not yet. */
export type Pending =
  /** A discard/draw effect or Wiggles, waiting for the card it acts on. */
  | { kind: "card"; source: CardId }
  /** A Discard/Draw token, waiting for the card to discard. */
  | { kind: "token"; token: string }
  /** An Instant Mission waiting for its chest, pile or Familiar. */
  | { kind: "instant"; mission: string }
  /** Hypnosis: pick a Hunt Track card, then where it goes. */
  | { kind: "hypnosis"; card: CardId; pick: CardId | null }
  | null;

export type InstantAction = Extract<Action, { type: "instant" }>;
export type HypnosisAction = Extract<Action, { type: "hypnosis" }>;

/**
 * Everything the board derives from the server's legal actions, shared by
 * every view and the action bar — so a pick started in one view (Hypnosis:
 * the card in the Player view, its target in the Shop) finishes in another.
 */
export function useHungerInteraction({
  view,
  legalActions,
  isMyTurn,
  onAction,
}: {
  view: HungerPlayerView;
  legalActions: readonly Action[];
  isMyTurn: boolean;
  onAction: (action: Action) => void;
}) {
  const [pending, setPending] = useState<Pending>(null);
  const turn = view.current;
  // Usually the turn's Vampire; a Vampire its Nanny pushed while it chooses.
  const activeSeat = turn ? deciderOf(turn) : -1;
  const me = view.players[view.me];
  const myTurn = isMyTurn && activeSeat === view.me;
  const step = myTurn ? turn?.step : undefined;

  const decisionKey = `${view.turn}/${activeSeat}/${turn?.step}/${legalActions.length}`;
  useEffect(() => {
    if (decisionKey) setPending(null);
  }, [decisionKey]);

  const send = useCallback(
    (action: Action | undefined) => {
      if (!action) return;
      setPending(null);
      onAction(action);
    },
    [onAction],
  );

  const find = useCallback(
    (type: Action["type"]) => legalActions.find((a) => a.type === type),
    [legalActions],
  );
  // The server offers Undo only for actions that revealed nothing (core undo.ts).
  const undo = find("undo");

  // Ctrl/Cmd+Z takes back the last undoable action, as the Undo button does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      const undoAction = legalActions.find((x) => x.type === "undo");
      if (!undoAction) return;
      e.preventDefault();
      setPending(null);
      onAction(undoAction);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [legalActions, onAction]);

  // --- Your cards: the playing area while you act, else next turn's hand.
  const playArea: PlayCard[] = me?.playArea ?? [];
  const hand: CardId[] = activeSeat === view.me ? [] : view.hand;

  const resolveActions = useMemo(
    () => legalActions.filter((a) => a.type === "resolve"),
    [legalActions],
  );
  const tokenActions = useMemo(
    () => legalActions.filter((a) => a.type === "use-bonus"),
    [legalActions],
  );
  const usableTokens = useMemo(
    () => new Set(tokenActions.map((a) => (a.type === "use-bonus" ? a.token : ""))),
    [tokenActions],
  );

  const discardTargets = useMemo(() => {
    const out = new Map<CardId, Action>();
    if (!pending) return out;
    for (const a of legalActions) {
      if (
        pending.kind === "card" &&
        a.type === "resolve" &&
        a.card === pending.source &&
        a.discard
      ) {
        out.set(a.discard, a);
      }
      if (
        pending.kind === "card" &&
        a.type === "familiar" &&
        a.card === pending.source &&
        a.target
      ) {
        out.set(a.target, a);
      }
      if (
        pending.kind === "token" &&
        a.type === "use-bonus" &&
        a.token === pending.token &&
        a.discard
      ) {
        out.set(a.discard, a);
      }
    }
    return out;
  }, [pending, legalActions]);

  // Familiars that act by being clicked with a target (Wiggles).
  const targetedFamiliars = useMemo(
    () => new Set(legalActions.flatMap((a) => (a.type === "familiar" && a.target ? [a.card] : []))),
    [legalActions],
  );
  const hypnoses = useMemo(
    () => legalActions.filter((a): a is HypnosisAction => a.type === "hypnosis"),
    [legalActions],
  );
  const hypnosisCards = useMemo(() => new Set(hypnoses.map((a) => a.card)), [hypnoses]);
  const cardsLive =
    step === "manipulate" ||
    (step === "act" && (targetedFamiliars.size > 0 || hypnosisCards.size > 0));

  const clickableCards = useMemo(() => {
    if (!cardsLive) return new Set<CardId>();
    if (pending?.kind === "instant" || pending?.kind === "hypnosis") return new Set<CardId>();
    if (pending) return new Set(discardTargets.keys());
    return new Set([
      ...resolveActions.map((a) => (a.type === "resolve" ? a.card : "")),
      ...targetedFamiliars,
      ...hypnosisCards,
    ]);
  }, [cardsLive, pending, discardTargets, resolveActions, targetedFamiliars, hypnosisCards]);

  const onCard = (card: CardId) => {
    if (!cardsLive || pending?.kind === "instant" || pending?.kind === "hypnosis") return;
    if (pending) {
      if (pending.kind === "card" && pending.source === card) setPending(null);
      else send(discardTargets.get(card));
      return;
    }
    if (targetedFamiliars.has(card)) {
      setPending({ kind: "card", source: card });
      return;
    }
    if (hypnosisCards.has(card)) {
      setPending({ kind: "hypnosis", card, pick: null });
      return;
    }
    const own = resolveActions.filter((a) => a.type === "resolve" && a.card === card);
    const plain = own.find((a) => a.type === "resolve" && !a.discard);
    if (plain) send(plain);
    else if (own.length > 0) setPending({ kind: "card", source: card });
  };

  const onToken = (token: string) => {
    const own = tokenActions.filter((a) => a.type === "use-bonus" && a.token === token);
    const plain = own.find((a) => a.type === "use-bonus" && !a.discard);
    if (plain) send(plain);
    else if (own.length > 0)
      setPending(pending?.kind === "token" ? null : { kind: "token", token });
  };

  // --- Instant Missions: one button per tile; targeted ones arm a pick.
  const instants = useMemo(
    () => legalActions.filter((a): a is InstantAction => a.type === "instant"),
    [legalActions],
  );
  const armed = useMemo(
    () =>
      pending?.kind === "instant" ? instants.filter((a) => a.mission === pending.mission) : [],
    [pending, instants],
  );
  const onInstant = (mission: string) => {
    if (pending?.kind === "instant" && pending.mission === mission) {
      setPending(null);
      return;
    }
    const own = instants.filter((a) => a.mission === mission);
    const [only] = own;
    const targeted = own.some((a) => a.row !== undefined || a.card || a.space);
    if (!targeted && only) send(only);
    else setPending({ kind: "instant", mission });
  };

  // --- Map targets: moves, Mist, pushes, Crypt piles, Treasure Chest.
  const targets: MapTarget[] = useMemo(() => {
    const out = new Map<string, MapTarget>();
    for (const a of legalActions) {
      if (a.type === "inspire") {
        out.set(a.crypt, {
          space: a.crypt,
          label: `Take a Mission from ${spaceLabel(view.options, a.crypt)} (${view.crypts[a.crypt] ?? 0} left)`,
        });
      }
    }
    for (const a of armed) {
      if (a.space) {
        out.set(a.space, {
          space: a.space,
          label: `Take the Bonus token at ${spaceLabel(view.options, a.space)}`,
        });
      }
    }
    for (const a of legalActions) {
      if (a.type === "mist") {
        out.set(a.to, { space: a.to, label: `Mist to ${spaceLabel(view.options, a.to)}` });
      }
    }
    for (const a of legalActions) {
      if (a.type === "move" && !out.has(a.to)) {
        out.set(a.to, {
          space: a.to,
          label: `Move to ${spaceLabel(view.options, a.to)} for ${a.spent} Speed`,
        });
      }
      if (a.type === "push" && a.to) {
        out.set(a.to, { space: a.to, label: `Push to ${spaceLabel(view.options, a.to)}` });
      }
    }
    return [...out.values()];
  }, [legalActions, armed, view.options, view.crypts]);

  const onTarget = (space: string) => {
    const crypt = legalActions.find((a) => a.type === "inspire" && a.crypt === space);
    if (crypt) return send(crypt);
    const chest = armed.find((a) => a.space === space);
    if (chest) return send(chest);
    const mist = legalActions.find((a) => a.type === "mist" && a.to === space);
    const move = legalActions.find((a) => a.type === "move" && a.to === space);
    const push = legalActions.find((a) => a.type === "push" && a.to === space);
    send(mist ?? move ?? push);
  };

  // --- Hunt Track: what a click on a pile or a card does now.
  const trackLegal: Action[] =
    pending?.kind === "hypnosis"
      ? []
      : pending?.kind === "instant"
        ? armed.filter((a) => a.row !== undefined)
        : step === "act"
          ? legalActions.filter((a) => a.type === "hunt")
          : [];
  const hypnosisPickable = useMemo(
    () =>
      pending?.kind === "hypnosis"
        ? new Set(hypnoses.filter((h) => h.card === pending.card).map((h) => h.pick))
        : new Set<CardId>(),
    [pending, hypnoses],
  );
  const onPick = (pick: CardId) => {
    if (pending?.kind === "hypnosis") setPending({ ...pending, pick });
  };

  // "Draw 1 card" (Dee, the Starting Vampire Strength) is not optional.
  const mustDraw = me && step === "manipulate" ? mandatoryDraws(me) : [];

  return {
    view,
    legalActions,
    turn,
    activeSeat,
    me,
    myTurn,
    step,
    pending,
    setPending,
    send,
    find,
    undo,
    playArea,
    hand,
    clickableCards,
    onCard,
    targetedFamiliars,
    usableTokens,
    onToken,
    instants,
    armed,
    onInstant,
    hypnoses,
    hypnosisPickable,
    onPick,
    targets,
    onTarget,
    trackLegal,
    mustDraw,
  };
}

export type HungerInteraction = ReturnType<typeof useHungerInteraction>;
