import { parseQuestionId, parseSetId } from "@boardgames/core/games/quiztopia/ids";
import type { AdminReportGroup, ReportSnapshot } from "@boardgames/core/protocol";
import { districtByN } from "../../games/quiztopia/bands";
import { ISSUE_COPY } from "../../games/quiztopia/components/report/issues";

// The admin queue's "Copy fix brief": every open report as a Markdown task
// list that says exactly where each problem lives — the committed content
// file and JSON location, the photographed card it was transcribed from —
// so the fix can be made at the source (and survive the next import) by
// hand or by handing the brief to an assistant. Pure, so it's unit tested.

const CONTENT_DIR = "packages/core/src/games/quiztopia/content";

/** Where a target lives in the committed content. */
export function contentLocation(group: Pick<AdminReportGroup, "target">): string {
  if (group.target.kind === "question") {
    const q = parseQuestionId(group.target.id);
    if (!q) return group.target.id;
    return `${CONTENT_DIR}/questions/${q.cardId}.json → sets[${q.n - 1}].questions[${q.q}]`;
  }
  const s = parseSetId(group.target.id);
  if (!s) return group.target.id;
  return `${CONTENT_DIR}/articles/${s.cardId}.json → sets[${s.n - 1}] (title in titles.json → "${group.target.id}")`;
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

const LANGUAGE = { en: "EN", de: "DE", both: "EN + DE" } as const;

export function fixBrief(groups: readonly AdminReportGroup[]): string {
  const open = groups
    .map((g) => ({ ...g, reports: g.reports.filter((r) => r.status === "open") }))
    .filter((g) => g.reports.length > 0);
  const total = open.reduce((n, g) => n + g.reports.length, 0);
  if (open.length === 0) return "# Quiztopia content fixes\n\nNothing open.\n";

  const out = [
    "# Quiztopia content fixes",
    "",
    `${total} open report${total === 1 ? "" : "s"} on ${open.length} item${open.length === 1 ? "" : "s"}. ` +
      "Fix the transcription source too, or the next import brings the mistake back.",
  ];
  open.forEach((g, i) => {
    const d = districtByN(g.category);
    out.push(
      "",
      `## ${i + 1}. ${g.target.kind === "question" ? "Question" : "Article"} ${g.target.id} — ${d.label} ${d.en}`,
      "",
      `- File: ${contentLocation(g)}`,
    );
    if (g.sourceImage) out.push(`- Card photo: ${g.sourceImage}`);
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
