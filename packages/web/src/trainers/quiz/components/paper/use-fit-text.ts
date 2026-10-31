import { type RefObject, useLayoutEffect, useRef, useState } from "react";

// How a newspaper sets a story into a box of fixed size. A short story is set
// larger rather than leave a hole under it: the font grows between `min` and
// `max` px until the text just fills the box. A story too long for the box at
// `min` is cut the way a paper cuts it — at the foot of its last column, after
// a whole sentence where one ends close by, else after the last word that
// fits — with room left for the "Continued on page A2" jump the caller
// prints after it. Never a fade, never half a line.
//
// The box is the returned ref: a fixed-size element (columns with
// `column-fill: auto`, or one column) whose paragraphs carry `data-para={i}`.
// `cut` says where the text stops: paragraph `para`, after `chars` characters
// of its text; null = the whole story fits. Re-measures when the box resizes
// and once the web fonts have loaded. `lines` is how many lines of `min`
// text the box holds (a drop cap needs about four).

export interface TextCut {
  para: number;
  chars: number;
  /** Cut mid-sentence: print an ellipsis before the jump. */
  ellipsis: boolean;
}

/** Room kept at the end of the last line for the jump line, in em. */
const JUMP_EM = 16;

export function useFitText<T extends HTMLElement>(
  min: number,
  max: number,
  key: unknown,
): { ref: RefObject<T | null>; cut: TextCut | null; lines: number } {
  const ref = useRef<T | null>(null);
  const [cut, setCut] = useState<TextCut | null>(null);
  const [lines, setLines] = useState(99);
  const [pass, setPass] = useState(0);

  // Any change to the box or the text starts a fresh measure on the uncut story.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let size = `${el.clientWidth}x${el.clientHeight}`;
    let live = true;
    const again = () => {
      if (!live) return;
      setCut(null);
      setPass((p) => p + 1);
    };
    again();
    void document.fonts?.ready.then(again);
    const observer = new ResizeObserver(() => {
      const next = `${el.clientWidth}x${el.clientHeight}`;
      if (next === size) return;
      size = next;
      again();
    });
    observer.observe(el);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [key]);

  // The paragraphs' full texts at the last measure, for stepping a cut back.
  const texts = useRef(new Map<number, string>());

  // biome-ignore lint/correctness/useExhaustiveDependencies: `pass` and `key` ask for a re-measure.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fits = () =>
      el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
    if (cut !== null) {
      // The jump line is set now: if it spilled out of the box, end a word earlier.
      if (fits() || cut.chars === 0) return;
      const earlier = wordEnds(texts.current.get(cut.para) ?? "").filter((e) => e < cut.chars);
      setCut({ para: cut.para, chars: earlier.pop() ?? 0, ellipsis: true });
      return;
    }
    el.style.fontSize = `${min}px`;
    const css = getComputedStyle(el);
    const line = Number.parseFloat(css.lineHeight) || min * 1.6;
    setLines(Math.floor(el.clientHeight / line));
    el.style.fontSize = `${max}px`;
    if (fits()) return;
    let lo = min;
    let hi = max;
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2;
      el.style.fontSize = `${mid}px`;
      if (fits()) lo = mid;
      else hi = mid;
    }
    el.style.fontSize = `${lo}px`;
    if (fits()) return;
    texts.current = new Map(
      [...el.querySelectorAll<HTMLElement>("[data-para]")].map((p) => [
        Number(p.dataset.para),
        p.textContent ?? "",
      ]),
    );
    setCut(findCut(el) ?? { para: 0, chars: 0, ellipsis: false });
  }, [cut, pass, key, min, max]);

  return { ref, cut, lines };
}

/**
 * Where the story stops: after the last whole paragraph that fits, inside the
 * next one at its last fitting sentence — or, when that would leave more than
 * two lines empty, at its last fitting word (with an ellipsis), the way a
 * column runs to its foot before the jump.
 */
function findCut(el: HTMLElement): TextCut | null {
  const box = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  const fontPx = Number.parseFloat(style.fontSize) || 16;
  const linePx = Number.parseFloat(style.lineHeight) || fontPx * 1.6;
  const gap = Number.parseFloat(style.columnGap) || 0;
  const count = Number.parseInt(style.columnCount, 10) || 1;
  const colW = (box.width - gap * (count - 1)) / count;
  const jumpPx = JUMP_EM * fontPx * 0.62;
  const colOf = (r: DOMRect) => Math.max(0, Math.floor((r.left - box.left + 1) / (colW + gap)));

  /** How far down the story an end reaches (columns laid end to end), or null if it doesn't fit. */
  const reach = (p: HTMLElement, offset: number): number | null => {
    const rects = [...(rangeTo(p, offset)?.getClientRects() ?? [])].filter((r) => r.width > 0);
    if (rects.length === 0) return null;
    for (const r of rects) {
      if (r.bottom > box.bottom + 0.5 || r.right > box.right + 1) return null;
    }
    const last = rects[rects.length - 1];
    const col = colOf(last);
    const colRight = box.left + col * (colW + gap) + colW;
    const room = last.right + jumpPx <= colRight || last.bottom + linePx <= box.bottom + 0.5;
    return room ? col * box.height + (last.bottom - box.top) : null;
  };

  let best: TextCut | null = null;
  for (const p of el.querySelectorAll<HTMLElement>("[data-para]")) {
    const para = Number(p.dataset.para);
    const text = p.textContent ?? "";
    const whole = text.trimEnd().length;
    if (reach(p, whole) !== null) {
      best = { para, chars: whole, ellipsis: false };
      continue;
    }
    // The last word end that fits (ends fit as a prefix, so binary search).
    const words = wordEnds(text);
    let lo = -1;
    let hi = words.length;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (reach(p, words[mid]) !== null) lo = mid;
      else hi = mid;
    }
    if (lo < 0) break;
    const word = words[lo];
    const wordReach = reach(p, word) ?? 0;
    const sentence = sentenceEnds(text)
      .filter((e) => e <= word)
      .pop();
    const sentenceReach = sentence === undefined ? null : reach(p, sentence);
    best =
      sentence !== undefined && sentenceReach !== null && wordReach - sentenceReach <= 2 * linePx
        ? { para, chars: sentence, ellipsis: false }
        : { para, chars: word, ellipsis: true };
    break;
  }
  return best;
}

/** Character offsets just after each word of `text`. */
function wordEnds(text: string): number[] {
  const ends: number[] = [];
  const re = /\S+/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    // A word ending in a comma or dash reads badly before "…": end before it.
    ends.push(m.index + m[0].replace(/[,;:–—-]+$/, "").length);
  }
  return ends;
}

/** Character offsets just after each sentence of `text` (the last is its end). */
function sentenceEnds(text: string): number[] {
  const ends: number[] = [];
  const re = /[.!?…]["'”’»)]*(?=\s+\S)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) ends.push(m.index + m[0].length);
  const trimmed = text.trimEnd().length;
  if (trimmed > 0 && ends[ends.length - 1] !== trimmed) ends.push(trimmed);
  return ends;
}

/** A range from the start of `p` to character `offset` of its text. */
function rangeTo(p: HTMLElement, offset: number): Range | null {
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  let left = offset;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = n.textContent?.length ?? 0;
    if (left <= len) {
      const range = document.createRange();
      range.setStart(p, 0);
      range.setEnd(n, left);
      return range;
    }
    left -= len;
  }
  return null;
}
