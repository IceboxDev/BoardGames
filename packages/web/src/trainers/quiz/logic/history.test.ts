import type { Article } from "@boardgames/core/quiz/content-types";
import { describe, expect, it } from "vitest";
import {
  compactDiff,
  formatValue,
  groupHistory,
  type HistoryEntry,
  textKey,
  textsAfter,
} from "./history";

const timeline = {
  kind: "event" as const,
  start: "1900",
  end: null,
  precision: "year" as const,
  approx: false,
  ongoing: false,
  labelEn: "L",
  labelDe: "L",
};
const source = { url: "https://example.org/x", title: "X", lang: "en" };

function fact(n: number, en: string) {
  return {
    id: `f0000${n}`,
    answerEn: `a${n}`,
    answerDe: `a${n}`,
    spans: { en: [0, 1] as [number, number], de: [0, 1] as [number, number] },
    timeline,
    source,
    wordings: [{ id: `w0000${n}`, en, de: en, origin: "generated" as const }],
  };
}

const ARTICLE: Article = {
  id: "a0001",
  domain: "society",
  sub: "politics",
  titleEn: "T",
  titleDe: "T",
  bodyEn: "one two three four five six seven eight nine ten",
  bodyDe: "x",
  notesEn: "",
  notesDe: "",
  images: [],
  facts: [fact(1, "Q one?"), fact(2, "Q two?")],
  retired: [
    {
      ...fact(3, "Old?"),
      retired: { at: "2026-10-21", reason: "dup", replacedBy: ["f00001"] },
    },
  ],
};

const entry = (seq: number, over: Partial<HistoryEntry>): HistoryEntry => ({
  seq,
  at: "2026-10-21",
  kind: "edited",
  target: { type: "article", id: "a0001" },
  reason: "r",
  by: "owner",
  ...over,
});

describe("groupHistory", () => {
  it("files entries under the article, each question with its wordings, retired facts and the rest", () => {
    const groups = groupHistory(
      [
        entry(4, { target: { type: "fact", id: "f00003" }, kind: "retired" }),
        entry(1, { target: { type: "wording", id: "w00002" } }),
        entry(2, {}),
        entry(3, { target: { type: "fact", id: "f00042" } }),
        entry(5, { kind: "checkpoint", target: { type: "fact", id: "f00001" } }),
      ],
      ARTICLE,
    );
    expect(groups.map((g) => [g.kind, g.factId, g.index, g.entries.map((e) => e.seq)])).toEqual([
      ["article", undefined, undefined, [2]],
      ["fact", "f00002", 1, [1]],
      ["retired", "f00003", undefined, [4]],
      ["other", undefined, undefined, [3]],
    ]);
  });
});

describe("textsAfter + compactDiff", () => {
  it("walks back from the current text so each diff shows its context", () => {
    const entries = [
      entry(1, {
        changes: [
          {
            field: "bodyEn",
            diff: [
              ["=", 2],
              ["-", "TWO"],
              ["+", "two"],
              ["=", 16],
            ],
          },
        ],
      }),
      entry(2, {
        changes: [
          {
            field: "bodyEn",
            diff: [
              ["=", 18],
              ["-", "TEN"],
              ["+", "ten"],
            ],
          },
        ],
      }),
    ];
    const texts = textsAfter(entries, ARTICLE);
    expect(texts.get(textKey(2, "bodyEn"))).toBe(ARTICLE.bodyEn);
    expect(texts.get(textKey(1, "bodyEn"))).toBe(
      "one two three four five six seven eight nine TEN",
    );

    const pieces = compactDiff(
      entries[0].changes?.[0]?.diff ?? [],
      texts.get(textKey(1, "bodyEn")),
      4,
    );
    expect(pieces).toEqual([
      { type: "same", text: "one " },
      { type: "del", text: "TWO" },
      { type: "ins", text: "two" },
      { type: "same", text: " three four" },
      { type: "gap" },
    ]);
  });

  it("falls back to gaps when the text can't be recovered", () => {
    expect(
      compactDiff(
        [
          ["=", 3],
          ["+", "x"],
        ],
        undefined,
      ),
    ).toEqual([{ type: "gap" }, { type: "ins", text: "x" }]);
    const texts = textsAfter(
      [
        entry(1, {
          changes: [
            {
              field: "bodyEn",
              diff: [
                ["=", 99],
                ["+", "y"],
              ],
            },
          ],
        }),
      ],
      ARTICLE,
    );
    // The diff doesn't fit the body: its own after-text is known, nothing before.
    expect(texts.get(textKey(1, "bodyEn"))).toBe(ARTICLE.bodyEn);
  });
});

describe("formatValue", () => {
  it("shows strings, objects and nulls briefly, and nothing for offsets or images", () => {
    expect(formatValue("answerEn", "Bonn")).toBe("Bonn");
    expect(formatValue("answerRu", null)).toBe("—");
    expect(formatValue("spans", { en: [1, 2] })).toBeNull();
    expect(formatValue("images", [])).toBeNull();
    expect(formatValue("timeline", { labelEn: "x", start: "1900" })).toBe(
      "labelEn: x · start: 1900",
    );
    expect(formatValue("en", "x".repeat(400))?.length).toBe(160);
  });
});
