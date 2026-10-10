// The AI ledger over HTTP, behind an admin stub (`requireAdmin` guards every
// /api/admin/* route in server.ts).

import { AiCallDetailSchema, AiCallsResponseSchema } from "@boardgames/core/protocol";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminEnv } from "../auth/types.ts";
import { EMPTY_USAGE, recordAiCall, resetAiLedgerForTests } from "../lib/ai/ledger.ts";

// The auth module reaches for the database at import; these routes never do.
vi.mock("../db.ts", () => ({
  getDb: () => null,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { adminAiCallRoutes } = await import("./admin-ai-calls.ts");

function app() {
  const a = new Hono<AdminEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: "admin-1", role: "admin" } as AdminEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/admin", adminAiCallRoutes);
  return a;
}

function record(id: string, feature: string) {
  recordAiCall({
    id,
    at: "2026-10-11T10:00:00.000Z",
    feature,
    label: feature,
    model: "openai/gpt-5.2",
    transport: "stream",
    ms: 900,
    ok: true,
    error: null,
    usage: { ...EMPTY_USAGE, costUsd: 0.01 },
    attempts: 1,
    system: "sys",
    user: "the board",
    output: { clue: "x" },
  });
}

afterEach(() => resetAiLedgerForTests());

describe("/api/admin/ai-calls", () => {
  it("lists recent calls newest first, filtered by feature, without prompts", async () => {
    record("ai_1", "codenames");
    record("ai_2", "decrypto");
    record("ai_3", "codenames");
    const res = await app().request("/api/admin/ai-calls?feature=codenames");
    expect(res.status).toBe(200);
    const body = AiCallsResponseSchema.parse(await res.json());
    expect(body.calls.map((c) => c.id)).toEqual(["ai_3", "ai_1"]);
    expect(body.totals.codenames?.calls).toBe(2);
    expect(JSON.stringify(body)).not.toMatch(/the board/);
  });

  it("serves one call in full, 404 for an unknown id", async () => {
    record("ai_1", "codenames");
    const one = await app().request("/api/admin/ai-calls/ai_1");
    expect(AiCallDetailSchema.parse(await one.json()).user).toBe("the board");
    expect((await app().request("/api/admin/ai-calls/nope")).status).toBe(404);
  });

  it("rejects a bad limit", async () => {
    expect((await app().request("/api/admin/ai-calls?limit=0")).status).toBe(400);
  });
});
