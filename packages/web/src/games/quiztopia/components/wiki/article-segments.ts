import type { AnswerSpan } from "@boardgames/core/games/quiztopia/content-types";

// An article split into BLOCKS — paragraphs, the Markdown-style tables most
// articles close with, and bullet / numbered lists — and, inside each, into
// plain text and the five answer marks. Everything is built from the
// importer's `answerSpans` ([start, length] in UTF-16 units) by slicing the
// original text at known offsets — never from `indexOf`, which would find
// the wrong "Berlin" in a text that mentions it three times, and never by
// transforming the text first, which would shift every offset.

export type ArticleSegment =
  | { kind: "text"; text: string; offset: number }
  | { kind: "mark"; q: number; text: string; offset: number };

export type ArticleBlock =
  | { kind: "paragraph"; offset: number; segments: ArticleSegment[] }
  | { kind: "list"; offset: number; ordered: boolean; items: ArticleSegment[][] }
  | {
      kind: "table";
      offset: number;
      header: ArticleSegment[][] | null;
      rows: ArticleSegment[][][];
    };

/** @deprecated kept for callers that only want flat paragraphs. */
export type ArticleParagraph = ArticleSegment[];

const BLOCK_BREAK = /\n[ \t]*\n+/g;
const LIST_MARKER = /^[ \t]*(?:[-*•]|\d+[.)])[ \t]+/;
const TABLE_SEPARATOR = /^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/;

interface Mark {
  start: number;
  end: number;
  q: number;
}

function sortedMarks(text: string, spans: readonly AnswerSpan[]): Mark[] {
  const marks = spans
    .map(([start, len], q) => ({ start, end: start + len, q }))
    .filter((m) => m.start >= 0 && m.end <= text.length && m.end > m.start)
    .sort((a, b) => a.start - b.start || a.q - b.q);
  // Overlapping spans (two answers sharing a word) keep the earlier one.
  const out: Mark[] = [];
  let cursor = 0;
  for (const m of marks) {
    if (m.start < cursor) continue;
    out.push(m);
    cursor = m.end;
  }
  return out;
}

/** Segments for `text[from, to)`; a mark straddling the range edge is plain text. */
function slice(text: string, marks: readonly Mark[], from: number, to: number): ArticleSegment[] {
  const out: ArticleSegment[] = [];
  let cursor = from;
  for (const m of marks) {
    if (m.end <= from || m.start >= to) continue;
    if (m.start < from || m.end > to) continue;
    if (m.start > cursor)
      out.push({ kind: "text", text: text.slice(cursor, m.start), offset: cursor });
    out.push({ kind: "mark", q: m.q, text: text.slice(m.start, m.end), offset: m.start });
    cursor = m.end;
  }
  if (cursor < to) out.push({ kind: "text", text: text.slice(cursor, to), offset: cursor });
  return out;
}

/** Trim leading/trailing whitespace off a range without touching the text. */
function trimRange(text: string, from: number, to: number): [number, number] {
  let a = from;
  let b = to;
  while (a < b && /\s/.test(text[a])) a++;
  while (b > a && /\s/.test(text[b - 1])) b--;
  return [a, b];
}

interface Line {
  from: number;
  to: number;
}

function linesOf(text: string, from: number, to: number): Line[] {
  const lines: Line[] = [];
  let start = from;
  for (let i = from; i < to; i++) {
    if (text[i] === "\n") {
      lines.push({ from: start, to: i });
      start = i + 1;
    }
  }
  lines.push({ from: start, to });
  return lines.filter((l) => text.slice(l.from, l.to).trim().length > 0);
}

function tableCells(text: string, marks: readonly Mark[], line: Line): ArticleSegment[][] {
  const raw = text.slice(line.from, line.to);
  const pipes: number[] = [];
  for (let i = 0; i < raw.length; i++) if (raw[i] === "|") pipes.push(line.from + i);
  // A row may omit its outer pipes; treat the line edges as boundaries then.
  const bounds = [...pipes];
  if (raw.trimStart()[0] !== "|") bounds.unshift(line.from - 1);
  if (raw.trimEnd().at(-1) !== "|") bounds.push(line.to);
  const cells: ArticleSegment[][] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const [a, b] = trimRange(text, bounds[i] + 1, bounds[i + 1]);
    cells.push(slice(text, marks, a, b));
  }
  return cells;
}

export function segmentArticle(text: string, spans: readonly AnswerSpan[]): ArticleBlock[] {
  const marks = sortedMarks(text, spans);
  const blocks: ArticleBlock[] = [];
  let from = 0;
  const ranges: [number, number][] = [];
  for (const m of text.matchAll(BLOCK_BREAK)) {
    ranges.push([from, m.index]);
    from = m.index + m[0].length;
  }
  ranges.push([from, text.length]);

  for (const [rawFrom, rawTo] of ranges) {
    const [start, end] = trimRange(text, rawFrom, rawTo);
    if (start >= end) continue;
    const lines = linesOf(text, start, end);
    const isTable = lines.every((l) => text.slice(l.from, l.to).trimStart().startsWith("|"));
    const isList = lines.every((l) => LIST_MARKER.test(text.slice(l.from, l.to)));

    if (isTable && lines.length > 0) {
      const body = lines.filter((l) => !TABLE_SEPARATOR.test(text.slice(l.from, l.to)));
      const hasHeader =
        lines.length > 1 && TABLE_SEPARATOR.test(text.slice(lines[1].from, lines[1].to));
      const rows = body.map((l) => tableCells(text, marks, l));
      blocks.push({
        kind: "table",
        offset: start,
        header: hasHeader ? (rows.shift() ?? null) : null,
        rows,
      });
      continue;
    }
    if (isList && lines.length > 0) {
      const ordered = /^[ \t]*\d/.test(text.slice(lines[0].from, lines[0].to));
      const items = lines.map((l) => {
        const marker = LIST_MARKER.exec(text.slice(l.from, l.to));
        const [a, b] = trimRange(text, l.from + (marker?.[0].length ?? 0), l.to);
        return slice(text, marks, a, b);
      });
      blocks.push({ kind: "list", offset: start, ordered, items });
      continue;
    }
    blocks.push({ kind: "paragraph", offset: start, segments: slice(text, marks, start, end) });
  }
  return blocks;
}

function walk(block: ArticleBlock, fn: (seg: ArticleSegment) => void): void {
  if (block.kind === "paragraph") for (const s of block.segments) fn(s);
  else if (block.kind === "list") for (const item of block.items) for (const s of item) fn(s);
  else {
    for (const cell of block.header ?? []) for (const s of cell) fn(s);
    for (const row of block.rows) for (const cell of row) for (const s of cell) fn(s);
  }
}

/** Which of the five questions actually got a mark (an overlapping span drops out). */
export function markedQuestions(blocks: readonly ArticleBlock[]): Set<number> {
  const out = new Set<number>();
  for (const b of blocks) walk(b, (s) => s.kind === "mark" && out.add(s.q));
  return out;
}

// ── Inline emphasis ─────────────────────────────────────────────────────
//
// Articles occasionally use `**bold**` and `*italic*`. The markers are
// dropped at render time by toggling a style state while walking the
// segments, so a mark inside bold text stays a mark and every offset stays
// what the importer computed.

export interface InlineRun {
  seg: ArticleSegment;
  bold: boolean;
  italic: boolean;
}

export function inlineRuns(segments: readonly ArticleSegment[]): InlineRun[] {
  const runs: InlineRun[] = [];
  let bold = false;
  let italic = false;
  for (const seg of segments) {
    if (seg.kind === "mark") {
      runs.push({ seg, bold, italic });
      continue;
    }
    const parts = seg.text.split(/(\*\*|\*)/);
    let offset = seg.offset;
    for (const part of parts) {
      if (part === "**") bold = !bold;
      else if (part === "*") italic = !italic;
      else if (part.length > 0)
        runs.push({ seg: { kind: "text", text: part, offset }, bold, italic });
      offset += part.length;
    }
  }
  return runs;
}
