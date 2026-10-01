import { formatTimelineDate } from "@boardgames/core/games/quiztopia/timeline";
import { gapLabel } from "@boardgames/core/games/quiztopia/timeline-blocks";
import { type CSSProperties, memo } from "react";
import { MinusIcon, PlusIcon } from "../../../../components/icons";
import { IconButton, MicroLabel } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { districtByN } from "../../bands";
import type { LaidOutBlock, LaidOutGap, TimelineLayout } from "../../logic/timeline-layout";
import { BuildingGlyph } from "../common/BuildingGlyph";
import { blockDomId, DOT_OFFSET, pinDomId } from "./dom-ids";
import { chainLabel, chainTitle } from "./era-copy";
import { BAR, BAR_ACTIVE, CARD_EDGE, DATE_INK, DOT_FILL, DOT_RING } from "./tones";

// The river: time flows down a central axis (≥ lg) or a left-hand one
// (phones), cut into the layout's blocks — millennia, and wherever pins
// crowd, their centuries, decades, years and months. Each block has a
// header naming it (with split / fold controls), quiet stretches shrink to
// a one-line gap, and a folded block is one summary row. Each pin is a dot
// on the axis with its card beside it; lifespans / wars / reigns run as bars
// in a narrow gutter lane along the axis. Everything is absolutely
// positioned from the pure layout; this component only turns numbers into
// boxes.

const LANE_W = 6;
const CARD_GAP = 14;

export type OverrideChange = (blockId: string, value: "split" | "fold" | null) => void;

type Props = {
  layout: TimelineLayout;
  wide: boolean;
  lang: "en" | "de";
  cardHeight: number;
  focusId: string | null;
  onSelect: (questionId: string) => void;
  onOverride: OverrideChange;
};

function TimelineRiverImpl({
  layout,
  wide,
  lang,
  cardHeight,
  focusId,
  onSelect,
  onOverride,
}: Props) {
  const lanes = Math.max(1, layout.lanes);
  const gutter = lanes * LANE_W + 6;
  // Axis x as a CSS length; lanes and cards hang off it.
  const axis = wide ? "50%" : `${gutter + 6}px`;
  const laneX = (lane: number) =>
    wide
      ? `calc(50% + ${(lane - (lanes - 1) / 2) * LANE_W}px)`
      : `${6 + lane * LANE_W + LANE_W / 2}px`;
  const cardBox = (side: "left" | "right"): CSSProperties =>
    wide
      ? side === "left"
        ? { left: 0, width: `calc(50% - ${gutter / 2 + CARD_GAP}px)` }
        : { left: `calc(50% + ${gutter / 2 + CARD_GAP}px)`, right: 0 }
      : { left: `${gutter + 6 + CARD_GAP}px`, right: 0 };
  const textLeft = wide ? undefined : { left: `${gutter + 6 + CARD_GAP}px` };

  const focusSpan = layout.spans.find((s) => s.item.questionId === focusId);
  let topIndex = 0;

  return (
    <div className="relative" style={{ height: layout.height }}>
      {/* Blocks and quiet gaps */}
      {layout.blocks.map((b) =>
        b.kind === "gap" ? (
          <GapBand key={`gap-${b.gap.from}`} gap={b} lang={lang} wide={wide} textLeft={textLeft} />
        ) : (
          <BlockBand
            key={b.id}
            block={b}
            lang={lang}
            wide={wide}
            textLeft={textLeft}
            shaded={b.depth === 0 && topIndex++ % 2 === 0}
            onOverride={onOverride}
          />
        ),
      )}

      {/* Axis */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 w-px -translate-x-1/2 bg-gradient-to-b from-line via-line-strong to-line"
        style={{ left: axis }}
      />

      {/* Interval bars */}
      {layout.spans.map((s) => {
        const d = districtByN(s.item.n);
        const active = s === focusSpan;
        return (
          <div
            key={`bar-${s.item.questionId}`}
            aria-hidden="true"
            className={cn(
              "absolute w-1 -translate-x-1/2 rounded-full transition-[top,height] duration-300 motion-reduce:transition-none",
              active ? BAR_ACTIVE[d.tone] : BAR[d.tone],
              !s.item.known && !active && "opacity-60",
            )}
            style={{ left: laneX(s.lane), top: s.y0, height: s.y1 - s.y0 }}
          />
        );
      })}

      {/* Pins */}
      {layout.items.map(({ item, y, cardY, side }) => {
        const d = districtByN(item.n);
        const focused = item.questionId === focusId;
        const label = lang === "de" ? item.event.labelDe : item.event.labelEn;
        const date = formatTimelineDate(item.event, lang);
        return (
          <div key={item.questionId}>
            <Connector
              y={y}
              cardY={cardY}
              style={
                wide
                  ? side === "left"
                    ? {
                        left: `calc(50% - ${gutter / 2 + CARD_GAP}px)`,
                        width: CARD_GAP + gutter / 2,
                      }
                    : { left: "50%", width: CARD_GAP + gutter / 2 }
                  : { left: axis, width: CARD_GAP }
              }
              fromRight={wide && side === "left"}
            />
            <span
              aria-hidden="true"
              className={cn(
                "absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-[top] duration-300 motion-reduce:transition-none",
                item.known ? DOT_FILL[d.tone] : DOT_RING[d.tone],
                focused && "scale-150",
              )}
              style={{ top: y, left: axis }}
            >
              {focused && (
                <span
                  className={cn(
                    "absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping",
                    DOT_FILL[d.tone],
                  )}
                />
              )}
            </span>
            {/* biome-ignore lint/correctness/noRestrictedElements: an absolutely positioned map pin, not a button-shaped control */}
            <button
              type="button"
              id={pinDomId(item.questionId)}
              onClick={() => onSelect(item.questionId)}
              aria-pressed={focused}
              lang={lang}
              title={`${date} — ${label}`}
              className={cn(
                "group absolute flex scroll-my-32 flex-col justify-center gap-0.5 overflow-hidden rounded-card-md border border-l-4 px-2.5 text-left transition-[top,box-shadow,background-color] duration-300 motion-reduce:transition-none",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/70",
                CARD_EDGE[d.tone],
                item.known
                  ? "border-line bg-surface-900/80 hover:bg-surface-800"
                  : "border-dashed border-line-strong bg-surface-950/80 hover:bg-surface-900",
                focused && "ring-2 ring-accent-400/70 shadow-glow-accent",
              )}
              style={{ top: cardY - DOT_OFFSET, height: cardHeight - 8, ...cardBox(side) }}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <BuildingGlyph name={d.building} lit={item.known} size={11} />
                <span
                  className={cn("truncate text-2xs font-semibold tabular-nums", DATE_INK[d.tone])}
                >
                  {date}
                </span>
                {!item.known && (
                  <span className="ml-auto shrink-0 text-3xs text-fg-muted">
                    {lang === "de" ? "lernt noch" : "learning"}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "line-clamp-2 text-xs leading-snug",
                  item.known ? "text-fg-primary" : "text-fg-secondary",
                )}
              >
                {label}
              </span>
            </button>
          </div>
        );
      })}

      {/* Present-day marker: drawn over everything, usually in the river's
          own end cap below the last card. */}
      {layout.nowY !== null && (
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute z-raised flex -translate-y-1/2 items-center",
            wide ? "-translate-x-1/2" : "-translate-x-3",
          )}
          style={{ top: layout.nowY, left: axis }}
        >
          <span className="flex items-center gap-1.5 rounded-full border border-accent-400/60 bg-surface-950 px-2 py-0.5 shadow-glow-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
            <MicroLabel className="text-accent-300">{lang === "de" ? "Heute" : "Today"}</MicroLabel>
          </span>
        </div>
      )}
    </div>
  );
}

export const TimelineRiver = memo(TimelineRiverImpl);

/**
 * The line from a dot on the axis to its card: straight when the card sits
 * level with its dot, an S-curve when neighbours pushed the card away.
 */
function Connector({
  y,
  cardY,
  style,
  fromRight,
}: {
  y: number;
  cardY: number;
  style: CSSProperties;
  /** The axis is on the box's right (a left-hand card). */
  fromRight: boolean;
}) {
  const top = Math.min(y, cardY) - 1;
  const h = Math.abs(cardY - y) + 2;
  // viewBox units: x 0..100 across the box, y 0..h px.
  const [x0, x1] = fromRight ? [100, 0] : [0, 100];
  const y0 = y - top;
  const y1 = cardY - top;
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute overflow-visible text-line-strong transition-[top,height] duration-300 motion-reduce:transition-none"
      style={{ ...style, top, height: h }}
      viewBox={`0 0 100 ${h}`}
      preserveAspectRatio="none"
    >
      <path
        d={`M ${x0} ${y0} C 50 ${y0} 50 ${y1} ${x1} ${y1}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** A block's band: its header row (or, folded, its one summary row). */
function BlockBand({
  block: b,
  lang,
  wide,
  textLeft,
  shaded,
  onOverride,
}: {
  block: LaidOutBlock;
  lang: "en" | "de";
  wide: boolean;
  textLeft: CSSProperties | undefined;
  shaded: boolean;
  onOverride: OverrideChange;
}) {
  const de = lang === "de";
  const label = chainLabel(b.chain, lang);
  const title = chainTitle(b.chain, lang);
  const pinned = de
    ? `${b.count} ${b.count === 1 ? "Moment" : "Momente"}`
    : `${b.count} ${b.count === 1 ? "moment" : "moments"}`;
  const top = b.depth === 0;

  if (b.mode === "folded") {
    return (
      <section
        id={blockDomId(b.id)}
        data-depth={b.depth}
        aria-label={`${label}, ${pinned}`}
        className={cn("absolute inset-x-0 scroll-mt-24", top && "border-t border-line-soft")}
        style={{ top: b.y, height: b.bottom - b.y }}
      >
        {/* biome-ignore lint/correctness/noRestrictedElements: a folded band's whole row is its unfold control */}
        <button
          type="button"
          onClick={() => onOverride(b.id, null)}
          aria-expanded={false}
          title={de ? "Aufklappen" : "Unfold"}
          className={cn(
            "absolute inset-y-1.5 flex items-center gap-2 rounded-card-md border border-dashed border-line-strong bg-surface-900/90 px-2.5 text-left transition-colors hover:bg-surface-800",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60",
            wide ? "left-1/2 w-full max-w-lg -translate-x-1/2" : "right-0",
          )}
          style={textLeft}
        >
          <PlusIcon className="h-3 w-3 shrink-0 text-fg-muted" />
          <span className="shrink-0 whitespace-nowrap text-2xs font-semibold text-fg-strong">
            {label}
          </span>
          {title && <span className="min-w-0 truncate text-2xs text-fg-muted">{title}</span>}
          <span aria-hidden="true" className="relative ml-auto h-2.5 w-20 shrink-0 sm:w-32">
            <span className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
            {b.strip.map(({ at, item }) => (
              <span
                key={item.questionId}
                className={cn(
                  "absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border",
                  item.known
                    ? DOT_FILL[districtByN(item.n).tone]
                    : DOT_RING[districtByN(item.n).tone],
                )}
                style={{ left: `${at * 100}%` }}
              />
            ))}
          </span>
          <span className="shrink-0 text-3xs tabular-nums text-fg-muted">{b.count}</span>
        </button>
      </section>
    );
  }

  return (
    <section
      id={blockDomId(b.id)}
      data-depth={b.depth}
      aria-label={`${label}${title ? ` — ${title}` : ""}, ${pinned}`}
      className={cn(
        "absolute inset-x-0 scroll-mt-24",
        top ? "border-t border-line-soft" : "border-t border-dashed border-line-soft",
        shaded && "bg-fill-soft",
      )}
      style={{ top: b.y, height: b.bottom - b.y }}
    >
      {!top && (
        // The nesting bracket: one short tick per level at the band's edge.
        <span
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-line"
          style={{ left: (b.depth - 1) * 4 }}
        />
      )}
      <div
        className={cn(
          // Opaque, so the axis and bars pass behind the words.
          "absolute flex max-w-full min-w-0 items-center gap-1.5 rounded-full bg-surface-950 pr-1",
          top ? "top-2" : "top-1.5",
          wide ? "left-1/2 -translate-x-1/2 justify-center" : "right-0",
        )}
        style={textLeft}
      >
        <span
          className={cn(
            "min-w-0 truncate whitespace-nowrap rounded-full border bg-surface-950",
            top
              ? "border-line px-2.5 py-0.5 text-2xs font-semibold text-fg-strong"
              : b.depth === 1
                ? "border-line-soft px-2 py-px text-2xs font-semibold text-fg-primary"
                : "border-line-soft px-1.5 py-px text-3xs font-semibold text-fg-secondary",
          )}
        >
          {label}
        </span>
        {title && (
          <span
            className={cn(
              "min-w-0 truncate whitespace-nowrap",
              top ? "text-xs text-fg-secondary" : "text-2xs text-fg-muted",
            )}
          >
            {title}
          </span>
        )}
        <MicroLabel className="shrink-0 whitespace-nowrap tabular-nums">{b.count}</MicroLabel>
        {b.mode === "leaf" && b.canSplit && (
          <IconButton
            icon={<PlusIcon className="h-3 w-3" />}
            aria-label={de ? `${label} aufteilen` : `Split ${label}`}
            title={de ? "Feiner aufteilen" : "Split into finer blocks"}
            size="xs"
            shape="pill"
            onClick={() => onOverride(b.id, "split")}
          />
        )}
        <IconButton
          icon={<MinusIcon className="h-3 w-3" />}
          aria-label={de ? `${label} zuklappen` : `Fold ${label}`}
          aria-expanded={true}
          title={de ? "Zuklappen" : "Fold"}
          size="xs"
          shape="pill"
          onClick={() => onOverride(b.chain[0].id, "fold")}
        />
      </div>
    </section>
  );
}

/** A run of blocks without pins, shrunk to one caption. */
function GapBand({
  gap: g,
  lang,
  wide,
  textLeft,
}: {
  gap: LaidOutGap;
  lang: "en" | "de";
  wide: boolean;
  textLeft: CSSProperties | undefined;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "absolute inset-x-0 flex items-center",
        g.depth === 0 ? "border-t border-line-soft" : "",
        wide ? "justify-center" : "",
      )}
      style={{ top: g.y, height: g.bottom - g.y, ...(wide ? {} : { paddingLeft: textLeft?.left }) }}
    >
      <span className="bg-surface-950 px-1.5 text-3xs italic text-fg-disabled">
        {gapLabel(g.gap, lang)}
      </span>
    </div>
  );
}
