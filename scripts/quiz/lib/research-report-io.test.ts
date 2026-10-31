import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Article } from "../../../packages/core/src/quiz/content-types.ts";
import { factGrade } from "../../../packages/core/src/quiz/grade.ts";
import { addEvidence } from "./evidence-io.ts";
import { archiveReport, reportFile, reportRef, withReportSource } from "./research-report-io.ts";

const item = {
  id: "b00316",
  kind: "research" as const,
  target: "f00001",
  priority: 1,
  status: "open" as const,
  created: "2026-10-23",
  by: "coordinator",
  notes: "n",
  links: [],
};
// Only the ids matter to the ledger checks.
const article = { id: "a0001", facts: [{ id: "f00001" }] } as unknown as Article;

describe("research reports", () => {
  it("archives the PDF once, names a second report -2, and registers a top-ranked source", () => {
    const archiveDir = mkdtempSync(join(tmpdir(), "reports-"));
    const pdf = join(archiveDir, "in.pdf");
    writeFileSync(pdf, "%PDF-1.7 fake");
    const opts = {
      pdfPath: pdf,
      item,
      article: "a0001",
      title: "Report",
      pages: 9,
      producer: "ChatGPT deep research",
      receivedAt: "2026-10-24",
      textSnapshot: "c".repeat(64),
      archiveDir,
    };
    const m = archiveReport(opts);
    expect(m.file).toBe("research-reports/b00316.pdf");
    expect(m.url).toMatch(/quiz-archive\/research-reports\/b00316\.pdf$/);
    expect(JSON.parse(readFileSync(join(archiveDir, "research-reports/b00316.json"), "utf8")))
      .toMatchObject({ backlog: "b00316", pages: 9, originalName: "in.pdf" });
    expect(archiveReport(opts).file).toBe(m.file);
    writeFileSync(pdf, "%PDF-1.7 another");
    expect(reportFile("b00316", "0".repeat(64), archiveDir).file).toBe(
      "research-reports/b00316-2.pdf",
    );

    const reg = withReportSource(article, undefined, m, reportRef(m));
    expect(reg).toMatchObject({ sourceId: "s1", newSource: true });
    expect(reg.ledger.sources.s1).toMatchObject({ kind: "research-report", snapshot: m.textSnapshot });
    expect(withReportSource(article, reg.ledger, m, reportRef(m)).newSource).toBe(false);

    const cited = addEvidence(article, reg.ledger, {
      target: "f00001",
      claim: "answer",
      url: m.url,
      kind: "research-report",
      lang: "en",
      quote: "40 sworn deponents",
      verbatim: true,
      verdict: "confirmed",
      confidence: "high",
      by: "owner",
      at: "2026-10-24",
    });
    expect(cited.sourceId).toBe("s1");
    expect(factGrade("f00001", cited.ledger)).toMatchObject({ grade: "A", researchReport: true });
  });
});
