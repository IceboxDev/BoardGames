import { cardDef } from "@boardgames/core/games/the-hunger/content/cards";
import { huntCost } from "@boardgames/core/games/the-hunger/rules";
import type { Action, CardId, Keyword } from "@boardgames/core/games/the-hunger/types";
import { Button, Eyebrow, MicroLabel, Surface } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { artUrl } from "../../logic/art";
import type { HungerInteraction } from "../../logic/interaction";
import { KEYWORDS } from "../../logic/keywords";
import CardBack from "../CardBack";
import CardPreview from "../CardPreview";
import HungerCard from "../HungerCard";
import HungerIcon from "../HungerIcon";

const TURNS = 15;

/**
 * The Hunt Track, full screen: columns drawn 3 → 1 as on the table, every
 * pile fanned out as full cards with its cost, and whether your Speed left
 * reaches it.
 */
export default function ShopView({ ix }: { ix: HungerInteraction }) {
  const { view, trackLegal, send, turn, myTurn } = ix;
  const speedLeft = myTurn && turn?.step === "act" ? turn.speedLeft : null;
  const action = (row: number, col: number): Action | undefined =>
    trackLegal.find(
      (a) => (a.type === "hunt" || a.type === "instant") && a.row === row && a.col === col,
    );

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className="grid shrink-0 grid-cols-3 gap-3 px-1 text-center">
          {[2, 1, 0].map((col) => (
            <div key={col} className="flex flex-col">
              <Eyebrow size="sm">Column {col + 1}</Eyebrow>
              <span className="text-2xs text-fg-muted">
                {col + 1} Speed{col === 0 ? " · piles grow here" : col === 2 ? " · new cards" : ""}
              </span>
            </div>
          ))}
        </div>
        {/* Rows share the height; cards size from their row, so any track fits. */}
        <div
          className="grid min-h-0 flex-1 gap-2 rounded-card-xl"
          style={{
            gridTemplateRows: `repeat(${view.track.length}, minmax(0, 1fr))`,
            ...trackMat(),
          }}
        >
          {view.track.map((row, r) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: track rows are fixed board positions
            <div key={r} className="grid min-h-0 grid-cols-3 gap-3">
              {[2, 1, 0].map((col) => (
                <Pile
                  key={col}
                  cards={row[col]}
                  col={col}
                  speedLeft={speedLeft}
                  action={action(r, col)}
                  onHunt={send}
                  pickable={ix.hypnosisPickable}
                  picked={ix.pending?.kind === "hypnosis" ? ix.pending.pick : null}
                  onPick={ix.onPick}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <TrackGuide
        huntDeckCount={view.huntDeckCount}
        rows={view.track.length}
        night={view.turn}
        onTrack={new Set(view.track.flat(2).flatMap((id) => cardDef(id).keywords))}
      />
    </div>
  );
}

/** The market-stall mat under the Hunt Track, dimmed well below the cards. */
function trackMat() {
  const mat = artUrl("hunt-track-mat");
  return mat
    ? {
        background: `linear-gradient(rgb(10 6 14 / 0.82), rgb(10 6 14 / 0.9)), url(${mat}) center / cover`,
      }
    : undefined;
}

function TrackGuide({
  huntDeckCount,
  rows,
  night,
  onTrack,
}: {
  huntDeckCount: number;
  rows: number;
  night: number;
  onTrack: ReadonlySet<Keyword>;
}) {
  const endOfNight =
    night >= TURNS
      ? "Last night: the track stays as it is."
      : night >= TURNS - 1
        ? "Every card slides one column along and column 1 piles grow. No new cards come for the last night."
        : `Every card slides one column along, column 1 piles grow, and ${rows} new cards fill column 3.`;
  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-3 overflow-y-auto xl:flex">
      <Surface variant="raised" padding="md" className="flex items-center gap-3">
        <CardBack className="h-16 w-12" />
        <div className="flex flex-col">
          <span className="text-xl font-bold tabular-nums text-fg-strong">{huntDeckCount}</span>
          <MicroLabel>Hunt deck</MicroLabel>
        </div>
      </Surface>
      <Surface variant="raised" padding="md" className="flex flex-col gap-1">
        <Eyebrow size="sm">End of the night</Eyebrow>
        <p className="text-2xs leading-snug text-fg-secondary">{endOfNight}</p>
      </Surface>
      <Surface variant="raised" padding="md" className="flex flex-col gap-2">
        <Eyebrow size="sm">Keywords</Eyebrow>
        <dl className="flex flex-col gap-2">
          {KEYWORDS.filter((k) => k.id !== "unique").map((k) => (
            <div key={k.id} className={cn("flex gap-2", !onTrack.has(k.id) && "opacity-50")}>
              <dt className="flex w-5 shrink-0 justify-center pt-0.5" aria-hidden>
                <HungerIcon name={k.icon} className="h-4 w-4 text-fg-strong" fallback={k.glyph} />
              </dt>
              <dd className="text-2xs leading-snug text-fg-secondary">
                <span className="font-semibold text-fg-strong">{k.name}</span> · {k.text}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-3xs text-fg-muted">Lit: on the track now.</p>
      </Surface>
    </aside>
  );
}

function Pile({
  cards,
  col,
  speedLeft,
  action,
  onHunt,
  pickable,
  picked,
  onPick,
}: {
  cards: readonly CardId[];
  col: number;
  speedLeft: number | null;
  action: Action | undefined;
  onHunt: (a: Action) => void;
  pickable: ReadonlySet<CardId>;
  picked: CardId | null;
  onPick: (card: CardId) => void;
}) {
  if (cards.length === 0) {
    return <div className="h-full min-h-0 rounded-card-xl border border-dashed border-line-soft" />;
  }
  const cost = huntCost(cards, col);
  const fast = cards.some((id) => cardDef(id).keywords.includes("fast"));
  const affordable = speedLeft !== null && cost <= speedLeft;
  const names = cards.map((id) => cardDef(id).name).join(", ");

  const fan = (
    <div className="flex min-h-0 min-w-0 flex-1 justify-center p-1">
      {cards.map((id) => {
        const canPick = pickable.has(id);
        const card = (
          <CardPreview card={id} className="h-full">
            <HungerCard
              card={id}
              size="fill-height"
              glowing={canPick}
              selected={picked === id}
              className="shadow-lg"
            />
          </CardPreview>
        );
        return (
          // Wrappers shrink below the card's width, so a long pile overlaps.
          <div key={id} className="relative h-full min-w-6 shrink hover:z-raised">
            {canPick ? (
              <Button
                variant="plain"
                bleed
                onClick={() => onPick(id)}
                aria-label={`Hypnotise ${cardDef(id).name}`}
                className="h-full w-auto"
              >
                {card}
              </Button>
            ) : (
              card
            )}
          </div>
        );
      })}
    </div>
  );

  // The column header gives the cost; only a Fast surcharge needs saying here.
  const chip = fast && (
    <span className="absolute bottom-1.5 right-1.5 z-raised rounded-full bg-amber-500/25 px-2 py-0.5 text-3xs font-semibold text-amber-200 shadow-md">
      <HungerIcon name="icon-fast" className="mr-1 h-3 w-3 align-[-2px]" fallback="⚡" />
      {cost} Speed
    </span>
  );

  const body = (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      {fan}
      {chip}
    </div>
  );

  return action ? (
    <Button
      variant="tinted"
      tone="emerald"
      bleed
      onClick={() => onHunt(action)}
      aria-label={`Hunt ${names} for ${cost} Speed`}
      className="h-full min-h-0 overflow-hidden rounded-card-xl"
    >
      {body}
    </Button>
  ) : (
    <Surface
      variant="tile"
      padding="none"
      className={cn(
        "h-full min-h-0 overflow-hidden",
        speedLeft !== null && !affordable && "opacity-60",
      )}
    >
      {body}
    </Surface>
  );
}
