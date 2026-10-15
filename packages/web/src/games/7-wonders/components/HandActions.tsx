import type { CardId } from "@boardgames/core/games/7-wonders/types";
import { Button, Chip } from "../../../components/ui";
import { STAGE_NUMERAL } from "../card-utils";
import { type BuildPrice, paymentTotal, priceLabel } from "../logic/affordability";
import { crestArt } from "../logic/art";
import type { DraftInteraction } from "../logic/useDraftInteraction";
import CardArt from "./CardArt";
import SevenIcon from "./SevenIcon";

/** The outline each price draws round a hand card. */
const PRICE_RING: Record<BuildPrice["kind"], string> = {
  free: "ring-2 ring-emerald-400",
  chain: "ring-2 ring-emerald-400",
  olympia: "ring-2 ring-emerald-400",
  coins: "ring-2 ring-amber-400",
  none: "ring-2 ring-rose-500",
};

/**
 * A hand card, outlined by what building it costs: green free, amber for a
 * coin price (the coins hang above the card), red when it can't be built —
 * it can still go under the wonder or be sold. A card free only by your
 * Statue of Zeus or by a chain says so above it.
 */
export function HandCard({ ix, cardId }: { ix: DraftInteraction; cardId: CardId }) {
  const opts = ix.options.get(cardId);
  const chosen = ix.chosen === cardId;
  const waiting = ix.chosen !== null && !chosen;
  const price = ix.selectable && opts ? opts.price : null;
  return (
    <div className="relative" title={price ? priceTitle(price) : undefined}>
      {price?.kind === "coins" && (
        <span className="absolute -top-7 left-2 flex items-center gap-1 rounded-full bg-surface-950/90 py-0.5 pl-0.5 pr-2 text-xs font-bold tabular-nums text-amber-200 shadow-lg ring-1 ring-amber-400/70">
          <SevenIcon name="coin" className="h-4 w-4" />
          {price.coins}
        </span>
      )}
      {/* Why a free card is free: your Statue of Zeus, or a chain. */}
      {(price?.kind === "olympia" || price?.kind === "chain") && (
        <span
          className="absolute -top-7 left-2 flex items-center gap-1 rounded-full bg-surface-950/90 py-0.5 pl-0.5 pr-2 text-xs font-bold text-emerald-200 shadow-lg ring-1 ring-emerald-400/70"
          title={
            price.kind === "olympia"
              ? "Free this turn by your Statue of Zeus"
              : "Free — you own the card it chains from"
          }
        >
          {price.kind === "olympia" && crestArt("olympia") ? (
            <img
              src={crestArt("olympia")}
              alt=""
              aria-hidden
              draggable={false}
              className="h-4 w-4 select-none rounded-full"
            />
          ) : (
            <SevenIcon name="chain" className="h-4 w-4" />
          )}
          Free
        </span>
      )}
      <CardArt
        cardId={cardId}
        variant="fan"
        selected={ix.selected === cardId}
        disabled={!ix.selectable && !chosen ? true : waiting}
        className={price ? PRICE_RING[price.kind] : undefined}
        stamp={
          chosen ? (
            <span className="-rotate-12 rounded-ui-md border-2 border-emerald-300 bg-surface-950/80 px-3 py-1 font-fantasy text-sm font-bold uppercase tracking-label text-emerald-200 shadow-glow-emerald">
              Chosen
            </span>
          ) : undefined
        }
      />
    </div>
  );
}

function priceTitle(price: BuildPrice): string {
  switch (price.kind) {
    case "none":
      return `${price.reason} — you can still build a wonder stage with it or sell it`;
    case "coins":
      return `Build for ${price.coins} coin${price.coins === 1 ? "" : "s"} to your neighbours`;
    case "chain":
      return "Free — you own the card it chains from";
    case "olympia":
      return "Free with your Statue of Zeus";
    case "free":
      return "Build it free";
  }
}

/**
 * The row above the fan: buttons and nothing else. Empty until a card is
 * picked up; then what that card can do, each labelled with its price.
 * Guidance lives in tooltips; whose turn it is lives in the left rail.
 */
export default function HandActions({
  ix,
  isGameOver,
  onShowResults,
}: {
  ix: DraftInteraction;
  isGameOver: boolean;
  onShowResults?: () => void;
}) {
  if (isGameOver) {
    return onShowResults ? (
      <Button variant="primary" size="sm" onClick={onShowResults} className="px-8">
        Final results
      </Button>
    ) : null;
  }
  const opts = ix.current;
  if (!ix.selectable || !ix.selected || !opts) return null;

  const me = ix.view.players[ix.myIndex];
  const stage = me ? STAGE_NUMERAL[me.stagesBuilt] : undefined;
  const wonderMin = opts.wonder.length > 0 ? Math.min(...opts.wonder.map(paymentTotal)) : null;

  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        variant="tinted"
        tone="emerald"
        size="xs"
        disabled={opts.play.length === 0}
        onClick={ix.build}
        title={opts.price.kind === "none" ? opts.price.reason : "Build it in your city (B)"}
      >
        Build
        {opts.play.length > 0 && <Price price={opts.price} />}
      </Button>
      <Button
        variant="tinted"
        tone="orange"
        size="xs"
        disabled={opts.wonder.length === 0}
        onClick={ix.wonder}
        title={
          opts.wonder.length > 0
            ? "Tuck it under your next wonder stage (W)"
            : stage
              ? "Can't pay for the next stage"
              : "Every stage is built"
        }
      >
        <SevenIcon name="wonder" className="h-3.5 w-3.5" />
        {stage ? `Stage ${stage}` : "Wonder"}
        {wonderMin !== null && (
          <Price price={wonderMin === 0 ? { kind: "free" } : { kind: "coins", coins: wonderMin }} />
        )}
      </Button>
      {ix.joinOffered && ix.edifice && (
        <Chip
          pressed={ix.participate}
          tone="amber"
          variant="outlined"
          size="sm"
          disabled={!opts.canParticipate}
          onClick={() => ix.setParticipate(!ix.participate)}
          title={
            opts.canParticipate
              ? `Also join ${ix.edifice.card} — pay the Edifice cost with this stage`
              : `Can't also pay to join ${ix.edifice.card}`
          }
        >
          <SevenIcon name="pawn" className="h-3.5 w-3.5" />
          Join {ix.edifice.card}
          {ix.participate ? " ✓" : ""}
        </Chip>
      )}
      <Button
        variant="secondary"
        size="xs"
        disabled={!opts.canDiscard}
        onClick={ix.discard}
        title="Sell it for 3 coins (D)"
      >
        <SevenIcon name="discard" className="h-3.5 w-3.5" />
        Discard
        <span className="inline-flex items-center gap-0.5 text-amber-200">
          +3
          <SevenIcon name="coin" className="h-3.5 w-3.5" />
        </span>
      </Button>
      <Button variant="link" size="xs" onClick={ix.cancel} title="Put it back (Esc)">
        Cancel
      </Button>
    </div>
  );
}

function Price({ price }: { price: BuildPrice }) {
  if (price.kind === "coins") {
    return (
      <span className="inline-flex items-center gap-0.5 text-amber-200">
        · {price.coins}
        <SevenIcon name="coin" className="h-3.5 w-3.5" />
      </span>
    );
  }
  return <span className="opacity-80">· {priceLabel(price)}</span>;
}
