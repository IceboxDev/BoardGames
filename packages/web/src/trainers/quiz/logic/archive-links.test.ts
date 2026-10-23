import { describe, expect, it } from "vitest";
import { archiveHref, archiveLabel, historyRefHref, runHref, wikidataHref } from "./archive-links";

describe("archive links", () => {
  it("maps a quiz-archive ref to its file on GitHub", () => {
    expect(archiveHref("quiz-archive/transcripts/quiztopia/c001.json")).toBe(
      "https://github.com/IceboxDev/BoardGames/blob/master/packages/quiz-archive/transcripts/quiztopia/c001.json",
    );
  });

  it("keeps a URL and has no link for free text", () => {
    expect(archiveHref("https://example.org/x")).toBe("https://example.org/x");
    expect(archiveHref("owner decision, 2026-10-20")).toBeNull();
    expect(archiveHref("quiz-archive/has space")).toBeNull();
  });

  it("shortens a deep archive path for a label", () => {
    expect(archiveLabel("quiz-archive/runs/tp-enrich/enrich-report/a2469-a0241.md")).toBe(
      "runs/…/a2469-a0241.md",
    );
    expect(archiveLabel("quiz-archive/transcripts/quiztopia/c001.json")).toBe(
      "transcripts/quiztopia/c001.json",
    );
  });

  it("links history refs, runs and Wikidata items", () => {
    expect(historyRefHref("a0042#17")).toBe(
      "https://github.com/IceboxDev/BoardGames/blob/master/packages/core/src/quiz/content/history/a0042.json",
    );
    expect(historyRefHref("cards/quiztopia#3")).toMatch(/history\/cards\/quiztopia\.json$/);
    expect(historyRefHref("nope")).toBeNull();
    expect(runHref("research-07")).toBe(
      "https://github.com/IceboxDev/BoardGames/tree/master/packages/quiz-archive/runs/research-07",
    );
    expect(wikidataHref("Q38757")).toBe("https://www.wikidata.org/wiki/Q38757");
  });
});
