import { createClient } from "@libsql/client";
import { beforeAll, describe, expect, it, vi } from "vitest";

const WEBP = `data:image/webp;base64,${Buffer.from("webp bytes").toString("base64")}`;

const db = vi.hoisted(() => ({ current: null as import("@libsql/client").Client | null }));
// The `authedApp` import chain reads the connection config at module scope.
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

beforeAll(async () => {
  db.current = createClient({ url: ":memory:" });
  await db.current.execute(`CREATE TABLE "user" (id TEXT PRIMARY KEY, image TEXT)`);
  await db.current.execute({
    sql: `INSERT INTO "user" (id, image) VALUES ('made', ?), ('google', ?), ('plain', NULL)`,
    args: [WEBP, "https://lh3.example.com/a/xyz"],
  });
});

const { avatarImageRoutes } = await import("./avatars.ts");

describe("GET /api/avatars/:userId", () => {
  it("serves a stored picture's bytes, cached forever under a versioned URL", async () => {
    const res = await avatarImageRoutes.request("/made?v=abc");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("webp bytes");
  });

  it("caches an unversioned request briefly", async () => {
    const res = await avatarImageRoutes.request("/made");
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
  });

  it("redirects to a sign-in provider's picture", async () => {
    const res = await avatarImageRoutes.request("/google?v=abc");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://lh3.example.com/a/xyz");
  });

  it("404s without a picture", async () => {
    expect((await avatarImageRoutes.request("/plain")).status).toBe(404);
    expect((await avatarImageRoutes.request("/nobody")).status).toBe(404);
  });
});
