// Where a feature's photo goes, the way a paper sets a picture: across the
// whole column, or at its left edge with the text running down its right —
// never floating in a gap of its own.
//
// A photo spans the column when it is a landscape of about 3:2 or wider and
// its file is big enough to fill the column without going soft. Every other
// photo is set at the left, sized as close to its own file's width (at most
// half the column) and trimmed as little as lets the rule under its caption
// sit exactly on the baseline of the last line of a paragraph beside it
// (`alignFloats`). Where nothing does that, a landscape photo takes half the
// column — shrunk until at least three lines of text run on under it, so no
// gap opens beside it — and any other photo spans the column if its file is
// big enough.

/** At least this wide (w / h) to span the column. */
const SPAN_RATIO = 1.43;
/** Pixels the file needs, at least, to span the column. */
const SPAN_PIXELS = 700;
/** A set-left photo is never narrower than this share of the column… */
const MIN_SHARE = 0.18;
/** …nor than this many pixels. */
const MIN_PIXELS = 140;
/** Paragraphs past the photo its foot may line up with. */
const MAX_PARAGRAPHS = 6;
/** Widths sampled between the narrowest and widest allowed. */
const SAMPLES = 16;
/** How much of a picture may be trimmed (top and bottom, or the sides): a
 *  light trim first, a firmer one only when the light one finds no fit. */
const TRIMS = [0.2, 0.35] as const;
/** Paragraphs further down a photo may move to find a fit. */
const MOVES = 2;
/** With no fit, a file at least this share of the column wide spans it. */
const SPAN_FALLBACK = 0.7;
/** Lines of text a landscape photo without a fit must leave running under it. */
const LINES_BELOW = 3;
/** Pixels between the widths tried while shrinking such a photo. */
const SHRINK_STEP = 2;
/** Re-measures while the lines beside a resized photo rewrap. */
const ROUNDS = 6;
/** How close (px) the photo's foot must come to the baseline to count as on it. */
const TOLERANCE = 0.5;

export function photoSpans(width?: number, height?: number): boolean {
  if (!width || !height) return false;
  return width / height >= SPAN_RATIO && width >= SPAN_PIXELS;
}

/**
 * The widths a set-left photo may take: from a floor up to half the column.
 * `natural` is the width it would rather keep (its file's own, or half the
 * column); `pickFit` prefers fits close to it.
 */
export function floatBounds(
  natural: number,
  column: number,
): { min: number; max: number; natural: number } {
  const max = column / 2;
  const prefer = Math.min(natural, max);
  return { min: Math.min(prefer, Math.max(MIN_PIXELS, column * MIN_SHARE)), max, natural: prefer };
}

export interface FloatFit {
  width: number;
  /** The picture's height; its own proportions give `width × ratio`. */
  height: number;
  /** How much of the picture is trimmed away (0 = none). */
  trim: number;
}

/** Of the fits found, the least trimmed, then the one closest to the photo's own width. */
export function pickFit(fits: readonly FloatFit[], natural: number): FloatFit | null {
  let best: FloatFit | null = null;
  const score = (f: FloatFit) => f.trim * 4 + Math.abs(f.width - natural) / natural;
  for (const f of fits) if (!best || score(f) < score(best)) best = f;
  return best;
}

/**
 * Sizes every set-left photo (`figure[data-float]`) of a feature column, in
 * reading order, so the rule under its caption meets the baseline of a
 * following paragraph's last line (the paragraphs end in `[data-para-end]`,
 * an empty inline-block sitting on the baseline).
 *
 * Width alone can't do it: the text beside a photo reflows almost as fast as
 * the photo grows, so its foot only travels about a third of a paragraph
 * against the text. So at each sampled width the picture's height is also
 * trimmed or let out a little (top and bottom, or the sides — `TRIMS`),
 * re-measuring as the lines beside it rewrap, until foot and baseline meet;
 * and with `search` the photo may also start beside one of the next
 * paragraphs instead (`MOVES`), when its own place has no fit. The least
 * trimmed fit nearest its own place wins. With no fit at all, a big file
 * spans the column and a small one stays at the left at its own size.
 *
 * Returns, with `search`, the block each photo should follow (by its
 * `data-key`) when one moved — the DOM is put back as it was, for React to
 * render the move.
 */
export function alignFloats(column: HTMLElement, search: boolean): Map<string, number> | null {
  const style = getComputedStyle(column);
  const inner =
    column.clientWidth -
    Number.parseFloat(style.paddingLeft) -
    Number.parseFloat(style.paddingRight);
  const figs = [...column.querySelectorAll<HTMLElement>("figure[data-float]")];
  const home = figs.map((f) => ({ fig: f, next: f.nextSibling }));
  const moved = new Map<string, number>();
  let floor = -1; // a photo never moves past the paragraph the one before it starts beside
  for (const fig of figs) {
    const img = fig.querySelector("img");
    const w = Number(fig.dataset.w) || img?.naturalWidth || 0;
    const h = Number(fig.dataset.h) || img?.naturalHeight || 0;
    if (!img || !w || !h) continue; // sized once its file has loaded
    const bounds = floatBounds(w, inner);
    const place = (width: number | "column", height: number | null) => {
      fig.style.float = width === "column" ? "none" : "";
      fig.style.width = width === "column" ? "100%" : `${width}px`;
      img.style.height = height === null ? "" : `${height}px`;
      img.style.objectFit = height === null ? "" : "cover";
      img.style.objectPosition = height === null ? "" : "50% 30%";
    };
    const own = nextBlock(fig);
    const starts = search
      ? [...column.querySelectorAll<HTMLElement>("p[data-block]")].filter((p) => {
          const b = Number(p.dataset.block);
          return b >= own && b > floor && b <= own + MOVES;
        })
      : [];
    let best: { fit: FloatFit; start: HTMLElement | null; score: number } | null = null;
    for (const start of starts.length > 0 ? starts : [null]) {
      if (start) start.before(fig);
      const after = [...column.querySelectorAll<HTMLElement>("[data-para-end]")]
        .filter((e) => fig.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING)
        .slice(0, MAX_PARAGRAPHS);
      const shift = start ? Number(start.dataset.block) - own : 0;
      for (const trim of TRIMS) {
        const fit = pickFit(findFits(fig, after, h / w, bounds, trim, place), bounds.natural);
        if (!fit) continue;
        const score = fit.trim * 4 + Math.abs(fit.width - bounds.natural) / bounds.natural + shift;
        if (!best || score < best.score) best = { fit, start, score };
        break;
      }
      if (best && shift === 0) break; // its own place fits: no need to move it
    }
    // Nothing lines up and it's a landscape: half the column, shrunk until
    // three lines run on under it, in the first place where that works.
    let roomy: { width: number; start: HTMLElement | null } | null = null;
    if (!best && w > h) {
      for (const start of starts.length > 0 ? starts : [null]) {
        if (start) start.before(fig);
        const width = widestWithRoom(fig, column, bounds, place);
        if (width !== null) {
          roomy = { width, start };
          break;
        }
      }
    }
    const chosen = best ?? roomy;
    if (chosen?.start) chosen.start.before(fig);
    else if (starts[0]) starts[0].before(fig);
    if (chosen) {
      const block = chosen.start ? Number(chosen.start.dataset.block) : own;
      if (block !== own && fig.dataset.key) moved.set(fig.dataset.key, block - 1);
    }
    if (best) place(best.fit.width, best.fit.height);
    else if (roomy) place(roomy.width, null);
    // Still nothing: a landscape, or a file big enough, spans the column (no
    // gap beside it); a small portrait stays at the left at its own size.
    else if (w > h || w >= inner * SPAN_FALLBACK) place("column", null);
    else place(bounds.natural, null);
    floor = nextBlock(fig);
  }
  if (moved.size === 0) return null;
  // Put the DOM back as React rendered it; the caller renders the moves.
  for (const { fig, next } of home) column.insertBefore(fig, next);
  return moved;
}

/** The block a photo stands before (its next paragraph, list or table). */
function nextBlock(fig: HTMLElement): number {
  for (let el = fig.nextElementSibling; el; el = el.nextElementSibling) {
    const b = (el as HTMLElement).dataset?.block;
    if (b !== undefined) return Number(b);
  }
  return Number.MAX_SAFE_INTEGER;
}

/**
 * The widest width, from half the column down, at which at least
 * `LINES_BELOW` lines of text run on under the photo before anything that
 * can't wrap around it (a table, the next photo, the article's end); null if
 * none does.
 */
function widestWithRoom(
  fig: HTMLElement,
  column: HTMLElement,
  { min, max }: { min: number; max: number },
  place: (width: number, height: number | null) => void,
): number | null {
  const firstPara = column.querySelector<HTMLElement>("[data-para-end]")?.parentElement;
  const line = Number.parseFloat(getComputedStyle(firstPara ?? column).lineHeight);
  // The last of those lines has its baseline in the lower half of its line box.
  const need = Number.parseFloat(getComputedStyle(fig).marginBottom) + (LINES_BELOW - 0.5) * line;
  const following = (sel: string) =>
    [...column.querySelectorAll<HTMLElement>(sel)].filter(
      (e) => e !== fig && fig.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  for (let width = max; width >= min; width -= SHRINK_STEP) {
    place(width, null);
    const stop = following("figure, table")[0]?.getBoundingClientRect().top ?? Infinity;
    const ends = following("[data-para-end]")
      .map((e) => e.getBoundingClientRect().top)
      .filter((top) => top < stop);
    const last = ends.at(-1);
    if (last !== undefined && last - fig.getBoundingClientRect().bottom >= need) return width;
  }
  return null;
}

/** Every width (sampled) and trim within `maxTrim` that puts the photo's foot on a paragraph's baseline. */
function findFits(
  fig: HTMLElement,
  after: readonly HTMLElement[],
  ratio: number,
  { min, max }: { min: number; max: number },
  maxTrim: number,
  place: (width: number, height: number | null) => void,
): FloatFit[] {
  const fits: FloatFit[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const width = min + ((max - min) * i) / SAMPLES;
    const own = width * ratio;
    place(width, null);
    const foot = fig.getBoundingClientRect().bottom;
    after.forEach((end, k) => {
      const gap = end.getBoundingClientRect().top - foot;
      if (Math.abs(gap) > own * maxTrim) return; // out of reach at this width
      let height = own + gap;
      for (let round = 0; round < ROUNDS; round++) {
        if (Math.abs(height / own - 1) > maxTrim) return;
        place(width, height);
        const miss = after[k].getBoundingClientRect().top - fig.getBoundingClientRect().bottom;
        if (Math.abs(miss) <= TOLERANCE) {
          fits.push({ width, height, trim: Math.abs(height / own - 1) });
          return;
        }
        height += miss;
      }
    });
  }
  return fits;
}
