import {
  fromTimelineIndexEntry,
  type TimelineIndex,
} from "@boardgames/core/games/quiztopia/content-types";
import { parseQuestionId } from "@boardgames/core/games/quiztopia/ids";
import {
  currentDate,
  ERAS,
  type Era,
  type EraId,
  eraOf,
  isInterval,
  type ParsedEvent,
  parseEvent,
  type TimelineDate,
  type TimelineEvent,
  timelineScale,
  timelineSortKey,
} from "@boardgames/core/games/quiztopia/timeline";
import type { TimelinePin } from "@boardgames/core/protocol";

// The personal timeline as data: pins (what the member has studied) joined
// with the content's event index, then laid out down a vertical river.
//
// The layout starts from the piecewise display scale (`timelineScale`:
// deep time compressed, recent centuries stretched) and then pushes things
// apart where they would collide — a card never overlaps the one above it on
// its side, two dots never sit closer than `minStep`, and an era header gets
// its own row. Era boundaries and dots are both anchors of one monotonic
// key → y map (`yOf`), so an interval's bar ends exactly where its end date
// sits among the stretched pins. Pure, so it is tested without a DOM.

export interface TimelineText {
  en: string;
  de: string;
  answerEn: string;
  answerDe: string;
  source?: { url: string; title: string; lang: string };
}

export interface TimelineItem {
  questionId: string;
  setId: string;
  cardId: string;
  /** Category 1..12. */
  n: number;
  /** 0 = original card question, 1..4 sibling. */
  q: number;
  event: TimelineEvent;
  parsed: ParsedEvent;
  interval: boolean;
  era: EraId;
  known: boolean;
  lastReviewedAt: string | null;
  /** Inline question copy (preview fixtures); live pages load the card chunk. */
  text?: TimelineText;
}

function byTime(a: TimelineItem, b: TimelineItem): number {
  return (
    a.parsed.startKey - b.parsed.startKey ||
    a.parsed.endKey - b.parsed.endKey ||
    (a.questionId < b.questionId ? -1 : a.questionId > b.questionId ? 1 : 0)
  );
}

/** A timeline item for one question id + event, or null when the id or dates are malformed. */
export function toTimelineItem(
  questionId: string,
  event: TimelineEvent,
  pin: Pick<TimelinePin, "known" | "lastReviewedAt">,
  now: TimelineDate = currentDate(),
  text?: TimelineText,
): TimelineItem | null {
  const pos = parseQuestionId(questionId);
  const parsed = parseEvent(event, now);
  if (!pos || !parsed) return null;
  return {
    questionId,
    setId: pos.setId,
    cardId: pos.cardId,
    n: pos.n,
    q: pos.q,
    event,
    parsed,
    interval: isInterval(event),
    era: eraOf(parsed.startKey).id,
    known: pin.known,
    lastReviewedAt: pin.lastReviewedAt,
    ...(text ? { text } : {}),
  };
}

/** Pins that have an event in the index, oldest first. Undated pins are counted, not shown. */
export function joinPins(
  pins: readonly TimelinePin[],
  index: TimelineIndex,
  now: TimelineDate = currentDate(),
): { items: TimelineItem[]; undated: number } {
  const items: TimelineItem[] = [];
  let undated = 0;
  for (const pin of pins) {
    const entry = index[pin.questionId];
    const item = entry
      ? toTimelineItem(pin.questionId, fromTimelineIndexEntry(entry), pin, now)
      : null;
    if (item) items.push(item);
    else undated++;
  }
  items.sort(byTime);
  return { items, undated };
}

export function sortItems(items: readonly TimelineItem[]): TimelineItem[] {
  return [...items].sort(byTime);
}

// ── Layout ─────────────────────────────────────────────────────────────

export type Side = "left" | "right";

export interface LayoutOptions {
  /** 2 = cards alternate around a central axis; 1 = one column beside it. */
  columns: 1 | 2;
  /** Fixed card height (label clamped), px. */
  cardHeight: number;
  /** Vertical gap between cards on the same side, px. */
  gap: number;
  /** Minimum distance between two dots on the axis, px. */
  minStep: number;
  /** Room an era header takes before its first card, px. */
  eraHeader: number;
  /** Height the bare scale spreads the whole of time over, px. */
  baseHeight: number;
  /** Most bar lanes in the interval gutter (extra spans share the last). */
  maxLanes: number;
  /** An era without pins collapses to this height (its header and a breath), px. */
  emptyEraHeight: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  columns: 2,
  cardHeight: 68,
  gap: 10,
  minStep: 26,
  eraHeader: 44,
  baseHeight: 1400,
  maxLanes: 5,
  emptyEraHeight: 72,
};

export interface LaidOutItem {
  item: TimelineItem;
  /** The dot's (and the card's top-centre) y. */
  y: number;
  side: Side;
}

export interface LaidOutEra {
  era: Era;
  y: number;
  /** Where the next era starts (or the river ends). */
  bottom: number;
  count: number;
}

export interface LaidOutSpan {
  item: TimelineItem;
  y0: number;
  y1: number;
  lane: number;
}

export interface TimelineLayout {
  items: LaidOutItem[];
  eras: LaidOutEra[];
  spans: LaidOutSpan[];
  lanes: number;
  height: number;
  /** Monotonic key → y through every anchor. */
  yOf: (key: number) => number;
}

interface Anchor {
  key: number;
  y: number;
}

/** Piecewise-linear through sorted anchors; beyond the ends the bare scale continues. */
function interpolator(anchors: readonly Anchor[], base: (key: number) => number) {
  return (key: number): number => {
    if (anchors.length === 0) return base(key);
    const first = anchors[0];
    const last = anchors[anchors.length - 1];
    if (key <= first.key) return first.y - (base(first.key) - base(key));
    if (key >= last.key) return last.y + (base(key) - base(last.key));
    let lo = 0;
    let hi = anchors.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (anchors[mid].key <= key) lo = mid;
      else hi = mid;
    }
    const a = anchors[lo];
    const b = anchors[hi];
    if (b.key === a.key) return a.y;
    // Interpolate in scale space, so the stretch follows the era's shape.
    const ta = base(a.key);
    const tb = base(b.key);
    const t = tb === ta ? (key - a.key) / (b.key - a.key) : (base(key) - ta) / (tb - ta);
    return a.y + t * (b.y - a.y);
  };
}

export function layoutTimeline(
  items: readonly TimelineItem[],
  opts: Partial<LayoutOptions> = {},
): TimelineLayout {
  const o: LayoutOptions = { ...DEFAULT_LAYOUT, ...opts };
  const sorted = sortItems(items);

  const counts = new Map<EraId, number>();
  for (const it of sorted) counts.set(it.era, (counts.get(it.era) ?? 0) + 1);

  // The bare scale, with every era that holds no pin squeezed to a short band
  // (a sparse timeline would otherwise be mostly empty river); eras with pins
  // keep their proportions. Stays monotonic, so bars can still cross them.
  const bare = (key: number) => timelineScale(key) * o.baseHeight;
  const bands = ERAS.map((era, e) => {
    const from = bare(era.from);
    const to = e === ERAS.length - 1 ? bare(era.to) : bare(ERAS[e + 1].from);
    const length = counts.get(era.id) ? to - from : Math.min(to - from, o.emptyEraHeight);
    return { from, to, length, start: 0 };
  });
  for (let e = 1; e < bands.length; e++) {
    bands[e].start = bands[e - 1].start + bands[e - 1].length;
  }
  const base = (key: number): number => {
    const b = bare(key);
    let e = bands.length - 1;
    while (e > 0 && b < bands[e].from) e--;
    const band = bands[e];
    const span = band.to - band.from;
    const t = span > 0 ? (b - band.from) / span : 0;
    return band.start + t * band.length;
  };

  const laid: LaidOutItem[] = [];
  const eraYs: number[] = [];
  const anchors: Anchor[] = [];
  const sideBottom: Record<Side, number> = { left: 0, right: 0 };
  let lastDot = Number.NEGATIVE_INFINITY;
  let floor = 0; // nothing may start above this (the last era header's row)
  let nextSide: Side = "right";
  let i = 0;

  for (let e = 0; e < ERAS.length; e++) {
    const era = ERAS[e];
    // The era's header row: below every card so far and below its bare-scale spot.
    const y = Math.max(
      e === 0 ? 0 : base(era.from),
      floor,
      sideBottom.left + o.gap,
      sideBottom.right + o.gap,
      lastDot + o.minStep,
    );
    eraYs.push(y);
    anchors.push({ key: era.from, y });
    floor = y + o.eraHeader;
    const eraEnd = ERAS[e + 1]?.from ?? Number.POSITIVE_INFINITY;
    while (i < sorted.length && sorted[i].parsed.startKey < eraEnd) {
      const it = sorted[i];
      let side: Side = "right";
      if (o.columns === 2) {
        // The side with more room wins; a tie alternates.
        if (sideBottom.left < sideBottom.right) side = "left";
        else if (sideBottom.right < sideBottom.left) side = "right";
        else side = nextSide;
        nextSide = side === "left" ? "right" : "left";
      }
      const sameSide =
        o.columns === 2 ? sideBottom[side] : Math.max(sideBottom.left, sideBottom.right);
      const top = Math.max(
        base(it.parsed.startKey),
        floor,
        sameSide + (sameSide > 0 ? o.gap : 0),
        lastDot + o.minStep,
      );
      laid.push({ item: it, y: top, side });
      sideBottom[side] = top + o.cardHeight;
      if (o.columns === 1) sideBottom.left = sideBottom.right = top + o.cardHeight;
      lastDot = top;
      const prev = anchors[anchors.length - 1];
      // Equal keys keep the first anchor so the map stays a function.
      if (prev.key < it.parsed.startKey) anchors.push({ key: it.parsed.startKey, y: top });
      i++;
    }
  }

  const contentBottom = Math.max(sideBottom.left, sideBottom.right, floor, lastDot) + o.gap;
  const yOf = interpolator(anchors, base);
  const height = Math.max(contentBottom, yOf(ERAS[ERAS.length - 1].to - 1e-6) + o.gap);

  const eras: LaidOutEra[] = ERAS.map((era, e) => ({
    era,
    y: eraYs[e],
    bottom: eraYs[e + 1] ?? height,
    count: counts.get(era.id) ?? 0,
  }));

  // Interval bars: greedy lanes, the first whose previous bar has ended.
  const laneEnds: number[] = [];
  const spans: LaidOutSpan[] = [];
  for (const l of laid) {
    if (!l.item.interval) continue;
    const y0 = l.y;
    const y1 = Math.min(height, Math.max(y0 + 8, yOf(l.item.parsed.endKey)));
    let lane = laneEnds.findIndex((end) => end + 4 <= y0);
    if (lane < 0) {
      if (laneEnds.length < o.maxLanes) {
        lane = laneEnds.length;
        laneEnds.push(y1);
      } else {
        lane = o.maxLanes - 1;
        laneEnds[lane] = Math.max(laneEnds[lane], y1);
      }
    } else {
      laneEnds[lane] = y1;
    }
    spans.push({ item: l.item, y0, y1, lane });
  }

  return { items: laid, eras, spans, lanes: laneEnds.length, height, yOf };
}

/** Sort key of "now" for the river's present-day marker. */
export function nowKey(now: TimelineDate = currentDate()): number {
  return timelineSortKey(now);
}
