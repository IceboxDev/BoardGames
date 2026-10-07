// The admin report queue over HTTP: real migration chain, in-memory libsql,
// the 2-card fixture content store, the real routes behind an admin stub
// (`requireAdmin` guards every /api/admin/* route in server.ts).

import { fileURLToPath } from "node:url";
import type { AdminReports } from "@boardgames/core/protocol";
import { type Client, createClient } from "@libsql/client";
import { Hono } from "hono";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminEnv } from "../auth/types.ts";
import { __setContentStore, loadContentStore } from "../lib/quiztopia/content-store.ts";
import { createOrUpdateReport } from "../lib/quiztopia/reports.ts";
import { runMigrations } from "../migrations/migrator.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { adminQuiztopiaReportRoutes } = await import("./admin-quiztopia-reports.ts");

const FIXTURE_DIR = fileURLToPath(
  new URL("../lib/quiztopia/__fixtures__/content/", import.meta.url),
);
const ADMIN = "admin-1";
const MEMBER = "member-1";
const QUIET = { info() {}, warn() {} };

function app() {
  const a = new Hono<AdminEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: ADMIN, role: "admin" } as AdminEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/admin", adminQuiztopiaReportRoutes);
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

describe("/api/admin/quiztopia-reports", () => {
  let client: Client;
  const store = loadContentStore(FIXTURE_DIR);

  beforeAll(() => __setContentStore(store));
  afterAll(() => __setContentStore(null));

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

  const file = (issue: "wrong-answer" | "typo" = "wrong-answer") =>
    createOrUpdateReport(client, store, MEMBER, {
      target: { kind: "question", id: "c001-s01-q0" },
      issue,
      language: "en",
      message: "Should be Brecht",
      surface: "wiki",
    });

  it("lists the queue, resolves it, and refuses a second resolve with 409", async () => {
    const a = (await file()).report;
    const b = (await file("typo")).report;

    const open = await call<AdminReports>("GET", "/quiztopia-reports");
    expect(open.status).toBe(200);
    expect(open.body.counts).toEqual({ open: 2, fixed: 0, declined: 0 });
    expect(open.body.groups).toHaveLength(1);
    expect(open.body.groups[0]?.reports.map((r) => r.issue).sort()).toEqual([
      "typo",
      "wrong-answer",
    ]);

    const resolved = await call<{ resolved: number }>("POST", "/quiztopia-reports/resolve", {
      ids: [a.id, b.id],
      status: "fixed",
      note: "Corrected",
    });
    expect(resolved).toEqual({ status: 200, body: { resolved: 2 } });
    const again = await call("POST", "/quiztopia-reports/resolve", {
      ids: [a.id, b.id],
      status: "declined",
    });
    expect(again.status).toBe(409);

    const fixed = await call<AdminReports>("GET", "/quiztopia-reports?status=fixed");
    expect(fixed.body.groups[0]?.reports.every((r) => r.resolutionNote === "Corrected")).toBe(true);
    expect((await call("GET", "/quiztopia-reports?status=nope")).status).toBe(400);
  });

  it("reopens a resolved report, 404 for an open one, 409 when the reporter re-filed it", async () => {
    const a = (await file()).report;
    expect((await call("POST", `/quiztopia-reports/${a.id}/reopen`)).status).toBe(404);
    await call("POST", "/quiztopia-reports/resolve", { ids: [a.id], status: "declined" });
    expect((await call("POST", `/quiztopia-reports/${a.id}/reopen`)).status).toBe(200);

    await call("POST", "/quiztopia-reports/resolve", { ids: [a.id], status: "declined" });
    await file();
    expect((await call("POST", `/quiztopia-reports/${a.id}/reopen`)).status).toBe(409);
    expect((await call("POST", "/quiztopia-reports/abc/reopen")).status).toBe(400);
  });
});
