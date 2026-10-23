// Content reports end to end: real migrations, in-memory libsql, the fixture
// quiz bank.

import { fileURLToPath } from "node:url";
import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../migrations/migrator.ts";
import { type ContentStore, loadContentStore } from "./content-store.ts";
import {
  adminReports,
  createOrUpdateReport,
  markSeen,
  myReports,
  ReportTargetNotFoundError,
  reopenReport,
  resolveReports,
  snapshotFor,
  withdrawReport,
} from "./reports.ts";

const FIXTURE_DIR = fileURLToPath(new URL("./__fixtures__/content/", import.meta.url));
const QUIET = { info() {}, warn() {} };
const ANNA = "anna";
const BEN = "ben";
const ADMIN = "admin";

let client: Client;
let store: ContentStore;

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  await client.execute("PRAGMA foreign_keys = ON");
  await runMigrations(client, { logger: QUIET });
  for (const id of [ANNA, BEN, ADMIN]) {
    await client.execute({
      sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
            VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', ?)`,
      args: [id, id.toUpperCase(), `${id}@example.com`, id === ADMIN ? "admin" : "user"],
    });
  }
  store = loadContentStore(FIXTURE_DIR);
});

afterEach(() => {
  client.close();
});

const Q = { kind: "question", id: "f00003" } as const;
const A = { kind: "article", id: "a0018" } as const;

function report(userId: string, over: Partial<Parameters<typeof createOrUpdateReport>[3]> = {}) {
  return createOrUpdateReport(client, store, userId, {
    target: Q,
    issue: "wrong-answer",
    language: "en",
    message: "It was 1952, not 1950",
    surface: "trainer",
    ...over,
  });
}

describe("reports", () => {
  it("files a report with a server-built snapshot of the question", async () => {
    const { report: r, updated } = await report(ANNA);
    expect(updated).toBe(false);
    expect(r).toMatchObject({
      target: Q,
      articleId: "a0001",
      domain: "music-stage",
      issue: "wrong-answer",
      status: "open",
      unread: false,
      message: "It was 1952, not 1950",
    });
    expect(r.snapshot).toEqual(snapshotFor(store, Q));
    expect(r.snapshot.kind === "question" && r.snapshot.answerEn.length > 0).toBe(true);
  });

  it("snapshots an article by its titles, and refuses unknown content", async () => {
    const { report: r } = await report(ANNA, { target: A, issue: "factual-error" });
    expect(r.snapshot).toMatchObject({ kind: "article" });
    expect(r.articleId).toBe(A.id);
    expect(r.domain).toBe(store.getArticleMeta(A.id)?.domain);
    await expect(
      report(ANNA, { target: { kind: "question", id: "f05881" } }),
    ).rejects.toBeInstanceOf(ReportTargetNotFoundError);
  });

  it("updates the open report of the same issue instead of duplicating it", async () => {
    const first = await report(ANNA);
    const again = await report(ANNA, {
      message: "Actually 1952 — see the article",
      language: "both",
    });
    expect(again.updated).toBe(true);
    expect(again.report.id).toBe(first.report.id);
    expect(again.report).toMatchObject({
      message: "Actually 1952 — see the article",
      language: "both",
    });
    // A different issue, or another member, is a new report.
    expect((await report(ANNA, { issue: "typo" })).updated).toBe(false);
    expect((await report(BEN)).updated).toBe(false);
    expect((await myReports(client, store, ANNA)).reports).toHaveLength(2);
  });

  it("lets a member withdraw only their own open report", async () => {
    const { report: r } = await report(ANNA);
    expect(await withdrawReport(client, BEN, r.id)).toBe(false);
    expect(await withdrawReport(client, ANNA, r.id)).toBe(true);
    expect(await withdrawReport(client, ANNA, r.id)).toBe(false);
    const resolved = (await report(ANNA)).report;
    await resolveReports(client, [resolved.id], "fixed", undefined, ADMIN);
    expect(await withdrawReport(client, ANNA, resolved.id)).toBe(false);
  });

  it("delivers a resolution as unread until the reporter has seen it", async () => {
    const { report: r } = await report(ANNA);
    expect(await resolveReports(client, [r.id], "fixed", "Corrected to 1952", ADMIN)).toBe(1);
    const mine = await myReports(client, store, ANNA);
    expect(mine.unread).toBe(1);
    expect(mine.reports[0]).toMatchObject({
      status: "fixed",
      resolutionNote: "Corrected to 1952",
      unread: true,
    });
    expect(await markSeen(client, ANNA, [r.id])).toBe(1);
    expect((await myReports(client, store, ANNA)).unread).toBe(0);
    // Someone else can't mark it.
    expect(await markSeen(client, BEN, [r.id])).toBe(0);
  });

  it("resolves as a claim: a second resolve changes nothing", async () => {
    const a = (await report(ANNA)).report;
    const b = (await report(BEN)).report;
    expect(await resolveReports(client, [a.id, b.id], "declined", "It's right", ADMIN)).toBe(2);
    expect(await resolveReports(client, [a.id, b.id], "fixed", "Overwrite?", ADMIN)).toBe(0);
    expect((await myReports(client, store, ANNA)).reports[0]).toMatchObject({
      status: "declined",
      resolutionNote: "It's right",
    });
  });

  it("groups the admin queue per target, with names, counts and the change flag", async () => {
    await report(ANNA);
    await report(BEN, { issue: "translation", language: "de" });
    await report(ANNA, { target: A, issue: "factual-error" });
    // Ben saw different content (e.g. before a fix landed).
    await client.execute({
      sql: `UPDATE quiz_reports SET snapshot_json = json_set(snapshot_json, '$.answerEn', 'old')
             WHERE user_id = ?`,
      args: [BEN],
    });

    const queue = await adminReports(client, store, "open");
    expect(queue.counts).toEqual({ open: 3, fixed: 0, declined: 0 });
    expect(queue.groups.map((g) => g.target.id).sort()).toEqual(["a0018", "f00003"]);
    const question = queue.groups.find((g) => g.target.id === Q.id);
    expect(question?.reports.map((r) => r.reporterName).sort()).toEqual(["ANNA", "BEN"]);
    expect(question?.changedSinceReport).toBe(true);
    expect(question?.current).toEqual(snapshotFor(store, Q));
    // A sibling is printed on no card; the article's printed fact is on c002.
    expect(question?.printed).toEqual([]);
    expect(question?.articleId).toBe("a0001");
    const article = queue.groups.find((g) => g.target.id === A.id);
    expect(article?.changedSinceReport).toBe(false);
    expect(article?.printed).toEqual([
      { source: "quiztopia", card: "c002", image: store.sourceCards("quiztopia")[1]?.image },
    ]);

    const r = question?.reports[0];
    if (!r) throw new Error("no report");
    await resolveReports(client, [r.id], "fixed", undefined, ADMIN);
    const fixed = await adminReports(client, store, "fixed");
    expect(fixed.groups[0]?.reports[0]).toMatchObject({ status: "fixed", resolvedByName: "ADMIN" });
    expect(fixed.counts).toEqual({ open: 2, fixed: 1, declined: 0 });
  });

  it("reopens a resolved report, unless the reporter has filed it again", async () => {
    const first = (await report(ANNA)).report;
    expect(await reopenReport(client, first.id)).toBe("not-found");
    await resolveReports(client, [first.id], "declined", undefined, ADMIN);
    expect(await reopenReport(client, first.id)).toBe("reopened");
    expect((await myReports(client, store, ANNA)).reports[0]).toMatchObject({
      status: "open",
      resolutionNote: null,
      unread: false,
    });

    await resolveReports(client, [first.id], "declined", undefined, ADMIN);
    await report(ANNA, { message: "Still wrong" }); // a new open report, same issue
    expect(await reopenReport(client, first.id)).toBe("duplicate-open");
  });
});
