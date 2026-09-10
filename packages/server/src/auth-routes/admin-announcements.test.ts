// Resolving an ownership announcement is a claim. Two admins resolving the
// same row at once must produce exactly one outcome (one custom box, one
// approval) and one 409 — and two approvals for the SAME member must both
// land in the inventory JSON, which is a read-modify-write blob that used to
// lose one of them silently.
//
// Real migration chain, in-memory libsql, the real route behind an admin stub.

import { type Client, createClient } from "@libsql/client";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminEnv } from "../auth/types.ts";
import { runMigrations } from "../migrations/migrator.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { adminAnnouncementRoutes } = await import("./admin-announcements.ts");

const ADMIN = "admin-1";
const MEMBER = "member-1";
const QUIET = { info() {}, warn() {} };

function app() {
  const a = new Hono<AdminEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: ADMIN, role: "admin" } as AdminEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/admin", adminAnnouncementRoutes);
  return a;
}

function resolve(a: Hono<AdminEnv>, id: string, body: object) {
  return a.request(`/api/admin/announcements/${id}/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/announcements/:id/resolve", () => {
  let client: Client;
  let seq = 0;

  async function announce(fields: { slug?: string; freeText?: string }): Promise<string> {
    const id = `ann-${++seq}`;
    await client.execute({
      sql: `INSERT INTO ownership_announcements (id, user_id, slug, free_text_name, status)
            VALUES (?, ?, ?, ?, 'pending')`,
      args: [id, MEMBER, fields.slug ?? null, fields.freeText ?? null],
    });
    return id;
  }

  async function inventory(): Promise<string[]> {
    const { rows } = await client.execute({
      sql: "SELECT game_slugs_json FROM user_inventory WHERE user_id = ?",
      args: [MEMBER],
    });
    return rows[0] ? (JSON.parse(String(rows[0].game_slugs_json)) as string[]) : [];
  }

  async function customBoxes(): Promise<string[]> {
    const { rows } = await client.execute({
      sql: "SELECT custom_title FROM collection_items WHERE user_id = ? ORDER BY custom_title",
      args: [MEMBER],
    });
    return rows.map((r) => String(r.custom_title));
  }

  async function status(id: string): Promise<string> {
    const { rows } = await client.execute({
      sql: "SELECT status FROM ownership_announcements WHERE id = ?",
      args: [id],
    });
    return String(rows[0]?.status);
  }

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    for (const [id, role] of [
      [ADMIN, "admin"],
      [MEMBER, "user"],
    ]) {
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

  it("creates exactly one custom box when two admins approve-custom concurrently", async () => {
    const id = await announce({ freeText: "Homebrew Box" });
    const a = app();
    const responses = await Promise.all([
      resolve(a, id, { action: "approve-custom" }),
      resolve(a, id, { action: "approve-custom" }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await customBoxes()).toEqual(["Homebrew Box"]);
    expect(await status(id)).toBe("approved");
  });

  it("keeps both slugs when two approvals for the same member overlap", async () => {
    const first = await announce({ slug: "7-wonders" });
    const second = await announce({ slug: "aeons-end" });
    const a = app();
    const responses = await Promise.all([
      resolve(a, first, { action: "approve", slug: "7-wonders" }),
      resolve(a, second, { action: "approve", slug: "aeons-end" }),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect((await inventory()).sort()).toEqual(["7-wonders", "aeons-end"]);
    expect(await status(first)).toBe("approved");
    expect(await status(second)).toBe("approved");
  });

  async function acquiredOn(slug: string): Promise<string | null> {
    const { rows } = await client.execute({
      sql: "SELECT acquired_on FROM collection_items WHERE user_id = ? AND slug = ?",
      args: [MEMBER, slug],
    });
    const value = rows[0]?.acquired_on;
    return value == null ? null : String(value);
  }

  it("dates the approved copy from the announcement so it reads as new", async () => {
    const id = await announce({ slug: "wingspan" });
    expect((await resolve(app(), id, { action: "approve", slug: "wingspan" })).status).toBe(200);
    expect(await acquiredOn("wingspan")).toBe(new Date().toISOString().slice(0, 10));
  });

  it("keeps an acquired-on date the owner already entered", async () => {
    await client.execute({
      sql: `INSERT INTO collection_items (id, user_id, slug, acquired_on)
            VALUES ('ci-owner', ?, 'wingspan', '2020-05-05')`,
      args: [MEMBER],
    });
    const id = await announce({ slug: "wingspan" });
    expect((await resolve(app(), id, { action: "approve", slug: "wingspan" })).status).toBe(200);
    expect(await acquiredOn("wingspan")).toBe("2020-05-05");
  });

  it("refuses to resolve a row twice, whichever action comes second", async () => {
    const id = await announce({ slug: "7-wonders" });
    const a = app();
    expect((await resolve(a, id, { action: "approve", slug: "7-wonders" })).status).toBe(200);
    expect((await resolve(a, id, { action: "dismiss" })).status).toBe(409);
    expect((await resolve(a, id, { action: "approve", slug: "7-wonders" })).status).toBe(409);
    expect(await inventory()).toEqual(["7-wonders"]);
  });

  it("dismisses without touching the inventory", async () => {
    const id = await announce({ slug: "7-wonders" });
    expect((await resolve(app(), id, { action: "dismiss" })).status).toBe(200);
    expect(await status(id)).toBe("dismissed");
    expect(await inventory()).toEqual([]);
  });
});
