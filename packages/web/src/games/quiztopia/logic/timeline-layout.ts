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
// The layout gives every era a share of the piecewise display scale
// (`timelineScale`: deep time compressed, recent centuries stretched),
// collapses eras without pins, and grows an era until its cards fit. Inside
// an era the dots sit where their dates fall, so near events look near;
// the cards are then placed beside their dots as closely as the cards
// around them allow, joined by a connector when pushed. Pure, so it is
// tested without a DOM.

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
  minStep: 12,
  eraHeader: 44,
  baseHeight: 1400,
  maxLanes: 5,
  emptyEraHeight: 72,
};

export interface LaidOutItem {
  item: TimelineItem;
  /** The dot's y: where the date sits on the axis. */
  y: number;
  /** The card's anchor y (its connector end); equals `y` unless neighbours pushed it. */
  cardY: number;
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
  /** Monotonic key → y (the dots' scale). */
  yOf: (key: number) => number;
}

/**
 * Positions as close as possible (least squares) to `targets` (ascending)
 * while keeping `step` apart and inside [lo, hi]: shift out the steps,
 * isotonic regression (pool adjacent violators), clamp, shift back.
 */
export function spreadApart(
  targets: readonly number[],
  step: number,
  lo: number,
  hi: number,
): number[] {
  const n = targets.length;
  const blocks: { sum: number; count: number }[] = [];
  for (let i = 0; i < n; i++) {
    blocks.push({ sum: targets[i] - i * step, count: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1];
      const a = blocks[blocks.length - 2];
      if (a.sum / a.count <= b.sum / b.count) break;
      a.sum += b.sum;
      a.count += b.count;
      blocks.pop();
    }
  }
  const top = Math.max(lo, hi - (n - 1) * step);
  const out: number[] = [];
  for (const b of blocks) {
    const v = Math.min(Math.max(b.sum / b.count, lo), top);
    for (let k = 0; k < b.count; k++) out.push(v + out.length * step);
  }
  return out;
}

export function layoutTimeline(
  items: readonly TimelineItem[],
  opts: Partial<LayoutOptions> = {},
): TimelineLayout {
  const o: LayoutOptions = { ...DEFAULT_LAYOUT, ...opts };
  const sorted = sortItems(items);
  const pitch = o.cardHeight + o.gap;
  const bare = (key: number) => timelineScale(key) * o.baseHeight;
  const present = nowKey();

  // Era by era down the river. An era without pins collapses to a short
  // band; one with pins keeps its share of the bare scale, grown until its
  // cards fit. Inside it the dots sit where their dates fall — linear in the
  // era's own scale, so the gaps between them mean something — and only
  // then do the cards find room beside them, as close to their dots as the
  // cards above and below allow.
  const laid: LaidOutItem[] = [];
  const eras: LaidOutEra[] = [];
  // Per era: its keys from `from`, bare-scale range b0..b1 drawn over y0..y1.
  const maps: { from: number; b0: number; b1: number; y0: number; y1: number }[] = [];
  let y = 0;
  let i = 0;
  for (let e = 0; e < ERAS.length; e++) {
    const era = ERAS[e];
    const eraEnd = ERAS[e + 1]?.from ?? Number.POSITIVE_INFINITY;
    const mine: TimelineItem[] = [];
    while (i < sorted.length && sorted[i].parsed.startKey < eraEnd) mine.push(sorted[i++]);
    const full = bare(e === ERAS.length - 1 ? era.to : eraEnd) - bare(era.from);

    if (mine.length === 0) {
      const length = Math.min(full, o.emptyEraHeight);
      const b0 = bare(era.from);
      maps.push({ from: era.from, b0, b1: b0 + full, y0: y, y1: y + length });
      eras.push({ era, y, bottom: y + length, count: 0 });
      y += length;
      continue;
    }

    // The era's scale runs over what it holds — its pins, the ends of bars
    // that stop inside it, and today in the running era — so the gaps
    // between its pins fill the band instead of a sliver of it.
    const keys = mine.map((it) => it.parsed.startKey);
    for (const it of sorted) {
      const k = it.parsed.endKey;
      if (it.interval && k >= era.from && k < eraEnd) keys.push(k);
    }
    if (present >= era.from && present < eraEnd) keys.push(present);
    const from = bare(Math.min(...keys));
    const span = bare(Math.max(...keys)) - from;
    const frac = (key: number) =>
      span > 0 ? Math.min(Math.max((bare(key) - from) / span, 0), 1) : 0;

    // In the running era today is the scale's last point; the cards stay
    // above it so the present-day marker has its own row.
    const running = present >= era.from && present < eraEnd;
    const todayRoom = running ? 12 : 0;
    const perSide = Math.ceil(mine.length / o.columns);
    const length = Math.max(
      full,
      o.eraHeader + perSide * pitch + todayRoom,
      o.eraHeader + (mine.length - 1) * o.minStep + o.cardHeight + todayRoom,
    );
    const top = y + o.eraHeader;
    const bottom = y + length - o.cardHeight - todayRoom;
    const dotBottom = running ? y + length - todayRoom : bottom;
    maps.push({ from: era.from, b0: from, b1: from + span, y0: top, y1: dotBottom });

    const dots = spreadApart(
      mine.map((it) => top + frac(it.parsed.startKey) * (dotBottom - top)),
      o.minStep,
      top,
      dotBottom,
    );

    // Sides: whichever lets the card sit nearer its dot, packing forward;
    // a tie alternates. Neither side takes more than its share, so the era
    // is always tall enough.
    const sides: Side[] = [];
    if (o.columns === 1) {
      for (let k = 0; k < mine.length; k++) sides.push("right");
    } else {
      const next: Record<Side, number> = { left: top, right: top };
      const count: Record<Side, number> = { left: 0, right: 0 };
      let alternate: Side = e % 2 === 0 ? "right" : "left";
      for (const d of dots) {
        const miss = (s: Side) => Math.max(0, next[s] - d);
        let side: Side =
          miss("left") < miss("right")
            ? "left"
            : miss("right") < miss("left")
              ? "right"
              : alternate;
        if (count[side] >= perSide) side = side === "left" ? "right" : "left";
        alternate = side === "left" ? "right" : "left";
        next[side] = Math.max(next[side], d) + pitch;
        count[side]++;
        sides.push(side);
      }
    }
    const cardYs: number[] = new Array(mine.length);
    for (const side of ["left", "right"] as const) {
      const idx = sides.flatMap((s, k) => (s === side ? [k] : []));
      const placed = spreadApart(
        idx.map((k) => dots[k]),
        pitch,
        top,
        bottom,
      );
      idx.forEach((k, j) => {
        cardYs[k] = placed[j];
      });
    }
    mine.forEach((it, k) => {
      laid.push({ item: it, y: dots[k], cardY: cardYs[k], side: sides[k] });
    });

    eras.push({ era, y, bottom: y + length, count: mine.length });
    y += length;
  }
  const height = y;

  // Key → y: each era's own linear map (clamped at its edges), monotonic
  // because every era's range lies below the one before.
  const yOf = (key: number): number => {
    let e = maps.length - 1;
    while (e > 0 && key < maps[e].from) e--;
    const m = maps[e];
    const t = m.b1 > m.b0 ? Math.min(Math.max((bare(key) - m.b0) / (m.b1 - m.b0), 0), 1) : 0;
    return m.y0 + t * (m.y1 - m.y0);
  };

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
