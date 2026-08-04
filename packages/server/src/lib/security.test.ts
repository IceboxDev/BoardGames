import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTrustedOrigin } from "./csrf.ts";
import { allowedOrigins, isTrustedOrigin, normalizeOrigin } from "./origins.ts";
import { installProcessGuards } from "./process-guards.ts";
import { __resetRateLimits, rateLimit } from "./rate-limit.ts";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("origins", () => {
  it("normalizes bare hosts and strips trailing slashes", () => {
    expect(normalizeOrigin("example.com")).toBe("https://example.com");
    expect(normalizeOrigin("https://example.com/")).toBe("https://example.com");
    expect(normalizeOrigin("http://localhost:5173")).toBe("http://localhost:5173");
    expect(normalizeOrigin("   ")).toBe("");
  });

  it("drops the loopback dev origins on the deployed server", () => {
    process.env.RAILWAY_ENVIRONMENT = "production";
    process.env.WEB_ORIGIN = "https://boardgames.example";
    delete process.env.ALLOW_LOCALHOST_ORIGINS;
    expect(allowedOrigins()).toEqual(["https://boardgames.example"]);
  });

  it("keeps them locally even though the local .env sets NODE_ENV=production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.RAILWAY_ENVIRONMENT;
    delete process.env.RAILWAY_GIT_COMMIT_SHA;
    process.env.WEB_ORIGIN = "https://boardgames.example";
    expect(allowedOrigins()).toContain("http://localhost:5173");
  });

  it("can be forced off for a non-Railway deployment", () => {
    delete process.env.RAILWAY_ENVIRONMENT;
    process.env.ALLOW_LOCALHOST_ORIGINS = "0";
    process.env.WEB_ORIGIN = "https://boardgames.example";
    expect(allowedOrigins()).toEqual(["https://boardgames.example"]);
  });

  it("trusts a missing Origin (non-browser clients) but not an unknown one", () => {
    process.env.RAILWAY_ENVIRONMENT = "production";
    process.env.WEB_ORIGIN = "https://boardgames.example";
    delete process.env.ALLOW_LOCALHOST_ORIGINS;
    expect(isTrustedOrigin(undefined)).toBe(true);
    expect(isTrustedOrigin("https://boardgames.example")).toBe(true);
    expect(isTrustedOrigin("https://evil.example")).toBe(false);
  });
});

describe("requireTrustedOrigin", () => {
  function app() {
    const a = new Hono();
    a.use("/api/*", requireTrustedOrigin);
    a.post("/api/admin/users/1/reset-link", (c) => c.json({ ran: true }));
    a.get("/api/health", (c) => c.json({ ok: true }));
    a.post("/api/bga-ingest", (c) => c.json({ ran: true }));
    return a;
  }

  beforeEach(() => {
    process.env.RAILWAY_ENVIRONMENT = "production";
    process.env.WEB_ORIGIN = "https://boardgames.example";
    delete process.env.ALLOW_LOCALHOST_ORIGINS;
  });

  it("blocks the bodyless cross-site POST that CORS lets through", async () => {
    // No Content-Type => CORS "simple request" => no preflight. This is the
    // exact shape that reached the admin reset-link route.
    const res = await app().request("/api/admin/users/1/reset-link", {
      method: "POST",
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    });
    expect(res.status).toBe(403);
  });

  it("blocks on an untrusted Origin even without Sec-Fetch-Site", async () => {
    const res = await app().request("/api/admin/users/1/reset-link", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
  });

  it("allows the real frontend", async () => {
    const res = await app().request("/api/admin/users/1/reset-link", {
      method: "POST",
      headers: { origin: "https://boardgames.example", "sec-fetch-site": "same-origin" },
    });
    expect(res.status).toBe(200);
  });

  it("leaves safe methods alone", async () => {
    const res = await app().request("/api/health", {
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    });
    expect(res.status).toBe(200);
  });

  it("exempts token-authenticated public ingest (the BGA userscript)", async () => {
    const res = await app().request("/api/bga-ingest", {
      method: "POST",
      headers: { origin: "https://boardgamearena.com", "sec-fetch-site": "cross-site" },
    });
    expect(res.status).toBe(200);
  });
});

describe("rateLimit", () => {
  beforeEach(() => __resetRateLimits());

  function app(options: Parameters<typeof rateLimit>[0]) {
    const a = new Hono();
    a.use("/x", rateLimit(options));
    a.post("/x", (c) => c.json({ ok: true }));
    a.get("/x", (c) => c.json({ ok: true }));
    return a;
  }

  const from = (ip: string, method = "POST") =>
    ({ method, headers: { "x-forwarded-for": ip } }) as RequestInit;

  it("allows up to the limit then returns 429 with Retry-After", async () => {
    const a = app({ name: "t", windowMs: 60_000, max: 2 });
    expect((await a.request("/x", from("1.1.1.1"))).status).toBe(200);
    expect((await a.request("/x", from("1.1.1.1"))).status).toBe(200);
    const blocked = await a.request("/x", from("1.1.1.1"));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });

  it("counts each client separately", async () => {
    const a = app({ name: "t2", windowMs: 60_000, max: 1 });
    expect((await a.request("/x", from("1.1.1.1"))).status).toBe(200);
    expect((await a.request("/x", from("2.2.2.2"))).status).toBe(200);
    expect((await a.request("/x", from("1.1.1.1"))).status).toBe(429);
  });

  it("forgets hits once the window has passed", async () => {
    vi.useFakeTimers();
    const a = app({ name: "t3", windowMs: 1_000, max: 1 });
    expect((await a.request("/x", from("1.1.1.1"))).status).toBe(200);
    expect((await a.request("/x", from("1.1.1.1"))).status).toBe(429);
    vi.advanceTimersByTime(1_500);
    expect((await a.request("/x", from("1.1.1.1"))).status).toBe(200);
    vi.useRealTimers();
  });

  it("ignores reads when limiting side effects", async () => {
    const a = app({ name: "t4", windowMs: 60_000, max: 1, skipSafeMethods: true });
    expect((await a.request("/x", from("1.1.1.1", "GET"))).status).toBe(200);
    expect((await a.request("/x", from("1.1.1.1", "GET"))).status).toBe(200);
    expect((await a.request("/x", from("1.1.1.1"))).status).toBe(200);
    expect((await a.request("/x", from("1.1.1.1"))).status).toBe(429);
  });
});

describe("installProcessGuards", () => {
  it("survives isolated faults but escalates on a burst", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const now = 0;
    const onFatal = vi.fn();
    const guards = installProcessGuards({
      onFatal,
      maxFaultsPerWindow: 3,
      windowMs: 1000,
      now: () => now,
    });

    for (let i = 0; i < 3; i++) process.emit("uncaughtException", new Error(`boom ${i}`));
    expect(onFatal).not.toHaveBeenCalled();

    process.emit("uncaughtException", new Error("boom 4"));
    expect(onFatal).toHaveBeenCalledOnce();

    guards.uninstall();
    error.mockRestore();
  });

  it("does not escalate when faults are spread beyond the window", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let now = 0;
    const onFatal = vi.fn();
    const guards = installProcessGuards({
      onFatal,
      maxFaultsPerWindow: 2,
      windowMs: 1000,
      now: () => now,
    });

    for (let i = 0; i < 10; i++) {
      process.emit("uncaughtException", new Error(`spaced ${i}`));
      now += 2000;
    }

    expect(onFatal).not.toHaveBeenCalled();
    expect(guards.faultCount()).toBe(1);

    guards.uninstall();
    error.mockRestore();
  });

  it("removes its listeners on uninstall", () => {
    const before = process.listenerCount("uncaughtException");
    const guards = installProcessGuards({ onFatal: () => {} });
    expect(process.listenerCount("uncaughtException")).toBe(before + 1);
    guards.uninstall();
    expect(process.listenerCount("uncaughtException")).toBe(before);
  });
});
