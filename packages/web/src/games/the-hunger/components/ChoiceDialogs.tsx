import { cardDef } from "@boardgames/core/games/the-hunger/content/cards";
import { missionDef } from "@boardgames/core/games/the-hunger/content/missions";
import { deciderOf } from "@boardgames/core/games/the-hunger/rules";
import type { Action, HungerPlayerView } from "@boardgames/core/games/the-hunger/types";
import { motion } from "framer-motion";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { BoardOverlay, Button } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { CATEGORY_LABEL, vampireName } from "../logic/labels";
import CardPreview from "./CardPreview";
import HungerCard from "./HungerCard";
import MissionTile from "./MissionTile";

interface Props {
  view: HungerPlayerView;
  legal: readonly Action[];
  onAction: (action: Action) => void;
}

/**
 * The turn's decisions that need an answer before play goes on: keeping
 * Missions, placing a Ready card, Digesting, giving up a Permanent to a
 * Nanny. Each floats over the table on a `BoardOverlay`, so the eye in the
 * corner (or Escape) drops it to study the map, the Hunt or any board — the
 * navigator still works — and brings it back. Every choice is one of the
 * server's legal actions; nothing here builds an action itself.
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

/** The shared shell: the overlay, its peek toggle, and a titled panel with its buttons. */
function ChoiceOverlay({
  eyebrow,
  title,
  subtitle,
  children,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <BoardOverlay
      hideLabel="Peek at the table"
      hideIcon="👁"
      showLabel="Back to the choice"
      showIcon="↩"
      backdropClassName="bg-surface-950/80"
      toggleClassName="border-line-strong bg-surface-800 hover:bg-surface-700"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 26 }}
        className="flex max-h-full w-full max-w-modal-full-xl flex-col items-center gap-6 overflow-y-auto py-8"
      >
        <header className="flex flex-col items-center gap-2 text-center">
          <span className="text-3xs font-semibold uppercase tracking-eyebrow text-accent-300">
            {eyebrow}
          </span>
          <h2 className="font-card text-3xl font-semibold text-fg-strong">{title}</h2>
          <p className="max-w-prose text-sm text-fg-secondary">{subtitle}</p>
        </header>
        {children}
        {actions && <div className="flex flex-wrap justify-center gap-3">{actions}</div>}
      </motion.div>
    </BoardOverlay>
  );
}

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
    <ChoiceOverlay
      eyebrow={setup ? "Before nightfall" : "The Crypt"}
      title={size === 1 ? "Keep one Mission" : `Keep ${size} Missions`}
      subtitle={
        setup
          ? "It scores at sunrise, and nobody else sees it. The other tile goes back to the box unseen."
          : "Tiles you do not keep go back to the Crypt, face down."
      }
      actions={
        <Button size="lg" disabled={!match} onClick={() => match && onAction(match)}>
          Keep {chosen.length}/{size}
        </Button>
      }
    >
      <div className="flex w-full flex-wrap justify-center gap-4">
        {pool.map((id) => {
          const picked = chosen.includes(id);
          const held = view.missions.includes(id);
          return (
            <motion.label
              key={id}
              whileHover={{ y: -3 }}
              className={cn(
                "relative w-80 cursor-pointer rounded-card-lg transition",
                picked
                  ? "ring-2 ring-amber-300 shadow-glow-amber"
                  : chosen.length >= size && "opacity-70 hover:opacity-100",
              )}
            >
              {/* biome-ignore lint/correctness/noRestrictedElements: sr-only checkbox; the parchment tile is its visible face */}
              <input
                type="checkbox"
                className="sr-only"
                checked={picked}
                onChange={() => toggle(id)}
                aria-label={`${missionDef(id).name}${held ? " (held)" : ""}`}
              />
              <MissionTile id={id} size="lg" badge={held ? "held" : undefined} className="h-full" />
              {picked && (
                <span
                  aria-hidden
                  className="absolute -right-3 -top-3 flex h-10 w-10 items-center justify-center rounded-full bg-rose-800 text-3xs font-bold uppercase text-rose-50 shadow-lg ring-2 ring-rose-300/60"
                >
                  Keep
                </span>
              )}
            </motion.label>
          );
        })}
      </div>
    </ChoiceOverlay>
  );
}

function CardChoice({
  card,
  label,
  onClick,
}: {
  card: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <CardPreview card={card} className="w-44">
      <Button variant="plain" bleed onClick={onClick} aria-label={label} className="w-full">
        <HungerCard card={card} />
      </Button>
    </CardPreview>
  );
}

function ReadyPick({ legal, onAction }: Omit<Props, "view">) {
  const first = legal.find((a) => a.type === "ready");
  if (!first || first.type !== "ready") return null;
  const toDeck = legal.find((a) => a.type === "ready" && a.to === "deck");
  const toDiscard = legal.find((a) => a.type === "ready" && a.to === "discard");
  return (
    <ChoiceOverlay
      eyebrow="Ready"
      title={cardDef(first.card).name}
      subtitle="Put it on top of your deck to draw it next turn, or in your discard pile."
      actions={
        <>
          {toDiscard && (
            <Button size="lg" variant="secondary" onClick={() => onAction(toDiscard)}>
              Discard pile
            </Button>
          )}
          {toDeck && (
            <Button size="lg" onClick={() => onAction(toDeck)}>
              Top of deck
            </Button>
          )}
        </>
      }
    >
      <div className="w-56">
        <HungerCard card={first.card} />
      </div>
    </ChoiceOverlay>
  );
}

function NannyPick({ view, legal, onAction }: Props) {
  const pusher = view.current ? view.players[view.current.player] : undefined;
  return (
    <ChoiceOverlay
      eyebrow="Nanny"
      title="Give up one Permanent card"
      subtitle={`${pusher ? vampireName(pusher.vampire) : "A Vampire"} pushed you, and their Nanny makes you discard one of your Permanent cards.`}
    >
      <div className="flex flex-wrap justify-center gap-4">
        {legal.map((a) =>
          a.type === "discard-permanent" ? (
            <CardChoice
              key={a.card}
              card={a.card}
              label={`Discard ${cardDef(a.card).name}`}
              onClick={() => onAction(a)}
            />
          ) : null,
        )}
      </div>
    </ChoiceOverlay>
  );
}

function DigestPick({ view, legal, onAction }: Props) {
  const skip = legal.find((a) => a.type === "digest" && a.card === null);
  const cards = legal.flatMap((a) => (a.type === "digest" && a.card ? [a] : []));
  const category = view.current?.digestCategory;
  return (
    <ChoiceOverlay
      eyebrow="Digest"
      title={category ? `Digest a ${CATEGORY_LABEL[category]}` : "Digest a card"}
      subtitle={
        category
          ? "A Digested Human still scores and counts for Missions, but leaves your deck."
          : "From your playing area or discard pile. It keeps scoring, but leaves your deck."
      }
      actions={
        skip && (
          <Button size="lg" variant="secondary" onClick={() => onAction(skip)}>
            Keep them
          </Button>
        )
      }
    >
      <div className="flex flex-wrap justify-center gap-4">
        {cards.map((a) =>
          a.card ? (
            <CardChoice
              key={a.card}
              card={a.card}
              label={`Digest ${cardDef(a.card).name}`}
              onClick={() => onAction(a)}
            />
          ) : null,
        )}
      </div>
    </ChoiceOverlay>
  );
}
