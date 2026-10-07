import type { AdminReportGroup } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { contentLocation, fixBrief } from "./quiztopia-fix-brief";

function group(over: Partial<AdminReportGroup> = {}): AdminReportGroup {
  return {
    target: { kind: "question", id: "c014-s06-q2" },
    setId: "c014-s06",
    category: 6,
    current: {
      kind: "question",
      en: "Which war ended in 1648?",
      de: "Welcher Krieg endete 1648?",
      answerEn: "The Thirty Years' War",
      answerDe: "Der Dreißigjährige Krieg",
      timeline: {
        start: "1648-10-24",
        end: null,
        labelEn: "Peace of Westphalia",
        labelDe: "Westfälischer Friede",
      },
      source: null,
    },
    changedSinceReport: false,
    sourceImage: "IMG_0014.jpg",
    reports: [
      {
        id: 1,
        reporterId: "u1",
        reporterName: "Anna",
        issue: "wrong-date",
        language: "both",
        message: "It was signed on 24 October",
        surface: "timeline",
        status: "open",
        resolutionNote: null,
        resolvedAt: null,
        resolvedByName: null,
        createdAt: "2026-10-06T10:00:00.000Z",
        contentVersion: "v1",
        snapshot: {
          kind: "article",
          titleEn: "x",
          titleDe: "x",
        },
      },
    ],
    ...over,
  };
}

describe("contentLocation", () => {
  it("points at the question inside its card file", () => {
    expect(contentLocation(group())).toBe(
      "packages/core/src/games/quiztopia/content/questions/c014.json → sets[5].questions[2]",
    );
  });

  it("points at an article and its title entry", () => {
    expect(contentLocation({ target: { kind: "article", id: "c003-s12" } })).toBe(
      'packages/core/src/games/quiztopia/content/articles/c003.json → sets[11] (title in titles.json → "c003-s12")',
    );
  });
});

describe("fixBrief", () => {
  it("lists every open report with where to fix it", () => {
    const brief = fixBrief([group()]);
    expect(brief).toContain("1 open report on 1 item");
    expect(brief).toContain("## 1. Question c014-s06-q2 — 06 History & Society");
    expect(brief).toContain("- Card photo: IMG_0014.jpg");
    expect(brief).toContain("- EN: Which war ended in 1648? → **The Thirty Years' War**");
    expect(brief).toContain("- Timeline: 1648-10-24 — Peace of Westphalia");
    expect(brief).toContain(
      "  - [ ] Wrong timeline date (EN + DE) — “It was signed on 24 October” — Anna, 2026-10-06",
    );
  });

  it("leaves out resolved reports and flags changed content", () => {
    const resolved = group();
    const first = resolved.reports[0];
    if (!first) throw new Error("fixture");
    const brief = fixBrief([
      { ...resolved, reports: [{ ...first, status: "fixed" }] },
      group({ target: { kind: "question", id: "c014-s06-q3" }, changedSinceReport: true }),
    ]);
    expect(brief).not.toContain("c014-s06-q2");
    expect(brief).toContain("may already be fixed");
    expect(fixBrief([])).toContain("Nothing open.");
  });

  it("says when the content is gone", () => {
    expect(fixBrief([group({ current: null })])).toContain("no longer in the content");
  });
});
