import type { AnswerSpan } from "@boardgames/core/games/quiztopia/content-types";
import { describe, expect, it } from "vitest";
import { inlineRuns, markedQuestions, segmentArticle } from "./article-segments";

function spanOf(text: string, needle: string): AnswerSpan {
  const i = text.indexOf(needle);
  if (i < 0) throw new Error(`fixture lacks ${needle}`);
  return [i, needle.length];
}

const TEXT = [
  "The composer **Joseph Haydn** wrote the tune in 1797, and *later* reused it.",
  "- First point mentions Bertolt Brecht.\n- Second point mentions nobody.",
  "| Work | Music |\n|---|---|\n| Kinderhymne | Hanns Eisler |\n| Anthem | Joseph Haydn |",
].join("\n\n");

const SPANS: AnswerSpan[] = [
  spanOf(TEXT, "Joseph Haydn"),
  spanOf(TEXT, "Bertolt Brecht"),
  spanOf(TEXT, "Hanns Eisler"),
  [0, 3], // "The" — overlaps nothing, plain word
  [TEXT.indexOf("nobody"), 6],
];

describe("segmentArticle", () => {
  const blocks = segmentArticle(TEXT, SPANS);

  it("splits into paragraph, list and table blocks in order", () => {
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "list", "table"]);
  });

  it("keeps a mark inside a list item and inside a table cell", () => {
    const list = blocks[1];
    if (list.kind !== "list") throw new Error();
    expect(list.ordered).toBe(false);
    expect(list.items).toHaveLength(2);
    expect(list.items[0].some((s) => s.kind === "mark" && s.text === "Bertolt Brecht")).toBe(true);
    expect(list.items[1].some((s) => s.kind === "mark" && s.text === "nobody")).toBe(true);

    const table = blocks[2];
    if (table.kind !== "table") throw new Error();
    expect(table.header?.map((c) => c.map((s) => s.text).join(""))).toEqual(["Work", "Music"]);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0].map((c) => c.map((s) => s.text).join(""))).toEqual([
      "Kinderhymne",
      "Hanns Eisler",
    ]);
    expect(table.rows[0][1][0]).toMatchObject({ kind: "mark", q: 2 });
    // The first occurrence of "Joseph Haydn" is in the paragraph; the table's
    // repeat is plain text (spans point at one place each).
    expect(table.rows[1][1].every((s) => s.kind === "text")).toBe(true);
  });

  it("reports which questions got a mark", () => {
    expect([...markedQuestions(blocks)].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("offsets always index the original text", () => {
    for (const b of blocks) {
      const segs =
        b.kind === "paragraph"
          ? b.segments
          : b.kind === "list"
            ? b.items.flat()
            : [...(b.header ?? []), ...b.rows.flat()].flat();
      for (const s of segs) expect(TEXT.slice(s.offset, s.offset + s.text.length)).toBe(s.text);
    }
  });
});

describe("inlineRuns", () => {
  it("drops emphasis markers and toggles bold/italic across a mark", () => {
    const blocks = segmentArticle(TEXT, SPANS);
    const para = blocks[0];
    if (para.kind !== "paragraph") throw new Error();
    const runs = inlineRuns(para.segments);
    expect(runs.map((r) => r.seg.text).join("")).toBe(
      "The composer Joseph Haydn wrote the tune in 1797, and later reused it.",
    );
    const haydn = runs.find((r) => r.seg.kind === "mark" && r.seg.text === "Joseph Haydn");
    expect(haydn).toMatchObject({ bold: true, italic: false });
    const later = runs.find((r) => r.seg.text === "later");
    expect(later).toMatchObject({ bold: false, italic: true });
    expect(runs.some((r) => r.seg.text.includes("*"))).toBe(false);
  });
});
