import {
  formatDatePart,
  formatSpan,
  type TimelineLang,
  type TimelinePrecision,
  timelineSortKey,
} from "./timeline.ts";
import { blockName } from "./timeline-names/index.ts";
import type { BlockName } from "./timeline-names/types.ts";

// The personal timeline's blocks. Time is cut into nested, named blocks —
// geological ages and their periods for deep time, then millennia →
// centuries → decades → years → months from 10,000 BC on — and a member's
// pins pick how deep each stretch is cut: a block holding more pins than
// fit splits into its children, its quiet neighbours stay whole. Pure, so
// the web layout and the tests share one model.
//
// Blocks are round-number aligned so every level nests: `mil:1000` is
// 1000–1999, `cen:1900` 1900–1999, `dec:1990` 1990–1999. BC mirrors it
// ("440s BC" = 449–440 BC, `dec:440bc`), and with no year 0 the blocks
// next to it run 9–1 BC (`dec:0bc`) and AD 1–9 (`dec:0`). Ranges are in
// sort keys (`timelineSortKey`), half-open [from, to).

export type BlockLevel = "age" | "period" | "millennium" | "century" | "decade" | "year" | "month";

export interface Block {
  id: string;
  level: BlockLevel;
  from: number;
  to: number;
}

// ── Deep time ──────────────────────────────────────────────────────────

interface DeepSpan {
  slug: string;
  /** Years ago where it starts and ends. */
  fromAgo: number;
  toAgo: number;
  name: BlockName;
  periods?: DeepSpan[];
}

/** "Now" for the log scale's years-ago arithmetic (deep time does not care which year). */
const PRESENT = 2000;
/** Key where the millennia take over: 1 January 9999 BC. */
export const MILLENNIA_FROM = 2 - 9000 - 1000;

// Content writes "66 million years ago" as the year -66000000, so the age
// boundaries are keyed the same way.
const agoKey = (ago: number) => -ago;

const DEEP: readonly DeepSpan[] = [
  {
    slug: "cosmic",
    fromAgo: 13.8e9,
    toAgo: 4.6e9,
    name: { en: "Cosmic Dawn", de: "Kosmische Frühzeit" },
  },
  { slug: "hadean", fromAgo: 4.6e9, toAgo: 4.0e9, name: { en: "Hadean", de: "Hadaikum" } },
  { slug: "archean", fromAgo: 4.0e9, toAgo: 2.5e9, name: { en: "Archean", de: "Archaikum" } },
  {
    slug: "proterozoic",
    fromAgo: 2.5e9,
    toAgo: 539e6,
    name: { en: "Proterozoic", de: "Proterozoikum" },
  },
  {
    slug: "paleozoic",
    fromAgo: 539e6,
    toAgo: 251.9e6,
    name: { en: "Paleozoic", de: "Paläozoikum" },
    periods: [
      {
        slug: "cambrian",
        fromAgo: 539e6,
        toAgo: 485.4e6,
        name: { en: "Cambrian", de: "Kambrium" },
      },
      {
        slug: "ordovician",
        fromAgo: 485.4e6,
        toAgo: 443.8e6,
        name: { en: "Ordovician", de: "Ordovizium" },
      },
      { slug: "silurian", fromAgo: 443.8e6, toAgo: 419.2e6, name: { en: "Silurian", de: "Silur" } },
      { slug: "devonian", fromAgo: 419.2e6, toAgo: 358.9e6, name: { en: "Devonian", de: "Devon" } },
      {
        slug: "carboniferous",
        fromAgo: 358.9e6,
        toAgo: 298.9e6,
        name: { en: "Carboniferous", de: "Karbon" },
      },
      { slug: "permian", fromAgo: 298.9e6, toAgo: 251.9e6, name: { en: "Permian", de: "Perm" } },
    ],
  },
  {
    slug: "mesozoic",
    fromAgo: 251.9e6,
    toAgo: 66e6,
    name: { en: "Mesozoic", de: "Mesozoikum" },
    periods: [
      { slug: "triassic", fromAgo: 251.9e6, toAgo: 201.4e6, name: { en: "Triassic", de: "Trias" } },
      { slug: "jurassic", fromAgo: 201.4e6, toAgo: 145e6, name: { en: "Jurassic", de: "Jura" } },
      { slug: "cretaceous", fromAgo: 145e6, toAgo: 66e6, name: { en: "Cretaceous", de: "Kreide" } },
    ],
  },
  {
    slug: "cenozoic",
    fromAgo: 66e6,
    toAgo: 300e3,
    name: { en: "Cenozoic", de: "Känozoikum" },
    periods: [
      {
        slug: "paleogene",
        fromAgo: 66e6,
        toAgo: 23.03e6,
        name: { en: "Paleogene", de: "Paläogen" },
      },
      { slug: "neogene", fromAgo: 23.03e6, toAgo: 2.58e6, name: { en: "Neogene", de: "Neogen" } },
      {
        slug: "quaternary",
        fromAgo: 2.58e6,
        toAgo: 300e3,
        name: { en: "Early Quaternary", de: "Frühes Quartär" },
      },
    ],
  },
  {
    slug: "paleolithic",
    fromAgo: 300e3,
    toAgo: -MILLENNIA_FROM,
    name: { en: "Old Stone Age", de: "Altsteinzeit" },
  },
];

const DEEP_BY_ID = new Map<string, { span: DeepSpan; level: "age" | "period" }>();
for (const age of DEEP) {
  DEEP_BY_ID.set(`age:${age.slug}`, { span: age, level: "age" });
  for (const p of age.periods ?? []) DEEP_BY_ID.set(`per:${p.slug}`, { span: p, level: "period" });
}

function deepBlock(span: DeepSpan, level: "age" | "period"): Block {
  return {
    id: `${level === "age" ? "age" : "per"}:${span.slug}`,
    level,
    // The oldest age reaches down to everything older.
    from: span === DEEP[0] ? Number.NEGATIVE_INFINITY : agoKey(span.fromAgo),
    to: agoKey(span.toAgo),
  };
}

// ── Calendar blocks ────────────────────────────────────────────────────

const SIZE = { millennium: 1000, century: 100, decade: 10 } as const;
type SizedLevel = keyof typeof SIZE;
const PREFIX: Record<SizedLevel, string> = { millennium: "mil", century: "cen", decade: "dec" };
const LEVEL_OF_PREFIX: Record<string, SizedLevel> = {
  mil: "millennium",
  cen: "century",
  dec: "decade",
};

/** Historical year (no 0) of a sort key. */
export function yearOfKey(key: number): number {
  const astro = Math.floor(key);
  return astro <= 0 ? astro - 1 : astro;
}

/** The key range of a round block: `n` = its round start (440 for the 440s), `bc` which side. */
function sizedRange(n: number, size: number, bc: boolean): [number, number] {
  if (!bc) return [n === 0 ? 1 : n, n + size];
  // Years (n + size − 1) BC … n BC; the block next to year 0 ends at 1 BC.
  return [2 - n - size, n === 0 ? 1 : 2 - n];
}

function sizedBlock(level: SizedLevel, n: number, bc: boolean): Block {
  const [from, to] = sizedRange(n, SIZE[level], bc);
  return { id: `${PREFIX[level]}:${n}${bc ? "bc" : ""}`, level, from, to };
}

function yearBlock(year: number): Block {
  const from = timelineSortKey({ year, month: null, day: null });
  return { id: `yr:${Math.abs(year)}${year < 0 ? "bc" : ""}`, level: "year", from, to: from + 1 };
}

function monthBlock(year: number, month: number): Block {
  const base = timelineSortKey({ year, month: null, day: null });
  const bc = year < 0 ? "bc" : "";
  return {
    id: `mo:${Math.abs(year)}${bc}-${String(month).padStart(2, "0")}`,
    level: "month",
    from: base + (month - 1) / 12,
    to: base + month / 12,
  };
}

/** The block of `level` holding `key` (deep levels: null outside deep time or an age without periods). */
export function blockOf(level: BlockLevel, key: number): Block | null {
  if (level === "age" || level === "period") {
    if (key >= MILLENNIA_FROM) return null;
    const age = DEEP.find((a) => key < agoKey(a.toAgo)) ?? DEEP[DEEP.length - 1];
    if (level === "age") return deepBlock(age, "age");
    const p = age.periods?.find((s) => key < agoKey(s.toAgo));
    return p ? deepBlock(p, "period") : null;
  }
  if (key < MILLENNIA_FROM) return null;
  const year = yearOfKey(key);
  if (level === "year") return yearBlock(year);
  if (level === "month") {
    const base = timelineSortKey({ year, month: null, day: null });
    const month = Math.min(12, Math.floor((key - base) * 12 + 1e-9) + 1);
    return monthBlock(year, month);
  }
  const size = SIZE[level];
  return sizedBlock(level, Math.floor(Math.abs(year) / size) * size, year < 0);
}

/** Parse a block id back into its block; null for an unknown id. */
export function blockById(id: string): Block | null {
  const deep = DEEP_BY_ID.get(id);
  if (deep) return deepBlock(deep.span, deep.level);
  let m = /^(mil|cen|dec):(\d+)(bc)?$/.exec(id);
  if (m) {
    const level = LEVEL_OF_PREFIX[m[1]];
    const n = Number(m[2]);
    if (n % SIZE[level] !== 0) return null;
    const b = sizedBlock(level, n, m[3] === "bc");
    return b.from >= MILLENNIA_FROM ? b : null;
  }
  m = /^yr:(\d+)(bc)?$/.exec(id);
  if (m && Number(m[1]) > 0) return yearBlock(m[2] ? -Number(m[1]) : Number(m[1]));
  m = /^mo:(\d+)(bc)?-(\d{2})$/.exec(id);
  if (m && Number(m[1]) > 0 && Number(m[3]) >= 1 && Number(m[3]) <= 12) {
    return monthBlock(m[2] ? -Number(m[1]) : Number(m[1]), Number(m[3]));
  }
  return null;
}

const CHILD_LEVEL: Partial<Record<BlockLevel, BlockLevel>> = {
  age: "period",
  millennium: "century",
  century: "decade",
  decade: "year",
  year: "month",
};

/** A block's children, oldest first; empty for months, periods and ages without periods. */
export function childrenOf(block: Block): Block[] {
  if (block.level === "age") {
    const span = DEEP_BY_ID.get(block.id)?.span;
    return (span?.periods ?? []).map((p) => deepBlock(p, "period"));
  }
  const level = CHILD_LEVEL[block.level];
  if (!level || level === "period") return [];
  // The canonical range: the top blocks stretch to ±∞ at the ends of time.
  const range = blockById(block.id) ?? block;
  const out: Block[] = [];
  let key = range.from;
  while (key < range.to) {
    const child = blockOf(level, key);
    if (!child || child.to <= key) break;
    out.push(child);
    key = child.to;
  }
  return out;
}

/** The top of the tree: the deep ages, then every millennium to the end of the current one. */
export const TOP_BLOCKS: readonly Block[] = [
  ...DEEP.map((a) => deepBlock(a, "age")),
  ...Array.from({ length: 10 }, (_, i) => sizedBlock("millennium", 9000 - i * 1000, true)),
  sizedBlock("millennium", 0, false),
  sizedBlock("millennium", 1000, false),
  { ...sizedBlock("millennium", 2000, false), to: Number.POSITIVE_INFINITY },
];

/** Every block holding `key`, top to bottom (age → period, or millennium → month). */
export function blockPath(key: number): Block[] {
  const levels: BlockLevel[] =
    key < MILLENNIA_FROM ? ["age", "period"] : ["millennium", "century", "decade", "year", "month"];
  return levels.flatMap((l) => blockOf(l, key) ?? []);
}

/** Where `key` sits inside a block, 0..1 — logarithmic in years ago for deep time, linear otherwise. */
export function fractionIn(block: Block, key: number): number {
  let t: number;
  if (block.level === "age" || block.level === "period") {
    const from = Number.isFinite(block.from) ? block.from : agoKey(DEEP[0].fromAgo);
    const ago = (k: number) => Math.log10(Math.max(1, PRESENT - k));
    t = (ago(from) - ago(key)) / (ago(from) - ago(block.to));
  } else {
    const to = Number.isFinite(block.to) ? block.to : block.from + 1000;
    t = (key - block.from) / (to - block.from);
  }
  return Math.min(Math.max(Number.isFinite(t) ? t : 0, 0), 1);
}

// ── Captions ───────────────────────────────────────────────────────────

function ordinalEn(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

function agoText(ago: number, lang: TimelineLang): string {
  const unit =
    ago >= 1e9
      ? { v: ago / 1e9, en: "bn", de: "Mrd." }
      : ago >= 1e6
        ? { v: ago / 1e6, en: "m", de: "Mio." }
        : { v: ago / 1e3, en: "k", de: "Tsd." };
  const v = Number(unit.v.toPrecision(3));
  return lang === "de" ? `${String(v).replace(".", ",")} ${unit.de}` : `${v}${unit.en}`;
}

/**
 * A block's date range as a reader says it: "1990s", „1990er“, "440s BC",
 * "20th century", „2. Jahrtausend v. Chr.“, "1994", "July 1994",
 * "252m – 66m years ago".
 */
export function blockLabel(block: Block, lang: TimelineLang): string {
  const de = lang === "de";
  const deep = DEEP_BY_ID.get(block.id);
  if (deep) {
    const { fromAgo, toAgo } = deep.span;
    return de
      ? `vor ${agoText(fromAgo, lang)} – ${agoText(toAgo, lang)} Jahren`
      : `${agoText(fromAgo, lang)} – ${agoText(toAgo, lang)} years ago`;
  }
  const bcSuffix = block.id.endsWith("bc") || /bc-\d\d$/.test(block.id);
  const bc = bcSuffix ? (de ? " v. Chr." : " BC") : "";
  const m = /^(mil|cen|dec):(\d+)/.exec(block.id);
  if (m) {
    const n = Number(m[2]);
    const level = LEVEL_OF_PREFIX[m[1]];
    if (level === "decade") {
      if (n === 0)
        return bcSuffix ? (de ? "9–1 v. Chr." : "9–1 BC") : de ? "1–9 n. Chr." : "AD 1–9";
      if (!bcSuffix && n < 500) return de ? `${n}er n. Chr.` : `AD ${n}s`;
      return de ? `${n}er${bc}` : `${n}s${bc}`;
    }
    const ord = n / SIZE[level] + 1;
    const word =
      level === "century" ? (de ? "Jahrhundert" : "century") : de ? "Jahrtausend" : "millennium";
    const ad = !bcSuffix && level === "millennium" && ord <= 2 ? (de ? " n. Chr." : " AD") : "";
    return de ? `${ord}. ${word}${bc}${ad}` : `${ordinalEn(ord)} ${word}${bc}${ad}`;
  }
  const year = yearOfKey(block.from);
  if (block.level === "year") return formatDatePart({ year, month: null, day: null }, "year", lang);
  const month =
    Math.round((block.from - timelineSortKey({ year, month: null, day: null })) * 12) + 1;
  return formatDatePart({ year, month, day: null }, "month", lang);
}

/** The block's name — hand-written for ages, periods, millennia, centuries and decades. */
export function blockTitle(block: Block, lang: TimelineLang): string | null {
  const deep = DEEP_BY_ID.get(block.id);
  const name = deep ? deep.span.name : blockName(block.id);
  return name ? name[lang] : null;
}

// ── The tree ───────────────────────────────────────────────────────────

/** A member's hand on the automatic cut: split one level deeper, or fold to a summary. */
export type BlockOverride = "split" | "fold";

export interface BlockNode<T> {
  kind: "node";
  /** The header: one block, or a chain of blocks with a single busy child each, top first. */
  chain: Block[];
  /** The deepest block of the chain — the one whose contents this node shows. */
  block: Block;
  mode: "split" | "leaf" | "folded";
  /** Every item inside, oldest first. */
  items: T[];
  /** Split mode: items too coarse for the children ("1960s", "c. 13th century"), shown at the top. */
  loose: T[];
  /** Split mode: the children with pins, and quiet gaps for the runs without. */
  children: BlockEntry<T>[];
  /** The children's level exists and would separate the items: a split is possible. */
  canSplit: boolean;
}

export interface QuietGap {
  kind: "gap";
  from: number;
  to: number;
  /** The blocks the gap stands for. */
  blocks: number;
}

export type BlockEntry<T> = BlockNode<T> | QuietGap;

export interface TreeOptions<T = unknown> {
  /** A block holding more pins than this splits (when its children separate them). */
  capacity: number;
  /**
   * Whether a block's pins crowd it — the layout's own measure (cards
   * pushed far from their dots). Replaces the plain `capacity` count.
   */
  crowded?: (items: readonly T[], block: Block) => boolean;
  overrides: Readonly<Record<string, BlockOverride>>;
}

export const DEFAULT_CAPACITY = 4;

/** The finest block level an item's date can sit in: a year-precise date can't go into a month. */
const PRECISION_DEPTH: Record<TimelinePrecision, number> = {
  megayear: 0,
  millennium: 0,
  century: 1,
  decade: 2,
  year: 3,
  month: 4,
  day: 4,
};
const LEVEL_DEPTH: Record<BlockLevel, number> = {
  age: 0,
  period: 0,
  millennium: 0,
  century: 1,
  decade: 2,
  year: 3,
  month: 4,
};

export interface Placed {
  key: number;
  precision: TimelinePrecision;
}

function fits(p: Placed, child: Block): boolean {
  if (child.level === "period") return true;
  return LEVEL_DEPTH[child.level] <= PRECISION_DEPTH[p.precision];
}

function node<T>(
  chain: Block[],
  items: T[],
  place: (t: T) => Placed,
  o: TreeOptions<T>,
  forced: boolean,
): BlockNode<T> {
  const block = chain[chain.length - 1];
  const kids = childrenOf(block);
  const loose: T[] = [];
  const buckets = kids.map(() => [] as T[]);
  for (const it of items) {
    const p = place(it);
    const k = kids.findIndex((c) => p.key < c.to);
    const at = k < 0 ? kids.length - 1 : k;
    if (at < 0 || !fits(p, kids[at])) loose.push(it);
    else buckets[at].push(it);
  }
  const busy = buckets.filter((b) => b.length > 0).length;
  const canSplit = busy >= 2 || (busy === 1 && loose.length > 0);
  const leaf = (): BlockNode<T> => ({
    kind: "node",
    chain,
    block,
    mode: "leaf",
    items,
    loose: [],
    children: [],
    canSplit,
  });

  if (o.overrides[block.id] === "fold") return { ...leaf(), mode: "folded" };
  const wantSplit =
    forced ||
    o.overrides[block.id] === "split" ||
    (o.crowded ? o.crowded(items, block) : items.length > o.capacity);
  if (!wantSplit || busy === 0) return leaf();
  if (busy === 1 && loose.length === 0) {
    // One busy child and nothing loose: pass straight through to it, one
    // header for the chain. A forced split carries on down, so the member's
    // tap always shows a finer cut.
    const k = buckets.findIndex((b) => b.length > 0);
    return node([...chain, kids[k]], items, place, o, forced || o.overrides[block.id] === "split");
  }
  if (!canSplit) return leaf();

  const children: BlockEntry<T>[] = [];
  for (let k = 0; k < kids.length; k++) {
    if (buckets[k].length > 0) {
      children.push(node([kids[k]], buckets[k], place, o, false));
      continue;
    }
    const last = children[children.length - 1];
    if (last?.kind === "gap") {
      last.to = kids[k].to;
      last.blocks++;
    } else children.push({ kind: "gap", from: kids[k].from, to: kids[k].to, blocks: 1 });
  }
  return { kind: "node", chain, block, mode: "split", items, loose, children, canSplit };
}

/**
 * Cut the timeline for these items: the top blocks that hold any (quiet
 * runs between them as gaps), each split as deep as its pins need.
 * `place` gives an item's sort key and precision; items come back oldest
 * first within every node.
 */
export function buildBlockTree<T>(
  items: readonly T[],
  place: (t: T) => Placed,
  opts: Partial<TreeOptions<T>> = {},
): BlockEntry<T>[] {
  const o: TreeOptions<T> = { capacity: DEFAULT_CAPACITY, overrides: {}, ...opts };
  const sorted = [...items].sort((a, b) => place(a).key - place(b).key);
  const buckets = TOP_BLOCKS.map(() => [] as T[]);
  for (const it of sorted) {
    const key = place(it).key;
    const k = TOP_BLOCKS.findIndex((b) => key < b.to);
    buckets[k < 0 ? TOP_BLOCKS.length - 1 : k].push(it);
  }
  const first = buckets.findIndex((b) => b.length > 0);
  if (first < 0) return [];
  let last = buckets.length - 1;
  while (buckets[last].length === 0) last--;

  const out: BlockEntry<T>[] = [];
  for (let k = first; k <= last; k++) {
    const top = TOP_BLOCKS[k];
    if (buckets[k].length > 0) {
      out.push(node([top], buckets[k], place, o, false));
      continue;
    }
    const prev = out[out.length - 1];
    if (prev?.kind === "gap") {
      prev.to = top.to;
      prev.blocks++;
    } else out.push({ kind: "gap", from: top.from, to: top.to, blocks: 1 });
  }
  return out;
}

/** "1,400 quiet years" / „1.400 stille Jahre“ — the caption of a gap. */
export function gapLabel(gap: QuietGap, lang: TimelineLang): string {
  const span = formatSpan(gap.to - gap.from, lang);
  return lang === "de"
    ? span.replace(/Jahre?$/, "stille Jahre")
    : span.replace(/years?$/, "quiet years");
}
