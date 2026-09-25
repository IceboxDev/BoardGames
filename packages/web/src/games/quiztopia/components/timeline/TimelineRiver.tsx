import { formatTimelineDate } from "@boardgames/core/games/quiztopia/timeline";
import { type CSSProperties, memo } from "react";
import { MicroLabel } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { districtByN } from "../../bands";
import { nowKey, type TimelineLayout } from "../../logic/timeline-layout";
import { BuildingGlyph } from "../common/BuildingGlyph";
import { DOT_OFFSET, eraDomId, pinDomId } from "./dom-ids";
import { eraRange } from "./era-copy";
import { BAR, BAR_ACTIVE, CARD_EDGE, DATE_INK, DOT_FILL, DOT_RING } from "./tones";

// The river: time flows down a central axis (≥ lg) or a left-hand one
// (phones). Era bands stripe the background, each pin is a dot on the axis
// with its card beside it, and lifespans / wars / reigns run as bars in a
// narrow gutter lane along the axis — so a life visibly spans the moments
// pinned while it lasted. Everything is absolutely positioned from the pure
// layout; this component only turns numbers into boxes.

const LANE_W = 6;
const CARD_GAP = 14;
/** Room the era header chip takes at the top of its band, px. */
const ERA_HEADER_CLEARANCE = 48;

type Props = {
  layout: TimelineLayout;
  wide: boolean;
  lang: "en" | "de";
  cardHeight: number;
  focusId: string | null;
  onSelect: (questionId: string) => void;
};

function TimelineRiverImpl({ layout, wide, lang, cardHeight, focusId, onSelect }: Props) {
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

  // Today's spot on the scale, kept clear of its era's header row (with empty
  // eras collapsed, the 21st century is short and "now" sits right under it).
  const nowRaw = layout.yOf(nowKey());
  const nowBand = layout.eras.find((b) => nowRaw >= b.y && nowRaw < b.bottom);
  const now = nowBand
    ? Math.min(Math.max(nowRaw, nowBand.y + ERA_HEADER_CLEARANCE), nowBand.bottom - 6)
    : nowRaw;
  const focusSpan = layout.spans.find((s) => s.item.questionId === focusId);

  return (
    <div className="relative" style={{ height: layout.height }}>
      {/* Era bands */}
      {layout.eras.map((band, i) => (
        <section
          key={band.era.id}
          id={eraDomId(band.era.id)}
          aria-label={`${lang === "de" ? band.era.de : band.era.en}, ${band.count} pinned`}
          className={cn(
            "absolute inset-x-0 scroll-mt-24 border-t border-line-soft",
            i % 2 === 0 ? "bg-fill-soft" : "",
          )}
          style={{ top: band.y, height: band.bottom - band.y }}
        >
          <div
            className={cn(
              "absolute top-2 flex items-baseline gap-2",
              wide ? "left-1/2 -translate-x-1/2 justify-center" : "",
            )}
            style={wide ? undefined : { left: `${gutter + 6 + CARD_GAP}px` }}
          >
            <span className="whitespace-nowrap rounded-full border border-line bg-surface-950 px-2.5 py-0.5 text-2xs font-semibold text-fg-strong">
              {lang === "de" ? band.era.de : band.era.en}
            </span>
            <MicroLabel className="whitespace-nowrap">
              {eraRange(band.era, lang)} · {band.count}
            </MicroLabel>
          </div>
        </section>
      ))}

      {/* Axis */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 w-px -translate-x-1/2 bg-gradient-to-b from-line via-line-strong to-line"
        style={{ left: axis }}
      />

      {/* Present-day marker */}
      {now > 0 && now < layout.height && (
        <div
          aria-hidden="true"
          className="absolute flex -translate-y-1/2 items-center gap-1.5"
          style={{ top: now, left: axis }}
        >
          <span className="h-px w-3 -translate-x-1/2 bg-accent-400" />
          <MicroLabel className="text-accent-300">{lang === "de" ? "Heute" : "Today"}</MicroLabel>
        </div>
      )}

      {/* Interval bars */}
      {layout.spans.map((s) => {
        const d = districtByN(s.item.n);
        const active = s === focusSpan;
        // A bar that runs to the present meets the (possibly nudged) marker.
        const y1 = s.y1 >= nowRaw - 1 ? Math.max(s.y1, now) : s.y1;
        return (
          <div
            key={`bar-${s.item.questionId}`}
            aria-hidden="true"
            className={cn(
              "absolute w-1 -translate-x-1/2 rounded-full transition-[top,height] duration-300 motion-reduce:transition-none",
              active ? BAR_ACTIVE[d.tone] : BAR[d.tone],
              !s.item.known && !active && "opacity-60",
            )}
            style={{ left: laneX(s.lane), top: s.y0, height: y1 - s.y0 }}
          />
        );
      })}

      {/* Pins */}
      {layout.items.map(({ item, y, side }) => {
        const d = districtByN(item.n);
        const focused = item.questionId === focusId;
        const label = lang === "de" ? item.event.labelDe : item.event.labelEn;
        const date = formatTimelineDate(item.event, lang);
        return (
          <div key={item.questionId}>
            <span
              aria-hidden="true"
              className="absolute h-px bg-line transition-[top] duration-300 motion-reduce:transition-none"
              style={
                wide
                  ? side === "left"
                    ? {
                        top: y,
                        left: `calc(50% - ${gutter / 2 + CARD_GAP}px)`,
                        width: CARD_GAP + gutter / 2,
                      }
                    : { top: y, left: "50%", width: CARD_GAP + gutter / 2 }
                  : { top: y, left: axis, width: CARD_GAP }
              }
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
              style={{ top: y - DOT_OFFSET, height: cardHeight - 8, ...cardBox(side) }}
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
    </div>
  );
}

export const TimelineRiver = memo(TimelineRiverImpl);
