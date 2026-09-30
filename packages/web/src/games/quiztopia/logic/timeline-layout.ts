import {
  fromTimelineIndexEntry,
  type TimelineIndex,
} from "@boardgames/core/games/quiztopia/content-types";
import { parseQuestionId } from "@boardgames/core/games/quiztopia/ids";
import {
  currentDate,
  isInterval,
  type ParsedEvent,
  parseEvent,
  type TimelineDate,
  type TimelineEvent,
  timelineSortKey,
} from "@boardgames/core/games/quiztopia/timeline";
import {
  type Block,
  type BlockEntry,
  type BlockNode,
  type BlockOverride,
  buildBlockTree,
  fractionIn,
  type Placed,
  type QuietGap,
} from "@boardgames/core/games/quiztopia/timeline-blocks";
import type { TimelinePin } from "@boardgames/core/protocol";

// The personal timeline as data: pins (what the member has studied) joined
// with the content's event index, then laid out down a vertical river.
//
// The river is cut into the blocks of `timeline-blocks.ts`: millennia (or
// deep-time ages) that split into centuries, decades, years and months
// only where the member's pins crowd, so a swarm in the 1990s reads as its
// years while a lone pharaoh keeps a whole millennium. Blocks stack down the
// river, each with a header; inside a leaf block the dots sit where their
// dates fall and the cards beside them as closely as the cards around them
// allow, joined by a connector when pushed. Pure, so it is tested without a
// DOM.

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
  /** Most bar lanes in the interval gutter (extra spans share the last). */
  maxLanes: number;
  /** Most cards per column a leaf block holds before it splits. */
  capacity: number;
  /** The member's own cuts, by block id. */
  overrides: Readonly<Record<string, BlockOverride>>;
  /** A card's top sits this far above its anchor (the dot), px — kept clear of the header. */
  cardInset: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  columns: 2,
  cardHeight: 68,
  gap: 10,
  minStep: 12,
  maxLanes: 5,
  capacity: 6,
  overrides: {},
  cardInset: 14,
};

/** Header row of a block by nesting depth: a top block's is tallest. */
export const HEADER_HEIGHT = [44, 34, 30] as const;
export const headerHeight = (depth: number): number =>
  HEADER_HEIGHT[Math.min(depth, HEADER_HEIGHT.length - 1)];
/** A quiet gap's band, px. */
export const GAP_HEIGHT = 26;
/** A folded block's one summary row, px. */
export const FOLDED_HEIGHT = 44;
/** A leaf splits when it would push a card further than this many pitches from its dot. */
const PUSH_LIMIT = 2;
/** Breathing room under a block's last card, px. */
const BLOCK_FOOT = 6;

export interface LaidOutItem {
  item: TimelineItem;
  /** The dot's y: where the date sits on the axis. */
  y: number;
  /** The card's anchor y (its connector end); equals `y` unless neighbours pushed it. */
  cardY: number;
  side: Side;
  /** The block the card is shown in. */
  blockId: string;
}

export interface LaidOutBlock {
  kind: "block";
  /** The deepest block of the header chain. */
  id: string;
  /** The header's blocks, top first (one, or a pass-through chain). */
  chain: Block[];
  block: Block;
  depth: number;
  parent: string | null;
  mode: "split" | "leaf" | "folded";
  y: number;
  bottom: number;
  header: number;
  count: number;
  canSplit: boolean;
  /** Folded: each pin's place across the summary strip, 0..1. */
  strip: { at: number; item: TimelineItem }[];
}

export interface LaidOutGap {
  kind: "gap";
  gap: QuietGap;
  depth: number;
  parent: string | null;
  y: number;
  bottom: number;
}

export interface LaidOutSpan {
  item: TimelineItem;
  y0: number;
  y1: number;
  lane: number;
}

export interface TimelineLayout {
  items: LaidOutItem[];
  /** Every block and gap, in drawing order (a parent before its children). */
  blocks: (LaidOutBlock | LaidOutGap)[];
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

const place = (it: TimelineItem): Placed => ({
  key: it.parsed.startKey,
  precision: it.event.precision,
});

/**
 * A stretch of the key axis drawn over [y0, y1]: the block's own scale
 * (linear, or log in deep time) between `lo` and `hi`, clamped outside.
 */
interface Segment {
  block: Block;
  lo: number;
  hi: number;
  y0: number;
  y1: number;
}

function segmentY(s: Segment, key: number): number {
  const a = fractionIn(s.block, s.lo);
  const b = fractionIn(s.block, s.hi);
  const t = b > a ? (fractionIn(s.block, key) - a) / (b - a) : 0;
  return s.y0 + Math.min(Math.max(t, 0), 1) * (s.y1 - s.y0);
}

export function layoutTimeline(
  items: readonly TimelineItem[],
  opts: Partial<LayoutOptions> = {},
): TimelineLayout {
  const o: LayoutOptions = { ...DEFAULT_LAYOUT, ...opts };
  const pitch = o.cardHeight + o.gap;
  const sorted = sortItems(items);

  // A leaf's scale runs over what it holds — its pins, and the ends of bars
  // that stop inside it — so the gaps between its pins fill the block
  // instead of a sliver of a millennium.
  const leafSegment = (run: readonly TimelineItem[], b: Block, top: number): Segment => {
    const keys = run.map((it) => it.parsed.startKey);
    for (const it of sorted) {
      const k = it.parsed.endKey;
      if (it.interval && k >= b.from && k < b.to) keys.push(k);
    }
    return { block: b, lo: Math.min(...keys), hi: Math.max(...keys), y0: top, y1: top };
  };
  const leafDot = (seg: Segment) => (it: TimelineItem, top: number, bottom: number) =>
    segmentY({ ...seg, y0: top, y1: bottom }, it.parsed.startKey);

  // Crowded = more cards than a leaf holds, or cards the layout would have
  // to push far from their dots (a swarm in one corner of the block).
  const crowded = (run: readonly TimelineItem[], b: Block): boolean => {
    if (run.length > o.capacity * o.columns) return true;
    if (run.length <= o.columns) return false;
    const { dots, cardYs } = arrange(run, 0, leafDot(leafSegment(run, b, 0)), false);
    return dots.some((d, k) => Math.abs(cardYs[k] - d) > pitch * PUSH_LIMIT);
  };

  const laid: LaidOutItem[] = [];
  const blocks: (LaidOutBlock | LaidOutGap)[] = [];
  const segments: Segment[] = [];
  let parity = 0;

  /**
   * Cards for one run of items from `top` down: dots at `dotAt`, spread to
   * the minimum step, then each card on the side that lets it sit nearest
   * its dot. Pure — the split rule dry-runs it.
   */
  const arrange = (
    run: readonly TimelineItem[],
    top: number,
    dotAt: (it: TimelineItem, dotTop: number, dotBottom: number) => number,
    flip: boolean,
  ) => {
    const n = run.length;
    const perSide = Math.ceil(n / o.columns);
    const body = Math.max(perSide * pitch, (n - 1) * o.minStep + o.cardHeight);
    const bottom = top + body - o.cardHeight;
    const dots = spreadApart(
      run.map((it) => dotAt(it, top, bottom)),
      o.minStep,
      top,
      bottom,
    );
    const sides: Side[] = [];
    if (o.columns === 1) {
      for (let k = 0; k < n; k++) sides.push("right");
    } else {
      const next: Record<Side, number> = { left: top, right: top };
      const count: Record<Side, number> = { left: 0, right: 0 };
      let alternate: Side = flip ? "left" : "right";
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
    const cardYs: number[] = new Array(n);
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
    return { body, dots, cardYs, sides };
  };

  const placeCards = (
    run: readonly TimelineItem[],
    blockId: string,
    top: number,
    dotAt: (it: TimelineItem, dotTop: number, dotBottom: number) => number,
  ): number => {
    const { body, dots, cardYs, sides } = arrange(run, top, dotAt, parity++ % 2 === 1);
    run.forEach((it, k) => {
      laid.push({ item: it, y: dots[k], cardY: cardYs[k], side: sides[k], blockId });
    });
    return body;
  };

  const walk = (
    entries: readonly BlockEntry<TimelineItem>[],
    y: number,
    depth: number,
    parent: string | null,
  ): number => {
    for (const e of entries) {
      if (e.kind === "gap") {
        blocks.push({ kind: "gap", gap: e, depth, parent, y, bottom: y + GAP_HEIGHT });
        const block: Block = { id: "gap", level: "year", from: e.from, to: e.to };
        segments.push({ block, lo: e.from, hi: e.to, y0: y, y1: y + GAP_HEIGHT });
        y += GAP_HEIGHT;
        continue;
      }
      y = walkNode(e, y, depth, parent);
    }
    return y;
  };

  const walkNode = (
    node: BlockNode<TimelineItem>,
    y: number,
    depth: number,
    parent: string | null,
  ): number => {
    const header = headerHeight(depth);
    const entry: LaidOutBlock = {
      kind: "block",
      id: node.block.id,
      chain: node.chain,
      block: node.block,
      depth,
      parent,
      mode: node.mode,
      y,
      bottom: y,
      header,
      count: node.items.length,
      canSplit: node.canSplit,
      strip: [],
    };
    blocks.push(entry);

    if (node.mode === "folded") {
      entry.header = FOLDED_HEIGHT;
      entry.bottom = y + FOLDED_HEIGHT;
      entry.strip = node.items.map((it) => ({
        at: fractionIn(node.block, it.parsed.startKey),
        item: it,
      }));
      segments.push({
        block: node.block,
        lo: node.block.from,
        hi: node.block.to,
        y0: y + 8,
        y1: entry.bottom - 8,
      });
      return entry.bottom;
    }

    let cursor = y + header + o.cardInset;
    if (node.mode === "leaf") {
      const seg = leafSegment(node.items, node.block, cursor);
      const body = placeCards(node.items, node.block.id, cursor, leafDot(seg));
      seg.y1 = cursor + body - o.cardHeight;
      segments.push(seg);
      cursor += body + BLOCK_FOOT;
    } else {
      // Dates too coarse for the children ("the 1960s") head the block.
      if (node.loose.length > 0) {
        const body = placeCards(node.loose, node.block.id, cursor, (_it, top) => top);
        cursor += body + BLOCK_FOOT;
      }
      cursor = walk(node.children, cursor, depth + 1, node.block.id);
    }
    entry.bottom = cursor;
    return cursor;
  };

  const tree = buildBlockTree(sorted, place, {
    capacity: o.capacity,
    overrides: o.overrides,
    crowded,
  });
  const height = tree.length === 0 ? 0 : walk(tree, 0, 0, null);

  // Key → y: the segment holding the key (clamped at the river's ends),
  // monotonic because segments follow time down the river.
  segments.sort((a, b) => a.block.from - b.block.from || a.y0 - b.y0);
  const yOf = (key: number): number => {
    if (segments.length === 0) return 0;
    let seg = segments[0];
    for (const s of segments) {
      if (s.block.from <= key) seg = s;
      else break;
    }
    return segmentY(seg, key);
  };

  // Interval bars: greedy lanes, the first whose previous bar has ended.
  const laneEnds: number[] = [];
  const spans: LaidOutSpan[] = [];
  const ordered = [...laid].sort((a, b) => a.y - b.y);
  for (const l of ordered) {
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

  return { items: ordered, blocks, spans, lanes: laneEnds.length, height, yOf };
}

/** Sort key of "now" for the river's present-day marker. */
export function nowKey(now: TimelineDate = currentDate()): number {
  return timelineSortKey(now);
}
