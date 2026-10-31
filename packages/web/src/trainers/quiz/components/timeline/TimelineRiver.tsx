import { formatTimelineDate } from "@boardgames/core/quiz/timeline";
import { gapLabel } from "@boardgames/core/quiz/timeline-blocks";
import { type CSSProperties, memo } from "react";
import { MinusIcon, PlusIcon } from "../../../../components/icons";
import { IconButton } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { domainOf } from "../../domains";
import type { LaidOutBlock, LaidOutGap, TimelineLayout } from "../../logic/timeline-layout";
import { DomainIcon } from "../common/DomainIcon";
import { KICKER } from "../paper/paper-style";
import { blockDomId, DOT_OFFSET, pinDomId } from "./dom-ids";
import { chainLabel, chainTitle } from "./era-copy";
import { inkDot } from "./tones";

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
  lang: "en" | "de" | "ru";
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
        className="absolute inset-y-0 w-px -translate-x-1/2 bg-fg-primary/50"
        style={{ left: axis }}
      />

      {/* Interval bars */}
      {layout.spans.map((s) => {
        const d = domainOf(s.item.domain);
        const active = s === focusSpan;
        return (
          <div
            key={`bar-${s.item.questionId}`}
            aria-hidden="true"
            className={cn(
              "absolute w-1 -translate-x-1/2 transition-[top,height] duration-300 motion-reduce:transition-none",
              active ? "opacity-100" : s.item.known ? "opacity-50" : "opacity-30",
            )}
            style={{
              left: laneX(s.lane),
              top: s.y0,
              height: s.y1 - s.y0,
              backgroundColor: d.color,
            }}
          />
        );
      })}

      {/* Pins */}
      {layout.items.map(({ item, y, cardY, side }) => {
        const d = domainOf(item.domain);
        const focused = item.questionId === focusId;
        const label =
          lang === "de"
            ? item.event.labelDe
            : lang === "ru"
              ? (item.event.labelRu ?? item.event.labelEn)
              : item.event.labelEn;
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
                focused && "scale-150",
              )}
              style={{ top: y, left: axis, ...inkDot(d.color, item.known) }}
            >
              {focused && (
                <span
                  className="absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping"
                  style={inkDot(d.color, true)}
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
                "group absolute flex scroll-my-32 flex-col justify-center gap-0.5 overflow-hidden border border-l-4 bg-surface-900 px-2.5 text-left transition-[top,background-color] duration-300 motion-reduce:transition-none",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/70",
                item.known
                  ? "border-line-strong hover:bg-surface-800"
                  : "border-dashed border-line-strong hover:bg-surface-800",
                focused && "border-3 border-double border-accent-300 border-l-4",
              )}
              style={{
                top: cardY - DOT_OFFSET,
                height: cardHeight - 8,
                borderLeftColor: d.color,
                ...cardBox(side),
              }}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <DomainIcon domain={item.domain} size={20} />
                <span
                  className={cn("truncate font-headline text-xs font-bold tabular-nums", d.ink)}
                >
                  {date}
                </span>
                {!item.known && (
                  <span className="ml-auto shrink-0 font-news text-3xs italic text-fg-muted">
                    {lang === "de" ? "lernt noch" : "learning"}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "line-clamp-2 font-news text-xs leading-snug",
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
          <span
            className={cn(
              KICKER,
              "flex items-center gap-1.5 border-3 border-double border-accent-300 bg-surface-900 px-2 py-0.5 text-accent-300",
            )}
          >
            {lang === "de" ? "Heute" : "Today"}
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
  lang: "en" | "de" | "ru";
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
            "absolute inset-y-1.5 flex items-center gap-2 border border-dashed border-line-strong bg-surface-900 px-2.5 text-left transition-colors hover:bg-surface-800",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60",
            wide ? "left-1/2 w-full max-w-lg -translate-x-1/2" : "right-0",
          )}
          style={textLeft}
        >
          <PlusIcon className="h-3 w-3 shrink-0 text-fg-muted" />
          <span className="shrink-0 whitespace-nowrap font-headline text-sm font-bold text-fg-strong">
            {label}
          </span>
          {title && (
            <span className="min-w-0 truncate font-news text-xs italic text-fg-muted">{title}</span>
          )}
          <span aria-hidden="true" className="relative ml-auto h-2.5 w-20 shrink-0 sm:w-32">
            <span className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
            {b.strip.map(({ at, item }) => (
              <span
                key={item.questionId}
                className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border"
                style={{ left: `${at * 100}%`, ...inkDot(domainOf(item.domain).color, item.known) }}
              />
            ))}
          </span>
          <span className="shrink-0 font-news text-xs tabular-nums text-fg-muted">{b.count}</span>
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
        top ? "border-t border-line-strong" : "border-t border-dotted border-line-soft",
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
          "absolute z-lift flex max-w-full min-w-0 items-center gap-1.5 bg-surface-900 px-1.5",
          top ? "top-2" : "top-1.5",
          wide ? "left-1/2 -translate-x-1/2 justify-center" : "right-0",
        )}
        style={textLeft}
      >
        <span
          className={cn(
            "min-w-0 truncate whitespace-nowrap font-headline",
            top
              ? "text-base font-black text-fg-strong"
              : b.depth === 1
                ? "text-sm font-bold text-fg-primary"
                : "text-xs font-bold text-fg-secondary",
          )}
        >
          {label}
        </span>
        {title && (
          <span
            className={cn(
              "min-w-0 truncate whitespace-nowrap font-news italic",
              top ? "text-xs text-fg-secondary" : "text-2xs text-fg-muted",
            )}
          >
            {title}
          </span>
        )}
        <span className={cn(KICKER, "shrink-0 whitespace-nowrap tabular-nums text-fg-muted")}>
          {b.count}
        </span>
        {b.mode === "leaf" && b.canSplit && (
          <IconButton
            icon={<PlusIcon className="h-3 w-3" />}
            aria-label={de ? `${label} aufteilen` : `Split ${label}`}
            title={de ? "Feiner aufteilen" : "Split into finer blocks"}
            size="xs"
            onClick={() => onOverride(b.id, "split")}
          />
        )}
        <IconButton
          icon={<MinusIcon className="h-3 w-3" />}
          aria-label={de ? `${label} zuklappen` : `Fold ${label}`}
          aria-expanded={true}
          title={de ? "Zuklappen" : "Fold"}
          size="xs"
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
  lang: "en" | "de" | "ru";
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
      <span className="relative z-lift bg-surface-900 px-1.5 font-news text-xs italic text-fg-muted">
        · · · {gapLabel(g.gap, lang)} · · ·
      </span>
    </div>
  );
}
