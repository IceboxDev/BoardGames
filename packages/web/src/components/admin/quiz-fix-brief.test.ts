import type { AdminReportGroup } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { contentLocation, fixBrief } from "./quiz-fix-brief";

function group(over: Partial<AdminReportGroup> = {}): AdminReportGroup {
  return {
    target: { kind: "question", id: "f00808" },
    articleId: "a0162",
    domain: "history",
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
    printed: [{ source: "quiztopia", card: "c014", image: "IMG_0014.jpg" }],
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
  it("points at the fact inside its article file", () => {
    expect(contentLocation(group())).toBe(
      'packages/core/src/quiz/content/articles/a0162.json → facts[id="f00808"]',
    );
  });

  it("points at an article file, or says the target is gone", () => {
    expect(contentLocation({ target: { kind: "article", id: "a0036" }, articleId: "a0036" })).toBe(
      "packages/core/src/quiz/content/articles/a0036.json (title, body)",
    );
    expect(contentLocation({ target: { kind: "article", id: "a9999" }, articleId: null })).toBe(
      "a9999 (no longer in the content)",
    );
  });
});

describe("fixBrief", () => {
  it("lists every open report with where to fix it", () => {
    const brief = fixBrief([group()]);
    expect(brief).toContain("1 open report on 1 item");
    expect(brief).toContain("## 1. Question f00808 — 06 History");
    expect(brief).toContain("- Card photo: IMG_0014.jpg (quiztopia c014)");
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
      group({ target: { kind: "question", id: "f00809" }, changedSinceReport: true }),
    ]);
    expect(brief).not.toContain("f00808");
    expect(brief).toContain("may already be fixed");
    expect(fixBrief([])).toContain("Nothing open.");
  });

  it("says when the content is gone", () => {
    expect(fixBrief([group({ current: null })])).toContain("no longer in the content");
  });
});
