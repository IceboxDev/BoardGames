import type { AdminReportGroup, ReportSnapshot } from "@boardgames/core/protocol";
import { ISSUE_COPY } from "../../trainers/quiz/components/report/issues";
import { findDomain } from "../../trainers/quiz/domains";

// The admin queue's "Copy fix brief": every open report as a Markdown task
// list that says exactly where each problem lives — the article file of the
// quiz bank (the source of truth, edited in place) and the photographed
// cards that print it — so the fix can be made by hand or by handing the
// brief to an assistant. Pure, so it's unit tested.

const CONTENT_DIR = "packages/core/src/quiz/content";

/** Where a target lives in the committed content. */
export function contentLocation(group: Pick<AdminReportGroup, "target" | "articleId">): string {
  if (!group.articleId) return `${group.target.id} (no longer in the content)`;
  const file = `${CONTENT_DIR}/articles/${group.articleId}.json`;
  return group.target.kind === "question"
    ? `${file} → facts[id="${group.target.id}"]`
    : `${file} (title, body)`;
}

function contentLines(snap: ReportSnapshot | null): string[] {
  if (!snap) return ["- Content: **no longer in the content** (removed or renumbered)"];
  if (snap.kind === "article") return [`- Title: ${snap.titleEn} / ${snap.titleDe}`];
  const lines = [
    `- EN: ${snap.en} → **${snap.answerEn}**`,
    `- DE: ${snap.de} → **${snap.answerDe}**`,
  ];
  if (snap.timeline) {
    const span = snap.timeline.end
      ? `${snap.timeline.start} – ${snap.timeline.end}`
      : snap.timeline.start;
    lines.push(`- Timeline: ${span} — ${snap.timeline.labelEn}`);
  }
  if (snap.source) lines.push(`- Source: ${snap.source.title} <${snap.source.url}>`);
  return lines;
}

const LANGUAGE = { en: "EN", de: "DE", ru: "RU", both: "EN + DE" } as const;

export function fixBrief(groups: readonly AdminReportGroup[]): string {
  const open = groups
    .map((g) => ({ ...g, reports: g.reports.filter((r) => r.status === "open") }))
    .filter((g) => g.reports.length > 0);
  const total = open.reduce((n, g) => n + g.reports.length, 0);
  if (open.length === 0) return "# Quiz content fixes\n\nNothing open.\n";

  const out = [
    "# Quiz content fixes",
    "",
    `${total} open report${total === 1 ? "" : "s"} on ${open.length} item${open.length === 1 ? "" : "s"}. ` +
      "The article files are the source of truth: fix them in place.",
  ];
  open.forEach((g, i) => {
    const d = findDomain(g.domain);
    out.push(
      "",
      `## ${i + 1}. ${g.target.kind === "question" ? "Question" : "Article"} ${g.target.id}${d ? ` — ${d.label} ${d.en}` : ""}`,
      "",
      `- File: ${contentLocation(g)}`,
    );
    for (const p of g.printed) out.push(`- Card photo: ${p.image} (${p.source} ${p.card})`);
    out.push(...contentLines(g.current));
    if (g.changedSinceReport) {
      out.push("- ⚠ The content changed since some of these reports — it may already be fixed.");
    }
    out.push("- Reports:");
    for (const r of g.reports) {
      const said = r.message ? ` — “${r.message}”` : "";
      out.push(
        `  - [ ] ${ISSUE_COPY[r.issue].label} (${LANGUAGE[r.language]})${said} — ${r.reporterName}, ${r.createdAt.slice(0, 10)}`,
      );
    }
  });
  return `${out.join("\n")}\n`;
}
