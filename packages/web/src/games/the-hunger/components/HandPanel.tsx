import type { CardId, PlayCard } from "@boardgames/core/games/the-hunger/types";
import { Button, MicroLabel, Surface } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import CardLine from "./CardLine";

interface Props {
  title: string;
  cards: readonly PlayCard[];
  /** Cards that do something when clicked right now (they glow). */
  clickable: ReadonlySet<CardId>;
  /** The card picked as a discard/digest source. */
  selected: CardId | null;
  onCard: (card: CardId) => void;
}

/**
 * Your cards, as a list beside the board instead of a fan under it, so the
 * map keeps the full height. Clicking works as on a fan: a draw card
 * resolves, a discard effect or Wiggles arms, then the next click is its
 * target.
 */
export default function HandPanel({ title, cards, clickable, selected, onCard }: Props) {
  return (
    <Surface variant="raised" padding="sm" className="flex min-w-0 flex-col gap-1">
      <MicroLabel>{title}</MicroLabel>
      {cards.length === 0 && <span className="text-3xs text-fg-muted">No cards</span>}
      {cards.map((c) =>
        clickable.has(c.id) ? (
          <Button
            key={c.id}
            variant="plain"
            bleed
            onClick={() => onCard(c.id)}
            className={cn(
              "rounded-ui-md",
              selected === c.id ? "ring-2 ring-amber-300" : "ring-1 ring-amber-300/50",
            )}
          >
            <CardLine card={c.id} detail className={cn(c.resolved && "opacity-60")} />
          </Button>
        ) : (
          <CardLine key={c.id} card={c.id} detail className={cn(c.resolved && "opacity-60")} />
        ),
      )}
    </Surface>
  );
}
