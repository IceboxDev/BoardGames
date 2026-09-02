// Pins the purchase endpoint's one interesting behavior: the private fields
// (`pledgedOn`, `pledgeCents`, `shippingCents`, `note`) leave the server only
// for the owner and admins — every other member still gets the full public
// pipeline (status, ETAs, URLs, timeline).

import { PurchasesResponseSchema } from "@boardgames/core/protocol";
import type { PurchaseRecord } from "@boardgames/core/purchases/data";
import { type Client, createClient } from "@libsql/client";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../auth/types.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
// The `authedApp` import chain reads the connection config at module scope to
// build better-auth's Kysely dialect, so the stub answers that too.
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { purchaseRoutes, __setPurchasesDataForTests } = await import("./purchases.ts");

const record: PurchaseRecord = {
  userId: "u1",
  id: "frosthaven",
  title: "Frosthaven (2nd printing)",
  shortTitle: null,
  orderGroup: null,
  slug: null,
  kind: "crowdfunding",
  status: "shipping",
  platform: "Kickstarter",
  campaignUrl: "https://www.kickstarter.com/projects/frosthaven",
  pledgeManagerUrl: null,
  originalEtaMonth: "2026-01",
  currentEtaMonth: "2026-04",
  pledgedOn: "2025-05-02",
  deliveredOn: null,
  currency: "EUR",
  pledgeCents: 17900,
  shippingCents: 3200,
  note: "Split shipping with Tomas.",
  events: [
    {
      id: "frosthaven-e01",
      occurredOn: "2026-03-12",
      type: "shipping-notice",
      title: "Wave 2 hits the EU hub",
      details: null,
      sourceUrl: "https://www.kickstarter.com/projects/frosthaven/posts/123",
    },
  ],
};

/** The real router, behind a stub that supplies the given viewer. */
function app(viewer: { id: string; role: "user" | "admin" }) {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", viewer as AppEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/purchases", purchaseRoutes);
  return a;
}

describe("GET /api/purchases/users/:userId", () => {
  beforeEach(async () => {
    db.current = createClient({ url: ":memory:" });
    await db.current.execute(`CREATE TABLE "user" (id TEXT PRIMARY KEY, role TEXT)`);
    await db.current.batch(
      ["u1", "u2"].map((id) => ({ sql: `INSERT INTO "user" (id) VALUES (?)`, args: [id] })),
      "write",
    );
    __setPurchasesDataForTests([record]);
  });

  afterEach(() => {
    __setPurchasesDataForTests(null);
    db.current?.close();
  });

  it("returns the owner's purchases with the private fields intact", async () => {
    const res = await app({ id: "u1", role: "user" }).request("/api/purchases/users/u1");
    expect(res.status).toBe(200);
    const raw: unknown = await res.json();
    const body = PurchasesResponseSchema.parse(raw);
    expect(body).toMatchObject({ ownerId: "u1", editable: true });
    expect(body.purchases[0]).toMatchObject({
      id: "frosthaven",
      pledgedOn: "2025-05-02",
      pledgeCents: 17900,
      shippingCents: 3200,
      note: "Split shipping with Tomas.",
    });
    // Owner attribution must never leave the server (schema parse would strip
    // it silently, so check the raw payload).
    expect(JSON.stringify(raw)).not.toContain('"userId"');
  });

  it("nulls the private fields for another member but keeps the public pipeline", async () => {
    const res = await app({ id: "u2", role: "user" }).request("/api/purchases/users/u1");
    expect(res.status).toBe(200);
    const body = PurchasesResponseSchema.parse(await res.json());
    expect(body.editable).toBe(false);
    expect(body.purchases[0]).toMatchObject({
      pledgedOn: null,
      pledgeCents: null,
      shippingCents: null,
      note: null,
      status: "shipping",
      originalEtaMonth: "2026-01",
      currentEtaMonth: "2026-04",
      campaignUrl: "https://www.kickstarter.com/projects/frosthaven",
    });
    expect(body.purchases[0].events).toHaveLength(1);
  });

  it("lets an admin see the private fields", async () => {
    const res = await app({ id: "u2", role: "admin" }).request("/api/purchases/users/u1");
    expect(res.status).toBe(200);
    const body = PurchasesResponseSchema.parse(await res.json());
    expect(body.editable).toBe(true);
    expect(body.purchases[0].pledgeCents).toBe(17900);
  });

  it("404s an unknown user through the shared envelope", async () => {
    const res = await app({ id: "u1", role: "user" }).request("/api/purchases/users/ghost");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("serves an empty list for a member with no purchases", async () => {
    const res = await app({ id: "u2", role: "user" }).request("/api/purchases/users/u2");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ownerId: "u2", purchases: [] });
  });
});
