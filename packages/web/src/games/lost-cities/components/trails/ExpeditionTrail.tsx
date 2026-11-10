import { scoreExpedition } from "@boardgames/core/games/lost-cities/scoring";
import type { Card as CardData, ExpeditionColor } from "@boardgames/core/games/lost-cities/types";
import { COLOR_HEX, COLOR_LABELS } from "@boardgames/core/games/lost-cities/types";
import { cn } from "../../../../lib/cn";
import { type ArtName, artUrl, trailArt } from "../../logic/art";
import Card, { CardChip, ExpeditionGlyph } from "../Card";
import type { TrailGeometry } from "./useTrailGeometry";

// One expedition as a column of the board ("Five Trails"): its painting
// behind it, a header with both scores, the opponent's line as a fixed 2 × 6
// log of chips, the discard pile as the camp halfway down, and your line
// growing down toward you in a lane reserved for all twelve cards.

/** The twelve places of a line. */
const SLOTS = Array.from({ length: 12 }, (_, i) => `slot-${i}`);

export interface ExpeditionTrailProps {
  color: ExpeditionColor;
  geo: TrailGeometry;
  mine: CardData[];
  theirs: CardData[];
  discard: CardData[];
  names: { me: string; them: string };
  /** The selected hand card, drawn faded where it would land. */
  ghost?: CardData | null;
  /** The selected hand card belongs to this expedition. */
  focus?: boolean;
  /** You may take the camp's top card now. */
  canTake?: boolean;
  /** This camp's card was just discarded, so it can't be taken back this turn. */
  locked?: boolean;
  onTake?: () => void;
  /** The last card played here this turn: lit until the next move. */
  highlightId?: number;
}

function ScoreValue({ cards }: { cards: CardData[] }) {
  const s = scoreExpedition(cards[0]?.color ?? "yellow", cards);
  if (!s.started) return <b className="text-fg-muted">–</b>;
  return (
    <b className={cn("tabular-nums", s.total < 0 ? "text-rose-400" : "text-emerald-400")}>
      {s.total}
    </b>
  );
}

export default function ExpeditionTrail({
  color,
  geo,
  mine,
  theirs,
  discard,
  names,
  ghost,
  focus = false,
  canTake = false,
  locked = false,
  onTake,
  highlightId,
}: ExpeditionTrailProps) {
  const hex = COLOR_HEX[color];
  const backdrop = trailArt(color);
  const medal = artUrl(`medal-${color}` as ArtName);
  const top = discard[discard.length - 1];
  const campH = Math.round(geo.camp * 1.5);

  return (
    <section
      aria-label={COLOR_LABELS[color]}
      className={cn(
        "relative flex min-w-0 flex-col items-center overflow-hidden rounded-card-lg border bg-surface-950",
        focus ? "border-transparent" : "border-line-soft",
      )}
      style={focus ? { borderColor: `color-mix(in srgb, ${hex} 70%, transparent)` } : undefined}
    >
      {backdrop ? (
        <div
          aria-hidden="true"
          className={cn(
            "absolute inset-0 bg-cover bg-center transition-opacity duration-200",
            focus ? "opacity-50" : "opacity-30",
          )}
          style={{ backgroundImage: `url("${backdrop}")` }}
        />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background: `radial-gradient(120% 70% at 50% 100%, color-mix(in srgb, ${hex} 45%, black), black 75%)`,
          }}
        />
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-surface-950/95 via-surface-950/40 to-surface-950/90"
      />

      <header
        className="relative flex w-full flex-col items-center gap-1 px-1 pb-2 pt-2.5 lg:px-2.5"
        style={{ borderBottom: `1px solid color-mix(in srgb, ${hex} 30%, transparent)` }}
      >
        <div className="flex items-center gap-1.5 font-fantasy text-sm font-semibold uppercase tracking-label text-fg-strong">
          {medal ? (
            <img src={medal} alt="" className="h-5 w-5" draggable={false} />
          ) : (
            <ExpeditionGlyph color={color} className="h-4 w-4" />
          )}
          <span className={geo.narrow ? "sr-only" : undefined}>{COLOR_LABELS[color]}</span>
        </div>
        {geo.narrow ? (
          <div className="flex flex-col items-center font-card text-xs">
            <ScoreValue cards={mine} />
            <span className="text-fg-muted">
              <ScoreValue cards={theirs} />
            </span>
          </div>
        ) : (
          <div className="flex w-full flex-col gap-0.5 font-card text-xs text-fg-secondary">
            {[
              { name: names.me, cards: mine },
              { name: names.them, cards: theirs },
            ].map((row) => (
              <span key={row.name} className="flex min-w-0 items-baseline justify-between gap-2">
                <span className="truncate">{row.name}</span>
                <ScoreValue cards={row.cards} />
              </span>
            ))}
          </div>
        )}
      </header>

      {/* The opponent's line: a fixed log of twelve slots, read left to right. */}
      <div
        className="relative grid gap-0.5 pb-1 pt-2"
        style={{ gridTemplateColumns: `repeat(${geo.logCols}, ${geo.chipW}px)` }}
        title={`${names.them}'s ${COLOR_LABELS[color]} line`}
      >
        {SLOTS.map((slot, i) => {
          const c = theirs[i];
          return c ? (
            <span
              key={c.id}
              className={cn("grid", c.id === highlightId && "rounded ring-2 ring-accent-400")}
            >
              <CardChip card={c} height={geo.chipH} />
            </span>
          ) : (
            <span
              key={slot}
              className="rounded border border-dashed border-line"
              style={{ height: geo.chipH }}
            />
          );
        })}
      </div>

      {/* The camp: this expedition's discard pile. */}
      <div className="relative flex flex-col items-center gap-2.5 py-1">
        {!geo.narrow && (
          <span className="text-3xs font-semibold uppercase tracking-eyebrow text-fg-muted">
            Camp
          </span>
        )}
        {/* biome-ignore lint/correctness/noRestrictedElements: the camp is a game piece you take a card from */}
        <button
          type="button"
          disabled={!canTake}
          onClick={canTake ? onTake : undefined}
          aria-label={
            top
              ? `${COLOR_LABELS[color]} camp: take the ${top.type === "wager" ? "wager" : top.value}`
              : `${COLOR_LABELS[color]} camp is empty`
          }
          className={cn(
            "relative rounded-card-md",
            canTake && "cursor-pointer ring-2 ring-accent-400 shadow-glow-accent",
            locked && "opacity-50",
          )}
          title={locked ? "Just discarded — it can't be taken back this turn" : undefined}
        >
          {top ? (
            <Card card={top} width={geo.camp} />
          ) : (
            <div
              className="grid place-items-center rounded-card-md border-[1.5px] border-dashed"
              style={{
                width: geo.camp,
                height: campH,
                borderColor: `color-mix(in srgb, ${hex} 40%, transparent)`,
              }}
            >
              <ExpeditionGlyph color={color} className="h-1/3 w-1/3 opacity-50" />
            </div>
          )}
          {discard.length > 1 && (
            <span className="absolute -right-2 -top-2 z-raised grid h-5 min-w-5 place-items-center rounded-full border border-line-strong bg-surface-700 px-1 text-3xs font-bold tabular-nums text-fg-strong">
              {discard.length}
            </span>
          )}
        </button>
      </div>

      {/* Your line: twelve places reserved, each card's band showing. */}
      <div
        className="relative mt-1.5 mb-2.5"
        style={{ width: geo.cw, height: geo.laneH }}
        title={`Your ${COLOR_LABELS[color]} line`}
      >
        {mine.map((c, i) => (
          <div key={c.id} className="absolute left-0" style={{ top: i * geo.step, zIndex: i }}>
            <Card card={c} width={geo.cw} glowing={c.id === highlightId} />
          </div>
        ))}
        {ghost && (
          <div className="absolute left-0" style={{ top: mine.length * geo.step, zIndex: 20 }}>
            <Card card={ghost} width={geo.cw} ghost />
          </div>
        )}
        {mine.length === 0 && !ghost && (
          <div
            className="absolute left-0 top-0 grid place-items-center rounded-card-md border-[1.5px] border-dashed"
            style={{
              width: geo.cw,
              height: geo.ch,
              borderColor: `color-mix(in srgb, ${hex} 40%, transparent)`,
            }}
          >
            <ExpeditionGlyph color={color} className="h-1/3 w-1/3 opacity-50" />
          </div>
        )}
      </div>
    </section>
  );
}
