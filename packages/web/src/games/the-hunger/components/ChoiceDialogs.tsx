import { cardDef } from "@boardgames/core/games/the-hunger/content/cards";
import { missionDef } from "@boardgames/core/games/the-hunger/content/missions";
import { deciderOf } from "@boardgames/core/games/the-hunger/rules";
import type { Action, HungerPlayerView } from "@boardgames/core/games/the-hunger/types";
import { useEffect, useMemo, useState } from "react";
import { Button, CheckRow, Modal, ModalBody, ModalFooter } from "../../../components/ui";
import { CATEGORY_LABEL, vampireName } from "../logic/labels";
import HungerCard from "./HungerCard";

interface Props {
  view: HungerPlayerView;
  legal: readonly Action[];
  onAction: (action: Action) => void;
}

/**
 * The turn's modal decisions: keeping Missions, choosing a Mission stack,
 * placing a Ready card, Digesting a Human. Each one is only ever a choice
 * among the server's legal actions — nothing here builds an action itself.
 * None can be dismissed: the turn waits on the answer.
 */
export default function ChoiceDialogs({ view, legal, onAction }: Props) {
  const step = view.current?.step;
  const mine = view.current && deciderOf(view.current) === view.me && legal.length > 0;
  if (!mine) return null;
  if (step === "nanny") return <NannyPick view={view} legal={legal} onAction={onAction} />;
  if (step === "missions") return <MissionPick view={view} legal={legal} onAction={onAction} />;
  if (step === "ready") return <ReadyPick legal={legal} onAction={onAction} />;
  if (step === "digest") return <DigestPick view={view} legal={legal} onAction={onAction} />;
  return null;
}

const noop = () => {};

function MissionPick({ view, legal, onAction }: Props) {
  const keepSets = useMemo(
    () => legal.flatMap((a) => (a.type === "keep-missions" ? [a] : [])),
    [legal],
  );
  const size = keepSets[0]?.keep.length ?? 1;
  const pool = useMemo(() => [...new Set(keepSets.flatMap((a) => a.keep))].sort(), [keepSets]);
  const [chosen, setChosen] = useState<string[]>([]);
  const poolKey = pool.join(",");
  useEffect(() => {
    if (poolKey !== undefined) setChosen([]);
  }, [poolKey]);

  const match = keepSets.find(
    (a) => a.keep.length === chosen.length && a.keep.every((m) => chosen.includes(m)),
  );
  const toggle = (id: string) =>
    setChosen((c) =>
      c.includes(id) ? c.filter((m) => m !== id) : size === 1 ? [id] : [...c, id].slice(-size),
    );
  const setup = view.phase === "setup";

  return (
    <Modal
      onClose={noop}
      closeOnBackdrop={false}
      closeOnEscape={false}
      hideCloseButton
      size="md"
      eyebrow={setup ? "Before nightfall" : "Crypt"}
      title={size === 1 ? "Keep one Mission" : `Keep ${size} Missions`}
      subheader={
        setup
          ? "The other tile goes back to the box unseen."
          : "Tiles you do not keep go back to the Crypt, face down."
      }
    >
      <ModalBody>
        <div className="flex flex-col gap-1.5">
          {pool.map((id) => {
            const def = missionDef(id);
            const held = view.missions.includes(id);
            return (
              <CheckRow
                key={id}
                checked={chosen.includes(id)}
                onChange={() => toggle(id)}
                title={`${def.name}${held ? " (held)" : ""}${def.instant ? " · Instant" : ""}`}
                description={def.text}
              />
            );
          })}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button disabled={!match} onClick={() => match && onAction(match)}>
          Keep {chosen.length}/{size}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function ReadyPick({ legal, onAction }: Omit<Props, "view">) {
  const first = legal.find((a) => a.type === "ready");
  if (!first || first.type !== "ready") return null;
  const toDeck = legal.find((a) => a.type === "ready" && a.to === "deck");
  const toDiscard = legal.find((a) => a.type === "ready" && a.to === "discard");
  return (
    <Modal
      onClose={noop}
      closeOnBackdrop={false}
      closeOnEscape={false}
      hideCloseButton
      size="xs"
      eyebrow="Ready"
      title={cardDef(first.card).name}
      subheader="Put it on top of your deck to draw it next turn, or in your discard pile."
    >
      <ModalBody>
        <div className="mx-auto w-28">
          <HungerCard card={first.card} />
        </div>
      </ModalBody>
      <ModalFooter>
        {toDiscard && (
          <Button variant="secondary" onClick={() => onAction(toDiscard)}>
            Discard pile
          </Button>
        )}
        {toDeck && <Button onClick={() => onAction(toDeck)}>Top of deck</Button>}
      </ModalFooter>
    </Modal>
  );
}

function NannyPick({ view, legal, onAction }: Props) {
  const pusher = view.current ? view.players[view.current.player] : undefined;
  return (
    <Modal
      onClose={noop}
      closeOnBackdrop={false}
      closeOnEscape={false}
      hideCloseButton
      size="md"
      eyebrow="Nanny"
      title="Discard one of your Permanent cards"
      subheader={`${pusher ? vampireName(pusher.vampire) : "A Vampire"} pushed you, and their Nanny makes you give up a Permanent.`}
    >
      <ModalBody>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {legal.map((a) =>
            a.type === "discard-permanent" ? (
              <Button
                key={a.card}
                variant="plain"
                bleed
                onClick={() => onAction(a)}
                aria-label={`Discard ${cardDef(a.card).name}`}
              >
                <HungerCard card={a.card} />
              </Button>
            ) : null,
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}

function DigestPick({ view, legal, onAction }: Props) {
  const skip = legal.find((a) => a.type === "digest" && a.card === null);
  const cards = legal.flatMap((a) => (a.type === "digest" && a.card ? [a] : []));
  const category = view.current?.digestCategory;
  return (
    <Modal
      onClose={noop}
      closeOnBackdrop={false}
      closeOnEscape={false}
      hideCloseButton
      size="md"
      eyebrow="Digest"
      title={category ? `Digest a ${CATEGORY_LABEL[category]}` : "Digest a card"}
      subheader={
        category
          ? "A Digested Human still scores and counts for Missions, but leaves your deck."
          : "From your playing area or discard pile. It keeps scoring, but leaves your deck."
      }
    >
      <ModalBody>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {cards.map((a) =>
            a.card ? (
              <Button
                key={a.card}
                variant="plain"
                bleed
                onClick={() => onAction(a)}
                aria-label={`Digest ${cardDef(a.card).name}`}
              >
                <HungerCard card={a.card} />
              </Button>
            ) : null,
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        {skip && (
          <Button variant="secondary" onClick={() => onAction(skip)}>
            Keep them
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}
