// The admin quiz desk over HTTP: real migration chain, in-memory libsql, the
// desk fixture bank (retired article, evidence, backlog, tags) and archive,
// the real routes behind an admin stub (`requireAdmin` guards every
// /api/admin/* route in server.ts).

import type {
  QuizDeskBacklogResponse,
  QuizDeskLinkReportResponse,
  QuizDeskProvenance,
  QuizDeskRetiredResponse,
  QuizDeskSummary,
} from "@boardgames/core/protocol/http/quiz-desk";
import { type Client, createClient } from "@libsql/client";
import { Hono } from "hono";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminEnv } from "../auth/types.ts";
import { makeDeskBank } from "../lib/quiz/__fixtures__/retired-bank.ts";
import { __setArchiveStore, loadArchiveStore, PHOTO_URL_BASE } from "../lib/quiz/archive-store.ts";
import { __setContentStore, loadContentStore } from "../lib/quiz/content-store.ts";
import { createOrUpdateReport } from "../lib/quiz/reports.ts";
import { runMigrations } from "../migrations/migrator.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { adminQuizDeskRoutes } = await import("./admin-quiz-desk.ts");
const { adminQuizReportRoutes } = await import("./admin-quiz-reports.ts");

const ADMIN = "admin-1";
const MEMBER = "member-1";
const QUIET = { info() {}, warn() {} };

function app() {
  const a = new Hono<AdminEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: ADMIN, role: "admin" } as AdminEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/admin", adminQuizReportRoutes);
  a.route("/api/admin", adminQuizDeskRoutes);
  return a;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown) {
  const res = await app().request(`/api/admin${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

describe("/api/admin/quiz-desk", () => {
  let client: Client;
  const bank = makeDeskBank();
  const store = loadContentStore(bank.dir);

  beforeAll(() => {
    __setContentStore(store);
    __setArchiveStore(loadArchiveStore(bank.archiveDir));
  });
  afterAll(() => {
    __setContentStore(null);
    __setArchiveStore(null);
    bank.cleanup();
  });

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    for (const [id, role] of [
      [ADMIN, "admin"],
      [MEMBER, "user"],
    ] as const) {
      await client.execute({
        sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", role)
              VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', ?)`,
        args: [id, id, `${id}@example.com`, role],
      });
    }
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  it("summarises shape, grades, backlog and retired counts", async () => {
    const { status, body } = await call<QuizDeskSummary>("GET", "/quiz-desk/summary");
    expect(status).toBe(200);
    expect(body.contentVersion).toBe(store.version);
    // 23 active articles × 5 facts, minus the two retired facts.
    expect(body.gradeTotals).toEqual({ A: 1, B: 0, C: 1, D: 0, E: 111 });
    expect(body.grades["music-stage"]).toMatchObject({ A: 1, C: 1 });
    // a0001 and a0013 (both music-stage) each lost a fact.
    expect(body.shape["music-stage"].byFactCount[4]).toBe(2);
    expect(body.shape.technology.articles).toBe(2); // a0024 is retired
    expect(body.evidenceArticles).toBe(1);
    expect(body.backlog).toMatchObject({ total: 4, byStatus: { open: 3, done: 1 } });
    expect(body.retired.facts).toMatchObject({ none: 1, wrong: 1 });
    expect(body.retired.wordings["superseded-by-print"]).toBe(1);
    expect(body.retired.articles.merged).toBe(1);
  });

  it("pages and filters the backlog with labelled targets", async () => {
    const all = await call<QuizDeskBacklogResponse>("GET", "/quiz-desk/backlog?limit=2");
    expect(all.status).toBe(200);
    expect(all.body.items.map((b) => b.id)).toEqual(["b00004", "b00001"]);
    expect(all.body).toMatchObject({ total: 4, nextCursor: "2" });
    expect(all.body.targets.a0024).toMatchObject({ kind: "article", retired: true });
    expect(all.body.targets["quiztopia/c001"]).toMatchObject({
      kind: "card",
      label: "Quiztopia c001",
      articleId: "a0001",
    });
    const next = await call<QuizDeskBacklogResponse>("GET", "/quiz-desk/backlog?limit=2&cursor=2");
    expect(next.body.items.map((b) => b.id)).toEqual(["b00002", "b00003"]);
    expect(next.body.nextCursor).toBeNull();
    expect(next.body.targets["domain:history"]).toMatchObject({
      kind: "domain",
      domain: "history",
    });

    const inArticle = await call<QuizDeskBacklogResponse>("GET", "/quiz-desk/backlog?target=a0001");
    expect(inArticle.body.items.map((b) => b.id)).toEqual(["b00001", "b00002"]);
    const done = await call<QuizDeskBacklogResponse>("GET", "/quiz-desk/backlog?status=done");
    expect(done.body.items.map((b) => b.id)).toEqual(["b00002"]);
    expect(done.body.targets.f00002).toMatchObject({ kind: "fact", articleId: "a0001" });

    expect((await call("GET", "/quiz-desk/backlog?status=closed")).status).toBe(400);
    expect((await call("GET", "/quiz-desk/backlog?limit=0")).status).toBe(400);
  });

  it("filters the retired database by kind, code, domain and text", async () => {
    const all = await call<QuizDeskRetiredResponse>("GET", "/quiz-desk/retired");
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(4);
    expect(all.body.rows[0]).toMatchObject({ kind: "article", id: "a0024", at: "2026-10-22" });

    const none = await call<QuizDeskRetiredResponse>("GET", "/quiz-desk/retired?code=none");
    expect(none.body.rows.map((r) => r.id)).toEqual(["f00001"]);
    const words = await call<QuizDeskRetiredResponse>("GET", "/quiz-desk/retired?kind=wording");
    expect(words.body.rows[0]).toMatchObject({ id: "w90001", replacedBy: ["w00006"] });
    const text = await call<QuizDeskRetiredResponse>("GET", "/quiz-desk/retired?q=premise");
    expect(text.body.rows.map((r) => r.id)).toEqual(["f00061"]);
    const dom = await call<QuizDeskRetiredResponse>("GET", "/quiz-desk/retired?domain=technology");
    expect(dom.body.rows.map((r) => r.id)).toEqual(["a0024"]);

    expect((await call("GET", "/quiz-desk/retired?kind=card")).status).toBe(400);
  });

  it("serves an article's provenance: grades, evidence, photo + transcript, links", async () => {
    const report = (
      await createOrUpdateReport(client, store, MEMBER, {
        target: { kind: "question", id: "f00002" },
        issue: "wrong-answer",
        language: "en",
        message: "Check it",
        surface: "wiki",
      })
    ).report;
    const resolved = await call("POST", "/quiz-reports/resolve", {
      ids: [report.id],
      status: "fixed",
      backlogId: "b00002",
      historyRef: "a0001#2",
    });
    expect(resolved.status).toBe(200);

    const { status, body } = await call<QuizDeskProvenance>(
      "GET",
      "/quiz-desk/articles/a0001/provenance",
    );
    expect(status).toBe(200);
    expect(body.article).toMatchObject({ id: "a0001", retired: null, hasEvidence: true });
    expect(body.facts.map((f) => f.id)).toEqual(["f00002", "f00003", "f00004", "f00005", "f00001"]);

    const f2 = body.facts[0];
    expect(f2.grade).toMatchObject({ grade: "A", independentSources: 2, primary: 1 });
    expect(f2.sources.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(f2.assessments.map((a) => a.id)).toEqual(["e1"]);
    expect(body.facts[1].grade.grade).toBe("C");
    expect(body.facts[2].grade.grade).toBe("E");

    const f1 = body.facts[4];
    expect(f1.retired?.replacedBy).toEqual(["f00002"]);
    expect(f1.printedOn).toHaveLength(1);
    expect(f1.printedOn[0]).toMatchObject({
      source: "quiztopia",
      card: "c001",
      category: 1,
      photoUrl: `${PHOTO_URL_BASE}photos/quiztopia/c001.jpg`,
      manifest: {
        rotate: 270,
        takenAt: "2026-09-10T16:48:37+02:00",
        sha256Stored: "2".repeat(64),
        duplicates: [`${PHOTO_URL_BASE}photos/quiztopia/c001.dup1.jpg`],
      },
      transcript: { category: 1, answer: { de: "Bertolt Brecht" } },
    });
    expect(f1.printedOn[0].transcript?.cardDe).toMatch(/Kinderhymne/);

    expect(body.backlog.map((b) => b.id)).toEqual(["b00001", "b00002"]);
    expect(body.reports).toEqual([
      expect.objectContaining({ id: report.id, backlogId: "b00002", historyRef: "a0001#2" }),
    ]);
    expect(body.history).toEqual({
      total: 4,
      byKind: { printed: 1, corrected: 1, retired: 1, edited: 1 },
      lastAt: "2026-10-23",
    });
    expect(body.runs).toEqual([
      { id: "evidence-crawl", title: null },
      { id: "handcheck-2026-10-23", title: null },
      { id: "tp-221", title: "Trivial Pursuit card 221" },
    ]);
    expect(Object.keys(body.article.tagLabels)).toContain("printed:yes");
  });

  it("reads a retired article; 404 for an unknown one, 400 for a bad id", async () => {
    const retired = await call<QuizDeskProvenance>("GET", "/quiz-desk/articles/a0024/provenance");
    expect(retired.status).toBe(200);
    expect(retired.body.article.retired).toMatchObject({ code: "merged" });
    expect(retired.body.backlog.map((b) => b.id)).toEqual(["b00004"]);
    expect((await call("GET", "/quiz-desk/articles/a0099/provenance")).status).toBe(404);
    expect((await call("GET", "/quiz-desk/articles/x/provenance")).status).toBe(400);
  });

  it("links the photo without the archive (production): no manifest, no transcript", async () => {
    __setArchiveStore(loadArchiveStore(null));
    try {
      const { body } = await call<QuizDeskProvenance>(
        "GET",
        "/quiz-desk/articles/a0001/provenance",
      );
      expect(body.facts[4].printedOn[0]).toMatchObject({
        photoUrl: `${PHOTO_URL_BASE}photos/quiztopia/c001.jpg`,
        manifest: null,
        transcript: null,
      });
      expect(body.runs.find((r) => r.id === "tp-221")?.title).toBeNull();
    } finally {
      __setArchiveStore(loadArchiveStore(bank.archiveDir));
    }
  });

  it("sets and clears a report's links; reopening drops the history link", async () => {
    const report = (
      await createOrUpdateReport(client, store, MEMBER, {
        target: { kind: "article", id: "a0001" },
        issue: "typo",
        language: "en",
        surface: "wiki",
      })
    ).report;
    const set = await call<QuizDeskLinkReportResponse>(
      "POST",
      `/quiz-desk/reports/${report.id}/link`,
      { backlogId: "b00001", historyRef: "a0001#3" },
    );
    expect(set).toEqual({
      status: 200,
      body: { id: report.id, backlogId: "b00001", historyRef: "a0001#3" },
    });
    const cleared = await call<QuizDeskLinkReportResponse>(
      "POST",
      `/quiz-desk/reports/${report.id}/link`,
      { backlogId: null },
    );
    expect(cleared.body).toEqual({ id: report.id, backlogId: null, historyRef: "a0001#3" });

    await call("POST", "/quiz-reports/resolve", { ids: [report.id], status: "fixed" });
    expect((await call("POST", `/quiz-reports/${report.id}/reopen`)).status).toBe(200);
    const after = await call<QuizDeskLinkReportResponse>(
      "POST",
      `/quiz-desk/reports/${report.id}/link`,
      { backlogId: "b00001" },
    );
    expect(after.body).toEqual({ id: report.id, backlogId: "b00001", historyRef: null });

    expect((await call("POST", "/quiz-desk/reports/999/link", { backlogId: null })).status).toBe(
      404,
    );
    expect((await call("POST", `/quiz-desk/reports/${report.id}/link`, {})).status).toBe(400);
    expect(
      (await call("POST", `/quiz-desk/reports/${report.id}/link`, { historyRef: "nope" })).status,
    ).toBe(400);
    expect(
      (
        await call("POST", "/quiz-reports/resolve", {
          ids: [report.id],
          status: "fixed",
          backlogId: "x",
        })
      ).status,
    ).toBe(400);
  });
});
