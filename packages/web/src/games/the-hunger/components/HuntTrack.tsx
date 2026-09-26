import { cardDef } from "@boardgames/core/games/the-hunger/content/cards";
import { huntCost } from "@boardgames/core/games/the-hunger/rules";
import type { Action, HungerPlayerView } from "@boardgames/core/games/the-hunger/types";
import { Button, MicroLabel, Surface } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import CardLine from "./CardLine";

interface Props {
  view: HungerPlayerView;
  legal: readonly Action[];
  onAction: (action: Action) => void;
  /** Hypnosis: cards that may be picked up, and the one picked. */
  pickable?: ReadonlySet<string>;
  picked?: string | null;
  onPick?: (card: string) => void;
}

/**
 * The Hunt Track: one row per player plus one, three columns. New cards
 * enter column 3 (left, dearest) and slide right each night; column 1
 * piles grow. Every pile is face up — anyone may inspect it.
 */
export default function HuntTrack({ view, legal, onAction, pickable, picked, onPick }: Props) {
  // A pile answers a Hunt, or an armed free-hunt Instant Mission.
  const huntable = (row: number, col: number) =>
    legal.find(
      (a) => (a.type === "hunt" || a.type === "instant") && a.row === row && a.col === col,
    );
  const tavern = legal.find((a) => a.type === "hunt-tavern");
  const roses = legal.filter((a) => a.type === "hunt-rose");

  return (
    <Surface variant="raised" padding="sm" className="flex min-w-0 flex-col gap-2">
      <div className="grid grid-cols-3 gap-1 text-center">
        {[2, 1, 0].map((col) => (
          <MicroLabel key={col}>Col {col + 1}</MicroLabel>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {view.track.map((row, r) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: track rows are fixed board positions
          <div key={r} className="grid grid-cols-3 gap-1">
            {[2, 1, 0].map((col) => {
              const pile = row[col];
              const action = huntable(r, col);
              const fast = pile.some((id) => cardDef(id).keywords.includes("fast"));
              return (
                <PileSlot
                  key={col}
                  pile={pile}
                  cost={pile.length > 0 ? huntCost(pile, col) : col + 1}
                  fast={fast}
                  onHunt={action ? () => onAction(action) : undefined}
                  pickable={pickable}
                  picked={picked}
                  onPick={onPick}
                />
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-4xs text-fg-muted">
        New cards enter column 3 and slide one column along each night; column 1 piles grow. 🐢
        Slow: enters in column 2 · ⚡ Fast: its pile costs +1 · 🌶 Spicy · 😵 Confuse · 💧 Holy Water
        · 👥 Gregarious · ↥ Ready · ∞ Permanent · 📜 Inspiring
      </p>
      <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-2 text-2xs text-fg-secondary">
        <span>
          Tavern: <b className="text-fg-primary">{view.tavernCount}</b> face down
        </span>
        {tavern && (
          <Button size="xs" variant="tinted" tone="amber" onClick={() => onAction(tavern)}>
            Hunt the Tavern (2 Speed)
          </Button>
        )}
      </div>
      {/* The Labyrinth's Roses: each previews on hover, and is a button when you may take it. */}
      <div className="flex flex-col gap-1 border-t border-line-soft pt-2">
        <MicroLabel>
          Labyrinth · {view.roses.length} Rose{view.roses.length === 1 ? "" : "s"}
        </MicroLabel>
        {view.roses.map((rose) => {
          const take = roses.find((a) => a.type === "hunt-rose" && a.card === rose);
          return take ? (
            <Button
              key={rose}
              variant="plain"
              bleed
              onClick={() => onAction(take)}
              aria-label={`Take ${cardDef(rose).name}`}
              className="rounded-ui-md ring-1 ring-amber-300/60"
            >
              <CardLine card={rose} detail />
            </Button>
          ) : (
            <CardLine key={rose} card={rose} detail />
          );
        })}
      </div>
    </Surface>
  );
}

function PileSlot({
  pile,
  cost,
  fast,
  onHunt,
  pickable,
  picked,
  onPick,
}: {
  pile: readonly string[];
  cost: number;
  fast: boolean;
  onHunt?: () => void;
  pickable?: ReadonlySet<string>;
  picked?: string | null;
  onPick?: (card: string) => void;
}) {
  if (pile.length === 0) {
    return <div className="min-h-10 rounded-card-md border border-dashed border-line-soft" />;
  }
  const body = (
    <div className="flex w-full flex-col gap-0.5 p-1 text-left">
      {pile.map((id) =>
        onPick && pickable?.has(id) ? (
          <Button
            key={id}
            variant={picked === id ? "tinted" : "ghost"}
            tone="purple"
            size="xs"
            align="start"
            block
            onClick={() => onPick(id)}
            aria-label={`Hypnotise ${cardDef(id).name}`}
          >
            <CardLine card={id} className="w-full" />
          </Button>
        ) : (
          <CardLine key={id} card={id} />
        ),
      )}
      <div
        className={cn(
          "mt-0.5 text-right text-4xs text-fg-muted",
          fast && "font-bold text-amber-300",
        )}
      >
        {cost} Speed{fast ? " · Fast" : ""}
      </div>
    </div>
  );
  if (!onHunt) {
    return (
      <Surface variant="tile" padding="none">
        {body}
      </Surface>
    );
  }
  return (
    <Button
      variant="tinted"
      tone="emerald"
      bleed
      onClick={onHunt}
      aria-label={`Hunt ${pile.map((id) => cardDef(id).name).join(", ")} for ${cost} Speed`}
    >
      {body}
    </Button>
  );
}
