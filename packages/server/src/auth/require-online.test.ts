import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { requireOnline } from "./require-online.ts";
import type { AppEnv, AuthUser } from "./types.ts";

// Mount a tiny app that stands in for `requireAuth` (populates `c.get("user")`)
// then runs the gate. Only `onlineMode` is read, so the fixture can be partial.
function appWithUser(user: unknown) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("user", user as AuthUser);
    await next();
  });
  app.use("*", requireOnline);
  app.get("/", (c) => c.json({ ok: true }));
  return app;
}

describe("requireOnline", () => {
  it("allows online and both", async () => {
    for (const onlineMode of ["online", "both"]) {
      const res = await appWithUser({ onlineMode }).request("/");
      expect(res.status).toBe(200);
    }
  });

  it("rejects offline users with 403", async () => {
    const res = await appWithUser({ onlineMode: "offline" }).request("/");
    expect(res.status).toBe(403);
  });

  it("fails closed for a missing or invalid mode", async () => {
    for (const bad of [{}, { onlineMode: "maybe" }, null, undefined]) {
      const res = await appWithUser(bad).request("/");
      expect(res.status).toBe(403);
    }
  });
});
