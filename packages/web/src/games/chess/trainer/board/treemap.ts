/**
 * Squarified treemap layout (Bruls, Huizing, van Wijk): rectangles whose
 * areas are proportional to the values, laid in rows along the shorter side so
 * they stay close to square. Values are laid out largest first; zero and
 * negative values get no rectangle.
 *
 * Blocks smaller than `wideBelow` (an area, in the box's units) are laid on
 * their side instead: a small block's label reads across and a narrow column
 * can't fit it. The bigger blocks are squarified as usual and leave exactly
 * the small ones' area; that last box is cut into columns of wide bands
 * (`bands`), as many columns as keep every band widest.
 */
export interface TreemapRect<T> {
  readonly item: T;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** How far a rectangle is from square (1 = square). */
const aspect = (w: number, h: number) => Math.max(w / h, h / w);

export function squarify<T>(
  items: readonly T[],
  weightOf: (item: T) => number,
  width: number,
  height: number,
  wideBelow = 0,
): TreemapRect<T>[] {
  const sorted = items.filter((i) => weightOf(i) > 0).sort((a, b) => weightOf(b) - weightOf(a));
  const sum = sorted.reduce((t, i) => t + weightOf(i), 0);
  if (sum === 0 || width <= 0 || height <= 0) return [];
  const area = (i: T) => (weightOf(i) / sum) * width * height;
  const small = sorted.filter((i) => area(i) < wideBelow);
  // Every block small: no squarified part, the whole box is bands.
  const head = small.length === sorted.length ? [] : sorted.slice(0, sorted.length - small.length);
  const out: TreemapRect<T>[] = [];
  let x = 0;
  let y = 0;
  let w = width;
  let h = height;
  let rest = head;
  while (rest.length > 0) {
    const side = Math.min(w, h);
    let row: T[] = [];
    let best = Number.POSITIVE_INFINITY;
    for (const it of rest) {
      const next = [...row, it];
      const s = next.reduce((t, z) => t + area(z), 0);
      const thick = s / side;
      const worst = Math.max(...next.map((z) => aspect(thick, area(z) / thick)));
      if (worst > best) break;
      row = next;
      best = worst;
    }
    const thick = row.reduce((t, z) => t + area(z), 0) / side;
    let off = 0;
    for (const it of row) {
      const len = area(it) / thick;
      out.push(
        w >= h
          ? { item: it, x, y: y + off, w: thick, h: len }
          : { item: it, x: x + off, y, w: len, h: thick },
      );
      off += len;
    }
    if (w >= h) {
      x += thick;
      w -= thick;
    } else {
      y += thick;
      h -= thick;
    }
    rest = rest.slice(row.length);
  }
  const tail = head.length === sorted.length ? [] : sorted.slice(head.length);
  if (tail.length > 0) out.push(...bands(tail, area, x, y, w));
  return out;
}

/**
 * `items` in the box as wide bands: split into columns of about equal area,
 * each column a stack of full-width bands. The column count is the one whose
 * least wide band is widest (a band taller than wide counts double).
 */
function bands<T>(
  items: readonly T[],
  area: (item: T) => number,
  x: number,
  y: number,
  w: number,
): TreemapRect<T>[] {
  const total = items.reduce((t, i) => t + area(i), 0);
  let best: { cost: number; rects: TreemapRect<T>[] } | null = null;
  for (let cols = 1; cols <= items.length; cols++) {
    // Contiguous columns, each closed once it reaches its share of the area.
    const groups: T[][] = [[]];
    let filled = 0;
    for (const [i, it] of items.entries()) {
      groups[groups.length - 1]?.push(it);
      filled += area(it);
      const itemsLeft = items.length - i - 1;
      const colsLeft = cols - groups.length;
      if (
        colsLeft > 0 &&
        itemsLeft >= colsLeft &&
        (filled >= (total * groups.length) / cols || itemsLeft === colsLeft)
      )
        groups.push([]);
    }
    const rects: TreemapRect<T>[] = [];
    let cx = x;
    let cost = 0;
    for (const g of groups) {
      const gArea = g.reduce((t, i) => t + area(i), 0);
      const cw = (gArea / total) * w;
      let cy = y;
      for (const it of g) {
        const bh = area(it) / cw;
        rects.push({ item: it, x: cx, y: cy, w: cw, h: bh });
        cost = Math.max(cost, bh > cw ? (bh / cw) * 2 : cw / bh);
        cy += bh;
      }
      cx += cw;
    }
    if (!best || cost < best.cost) best = { cost, rects };
  }
  return best?.rects ?? [];
}
