import type { ReactNode } from "react";

// Search-result highlighting: the matched tokens wrapped in a neutral <mark>.
// Matching is case- and diacritic-insensitive per UTF-16 unit, so "Boerse"
// still lights "Börse" and the ranges map straight back onto the original
// text. Best-effort by design — the server's index decides what matched;
// this only shows why.

function foldUnit(c: string): string {
  const base = c.normalize("NFD")[0] ?? c;
  const lower = base.toLowerCase();
  return lower.length === 1 ? lower : c;
}

export function foldText(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) out += foldUnit(text[i]);
  return out;
}

export function searchTokens(q: string): string[] {
  return q
    .split(/\s+/)
    .map((t) => foldText(t.trim()))
    .filter((t) => t.length >= 2)
    .slice(0, 6);
}

/** Merged `[start, end)` ranges of every token occurrence in `text`. */
export function matchRanges(text: string, tokens: readonly string[]): [number, number][] {
  const folded = foldText(text);
  const raw: [number, number][] = [];
  for (const token of tokens) {
    if (!token) continue;
    let from = 0;
    for (;;) {
      const at = folded.indexOf(token, from);
      if (at < 0) break;
      raw.push([at, at + token.length]);
      from = at + token.length;
    }
  }
  raw.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

export function highlight(text: string, tokens: readonly string[]): ReactNode {
  const ranges = matchRanges(text, tokens);
  if (ranges.length === 0) return text;
  const out: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) out.push(text.slice(cursor, start));
    out.push(
      <mark key={start} className="rounded-sm bg-fill-strong px-0.5 text-fg-strong">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

export function hasMatch(text: string, tokens: readonly string[]): boolean {
  return matchRanges(text, tokens).length > 0;
}
