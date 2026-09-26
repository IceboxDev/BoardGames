import { graphFor } from "@boardgames/core/games/the-hunger/board";
import { cardDef } from "@boardgames/core/games/the-hunger/content/cards";
import { missionDef } from "@boardgames/core/games/the-hunger/content/missions";
import { deciderOf, mandatoryDraws } from "@boardgames/core/games/the-hunger/rules";
import type {
  Action,
  CardId,
  HungerPlayerView,
  PlayCard,
} from "@boardgames/core/games/the-hunger/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActionLog } from "../../../components/action-log";
import { GameScreen, PromptRow } from "../../../components/game-layout";
import { Button, Surface } from "../../../components/ui";
import { useMediaQuery, WIDE_BOARD_QUERY } from "../../../hooks/useMediaQuery";
import { mapHungerLog } from "../log-mapper";
import { cardName, EFFECT_LABEL, seatLabel, spaceLabel } from "../logic/labels";
import { aspectOf } from "./board/geometry";
import HungerMap, { type MapTarget } from "./board/HungerMap";
import ChoiceDialogs from "./ChoiceDialogs";
import HandPanel from "./HandPanel";
import HuntTrack from "./HuntTrack";
import PilePanel from "./PilePanel";
import PlayerRail from "./PlayerRail";

interface Props {
  view: HungerPlayerView;
  legalActions: Action[];
  isMyTurn: boolean;
  isAiThinking: boolean;
  playerNames: readonly (string | null)[];
  onAction: (action: Action) => void;
}

/** A discard/draw effect waiting for the card it will discard. */
type Pending =
  | { kind: "card"; source: CardId }
  | { kind: "token"; token: string }
  /** An Instant Mission waiting for its chest, pile or Familiar. */
  | { kind: "instant"; mission: string }
  /** Hypnosis: pick a Hunt Track card, then where it goes. */
  | { kind: "hypnosis"; card: CardId; pick: CardId | null }
  | null;

type InstantAction = Extract<Action, { type: "instant" }>;
type HypnosisAction = Extract<Action, { type: "hypnosis" }>;

export default function GameBoard({
  view,
  legalActions,
  isMyTurn,
  isAiThinking,
  playerNames,
  onAction,
}: Props) {
  const [pending, setPending] = useState<Pending>(null);
  const wide = useMediaQuery(WIDE_BOARD_QUERY);
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

  const send = useCallback(
    (action: Action | undefined) => {
      if (!action) return;
      setPending(null);
      onAction(action);
    },
    [onAction],
  );

  // --- Fan: my playing area on my turn, otherwise next turn's hand + Permanents.
  const fanCards: PlayCard[] = useMemo(() => {
    if (!me) return [];
    if (activeSeat === view.me) return me.playArea;
    return [...me.playArea, ...view.hand.map((id) => ({ id, resolved: false }))];
  }, [me, activeSeat, view.me, view.hand]);

  const resolveActions = legalActions.filter((a) => a.type === "resolve");
  const tokenActions = legalActions.filter((a) => a.type === "use-bonus");
  const usableTokens = useMemo(
    () => new Set(tokenActions.map((a) => (a.type === "use-bonus" ? a.token : ""))),
    [tokenActions],
  );

  const discardTargets = useMemo(() => {
    if (!pending) return new Map<CardId, Action>();
    const out = new Map<CardId, Action>();
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
  const fanLive =
    step === "manipulate" ||
    (step === "act" && (targetedFamiliars.size > 0 || hypnosisCards.size > 0));

  const clickableCards = useMemo(() => {
    if (!fanLive) return new Set<CardId>();
    if (pending?.kind === "instant" || pending?.kind === "hypnosis") return new Set<CardId>();
    if (pending) return new Set(discardTargets.keys());
    return new Set([
      ...resolveActions.map((a) => (a.type === "resolve" ? a.card : "")),
      ...targetedFamiliars,
      ...hypnosisCards,
    ]);
  }, [fanLive, pending, discardTargets, resolveActions, targetedFamiliars, hypnosisCards]);

  const onCard = (card: CardId) => {
    if (!fanLive || pending?.kind === "instant" || pending?.kind === "hypnosis") return;
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

  // --- Map targets: destinations while moving, landing spots while pushing,
  // chests for Treasure Chest.
  const targets: MapTarget[] = useMemo(() => {
    const out = new Map<string, MapTarget>();
    // Inspiring / Gain 1 Mission: each Crypt's pile is its own target.
    for (const a of legalActions) {
      if (a.type === "inspire") {
        out.set(a.crypt, {
          space: a.crypt,
          label: `Take a Mission from ${spaceLabel(view.options, a.crypt)} (${view.crypts[a.crypt] ?? 0} left)`,
        });
      }
    }
    for (const a of armed) {
      if (a.space)
        out.set(a.space, {
          space: a.space,
          label: `Take the Bonus token at ${spaceLabel(view.options, a.space)}`,
        });
    }
    for (const a of legalActions) {
      if (a.type === "mist")
        out.set(a.to, { space: a.to, label: `Mist to ${spaceLabel(view.options, a.to)}` });
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
    if (crypt) {
      send(crypt);
      return;
    }
    const chest = armed.find((a) => a.space === space);
    if (chest) {
      send(chest);
      return;
    }
    const mist = legalActions.find((a) => a.type === "mist" && a.to === space);
    const move = legalActions.find((a) => a.type === "move" && a.to === space);
    const push = legalActions.find((a) => a.type === "push" && a.to === space);
    send(mist ?? move ?? push);
  };

  const names = playerNames;
  const spicy = fanCards.some((c) => cardDef(c.id).keywords.includes("spicy"));
  const activeLabel = activeSeat >= 0 ? seatLabel(view, activeSeat, names) : "";
  const find = (type: Action["type"]) => legalActions.find((a) => a.type === type);
  // The server offers Undo only for actions that revealed nothing (core undo.ts).
  const undo = find("undo");
  // "Draw 1 card" (Dee, the Starting Vampire Strength) is not optional.
  const mustDraw = me && step === "manipulate" ? mandatoryDraws(me) : [];

  /** Hypnosis: pick a card on the track, then an arrow for where it goes. */
  function hypnosisControls() {
    if (pending?.kind !== "hypnosis") return null;
    const { card, pick } = pending;
    const from = pick ? locate(view.track, pick) : null;
    const moves = hypnoses.filter((a) => a.card === card && a.pick === pick);
    return (
      <>
        <span className="text-xs text-purple-300">
          Hypnosis: {pick ? `move ${cardName(pick)}` : "click a card on the Hunt Track"}
        </span>
        {from &&
          moves.map((a) => (
            <Button
              key={`${a.row}-${a.col}`}
              size="xs"
              variant="tinted"
              tone="purple"
              onClick={() => send(a)}
            >
              {arrow(from, a)}
            </Button>
          ))}
        <Button size="xs" variant="secondary" onClick={() => setPending(null)}>
          Cancel
        </Button>
      </>
    );
  }

  /** Kutya / Ursa: Familiar abilities with no target, one button each. */
  function familiarControls() {
    return legalActions.map((a) =>
      a.type === "familiar" && !a.target ? (
        <Button
          key={a.card}
          size="xs"
          variant="tinted"
          tone="emerald"
          onClick={() => send(a)}
          title={cardDef(a.card).text}
        >
          {cardDef(a.card).activated?.kind === "redraw-hand"
            ? `${cardName(a.card)}: new hand`
            : `${cardName(a.card)}: column-1 Hunt`}
        </Button>
      ) : null,
    );
  }

  function instantControls() {
    if (pending?.kind === "instant") {
      const name = missionDef(pending.mission).name;
      const cards = armed.filter((a) => a.card);
      return (
        <>
          <span className="text-xs text-amber-300">
            {name}:{" "}
            {cards.length > 0
              ? "take which Familiar?"
              : armed.some((a) => a.space)
                ? "click a chest on the map"
                : "click a glowing pile"}
          </span>
          {cards.map((a) => (
            <Button key={a.card} size="xs" variant="tinted" tone="emerald" onClick={() => send(a)}>
              {a.card ? cardName(a.card) : ""}
            </Button>
          ))}
          <Button size="xs" variant="secondary" onClick={() => setPending(null)}>
            Cancel
          </Button>
        </>
      );
    }
    const missions = [...new Set(instants.map((a) => a.mission))];
    return missions.map((m) => (
      <Button
        key={m}
        size="xs"
        variant="tinted"
        tone="amber"
        onClick={() => onInstant(m)}
        title={missionDef(m).text}
      >
        {missionDef(m).name}
        {missionDef(m).instant?.kind === "digest-hand" ? " (skip turn)" : ""}
      </Button>
    ));
  }

  function fanActions() {
    if (view.phase === "setup") {
      return myTurn ? (
        <PromptRow title="Before nightfall" message="choose your starting Mission" />
      ) : (
        <PromptRow title={activeLabel} tone="waiting" pulse message="choosing a Mission…" />
      );
    }
    if (!myTurn || !turn) {
      return (
        <PromptRow
          title={isAiThinking ? `${activeLabel} (AI)` : activeLabel}
          tone="waiting"
          pulse
          message={turn ? stepMessage(turn.step) : "…"}
        />
      );
    }
    switch (turn.step) {
      case "manipulate":
        return (
          <PromptRow
            title="Step 1"
            message={
              pending?.kind === "card" && targetedFamiliars.has(pending.source)
                ? `${cardName(pending.source)}: pick a card to digest with it`
                : pending && pending.kind !== "instant"
                  ? "pick the card to discard"
                  : mustDraw.length > 0
                    ? `${mustDraw.map(cardName).join(" and ")} must draw first — click it`
                    : "resolve draw / discard effects — click a card"
            }
          >
            {pending?.kind === "hypnosis" ? (
              hypnosisControls()
            ) : (
              <>
                {familiarControls()}
                {instantControls()}
              </>
            )}
            {pending && pending.kind !== "instant" && (
              <Button size="xs" variant="secondary" onClick={() => setPending(null)}>
                Cancel
              </Button>
            )}
            <Button
              size="xs"
              variant="success"
              disabled={!find("end-manipulation")}
              title={
                mustDraw.length > 0 ? "A card that says “Draw” must be resolved first" : undefined
              }
              onClick={() => send(find("end-manipulation"))}
            >
              Done
            </Button>
          </PromptRow>
        );
      case "move":
        return (
          <PromptRow
            title={`Speed ${turn.speed}`}
            message={
              spicy
                ? "a Spicy Human drags you toward the nearest Well"
                : `${turn.confused ? "Confused! " : ""}click a glowing space to move`
            }
          >
            {find("stay") && (
              <Button size="xs" variant="secondary" onClick={() => send(find("stay"))}>
                Stay here
              </Button>
            )}
          </PromptRow>
        );
      case "push": {
        const victim = turn.pushQueue[0];
        return (
          <PromptRow
            title="Push"
            message={`${victim === undefined ? "" : seatLabel(view, victim, names)} — click a space`}
          >
            <Button
              size="xs"
              variant="secondary"
              onClick={() => send(legalActions.find((a) => a.type === "push" && a.to === null))}
            >
              Leave them
            </Button>
          </PromptRow>
        );
      }
      case "act": {
        const here = me ? graphFor(view.options).spaces.get(me.pos) : undefined;
        const useSpace = find("space");
        return (
          <PromptRow
            title={`Speed left ${turn.speedLeft}`}
            message={
              legalActions.some((a) => a.type.startsWith("hunt"))
                ? "hunt a pile"
                : "nothing to hunt"
            }
          >
            {useSpace && here && (
              <Button size="xs" variant="tinted" tone="sky" onClick={() => send(useSpace)}>
                {EFFECT_LABEL[here.effect]}
              </Button>
            )}
            {pending?.kind === "hypnosis" ? (
              hypnosisControls()
            ) : (
              <>
                {familiarControls()}
                {instantControls()}
              </>
            )}
            <Button size="xs" variant="success" onClick={() => send(find("end-turn"))}>
              End turn
            </Button>
          </PromptRow>
        );
      }
      case "inspire":
        return (
          <PromptRow title="Take a Mission" message="click a Crypt on the map, or pick its pile">
            {legalActions.map((a) =>
              a.type === "inspire" ? (
                <Button
                  key={a.crypt}
                  size="xs"
                  variant="tinted"
                  tone="amber"
                  onClick={() => send(a)}
                >
                  {spaceLabel(view.options, a.crypt)} · {view.crypts[a.crypt] ?? 0} left
                </Button>
              ) : null,
            )}
          </PromptRow>
        );
      default:
        return <PromptRow title="Your turn" message={stepMessage(turn.step)} />;
    }
  }

  return (
    <GameScreen
      background="bg-surface-950"
      leftSidebarLabel="Night"
      leftSidebar={
        <PlayerRail
          view={view}
          names={names}
          activeSeat={activeSeat}
          usableTokens={usableTokens}
          selectedToken={pending?.kind === "token" ? pending.token : null}
          onToken={onToken}
        />
      }
      sidebar={<ActionLog blocks={mapHungerLog(view.log, view, names)} />}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 lg:flex-row">
        {/* Wide: the map takes what the track leaves and letterboxes inside it.
            Narrow: the map is as wide as the screen and the page scrolls. */}
        <div
          className={wide ? "min-h-0 min-w-0 flex-1" : "w-full"}
          style={wide ? undefined : { aspectRatio: aspectOf(graphFor(view.options).def) }}
        >
          <HungerMap view={view} targets={targets} onTarget={onTarget} activeSeat={activeSeat} />
        </div>
        {/* No hand fan: the controls and your cards sit beside the board so the
            map keeps the full height. */}
        <div className="flex w-full flex-col gap-2 lg:w-80 lg:shrink-0 lg:overflow-y-auto">
          <Surface variant="raised" padding="sm" className="flex flex-col gap-1.5">
            {fanActions()}
            {undo && (
              <div className="flex justify-center">
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => send(undo)}
                  title="Take back your last move, push or choice that revealed nothing (Ctrl+Z)"
                >
                  ↶ Undo
                </Button>
              </div>
            )}
          </Surface>
          <HandPanel
            title={activeSeat === view.me ? "Your playing area" : "Your next hand"}
            cards={fanCards}
            clickable={clickableCards}
            selected={pending?.kind === "card" ? pending.source : null}
            onCard={onCard}
          />
          {me && <PilePanel title="Your discard pile" cards={me.discard} />}
          {me && me.digested.length > 0 && (
            <PilePanel title="Your Digestion zone" cards={me.digested} />
          )}
          <HuntTrack
            pickable={
              pending?.kind === "hypnosis"
                ? new Set(hypnoses.filter((h) => h.card === pending.card).map((h) => h.pick))
                : undefined
            }
            picked={pending?.kind === "hypnosis" ? pending.pick : null}
            onPick={(pick) => pending?.kind === "hypnosis" && setPending({ ...pending, pick })}
            view={view}
            legal={
              pending?.kind === "hypnosis"
                ? []
                : pending?.kind === "instant"
                  ? armed.filter((a) => a.row !== undefined)
                  : step === "act"
                    ? legalActions.filter((a) => a.type !== "instant")
                    : []
            }
            onAction={send}
          />
        </div>
      </div>
      <ChoiceDialogs view={view} legal={legalActions} onAction={send} />
    </GameScreen>
  );
}

function stepMessage(step: string): string {
  switch (step) {
    case "manipulate":
      return "playing cards…";
    case "move":
      return "on the move…";
    case "push":
      return "pushing…";
    case "act":
      return "hunting…";
    case "missions":
    case "inspire":
      return "reading Missions…";
    case "ready":
      return "placing a Ready card…";
    case "digest":
      return "digesting…";
    case "nanny":
      return "giving up a Permanent to the Nanny…";
    default:
      return "…";
  }
}

function locate(
  track: HungerPlayerView["track"],
  card: CardId,
): { row: number; col: number } | null {
  for (let row = 0; row < track.length; row++) {
    for (let col = 0; col < track[row].length; col++) {
      if (track[row][col].includes(card)) return { row, col };
    }
  }
  return null;
}

/** Column 3 is drawn on the left, so a lower column index is further right. */
function arrow(from: { row: number; col: number }, to: { row: number; col: number }): string {
  if (to.row < from.row) return `↑ row ${to.row + 1}`;
  if (to.row > from.row) return `↓ row ${to.row + 1}`;
  return to.col < from.col ? `→ column ${to.col + 1}` : `← column ${to.col + 1}`;
}
