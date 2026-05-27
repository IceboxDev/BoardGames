import { describe, expect, it } from "vitest";
import {
  AdminUserListSchema,
  AdminUserSchema,
  AuthConfigSchema,
  OnlineModeSchema,
  SessionUserSchema,
  SetOnlineModeBodySchema,
  WsTicketResponseSchema,
} from "./auth.ts";

describe("AuthConfigSchema", () => {
  it("accepts the boolean flag", () => {
    expect(AuthConfigSchema.parse({ googleEnabled: true })).toEqual({ googleEnabled: true });
    expect(AuthConfigSchema.parse({ googleEnabled: false })).toEqual({ googleEnabled: false });
  });

  it("rejects missing flag", () => {
    expect(() => AuthConfigSchema.parse({})).toThrow();
  });
});

describe("OnlineModeSchema", () => {
  it("accepts each of the three values", () => {
    for (const v of ["online", "offline", "both"] as const) {
      expect(OnlineModeSchema.parse(v)).toBe(v);
    }
  });

  it("rejects anything else (including the legacy boolean)", () => {
    expect(() => OnlineModeSchema.parse(true)).toThrow();
    expect(() => OnlineModeSchema.parse("yes")).toThrow();
    expect(() => OnlineModeSchema.parse("ONLINE")).toThrow();
  });
});

describe("SessionUserSchema", () => {
  it("defaults role to 'user' and onlineMode to 'offline'", () => {
    const u = SessionUserSchema.parse({ id: "u1", email: "a@b.com" });
    expect(u.role).toBe("user");
    expect(u.onlineMode).toBe("offline");
  });

  it("accepts admin role and a non-default mode", () => {
    const u = SessionUserSchema.parse({
      id: "u1",
      email: "a@b.com",
      role: "admin",
      onlineMode: "both",
    });
    expect(u.role).toBe("admin");
    expect(u.onlineMode).toBe("both");
  });

  it("rejects an unknown role string", () => {
    expect(() =>
      SessionUserSchema.parse({ id: "u1", email: "a@b.com", role: "superadmin" }),
    ).toThrow();
  });

  it("rejects an unknown online mode", () => {
    expect(() =>
      SessionUserSchema.parse({ id: "u1", email: "a@b.com", onlineMode: "remote" }),
    ).toThrow();
  });
});

describe("SetOnlineModeBodySchema", () => {
  it("accepts each enum value", () => {
    for (const v of ["online", "offline", "both"] as const) {
      expect(SetOnlineModeBodySchema.parse({ onlineMode: v })).toEqual({ onlineMode: v });
    }
  });

  it("rejects non-enum values", () => {
    expect(() => SetOnlineModeBodySchema.parse({ onlineMode: true })).toThrow();
    expect(() => SetOnlineModeBodySchema.parse({ onlineMode: "remote" })).toThrow();
  });
});

describe("AdminUserSchema", () => {
  it("accepts the minimum required row (id + email + name + createdAt)", () => {
    const u = AdminUserSchema.parse({
      id: "u1",
      email: "a@b.com",
      name: "Anya",
      createdAt: "2026-05-21T00:00:00.000Z",
    });
    expect(u.id).toBe("u1");
    expect(u.role).toBeUndefined();
    expect(u.onlineMode).toBeUndefined();
  });

  it("accepts Date instances for createdAt (test fixtures often pass Date)", () => {
    const d = new Date("2026-01-01");
    const u = AdminUserSchema.parse({ id: "u1", email: "a@b.com", name: "Anya", createdAt: d });
    expect(u.createdAt).toBe(d);
  });

  it("accepts null for the nullable custom fields", () => {
    const u = AdminUserSchema.parse({
      id: "u1",
      email: "a@b.com",
      name: "Anya",
      role: null,
      onlineMode: null,
      internal: null,
      guest: null,
      createdAt: "2026-05-21T00:00:00.000Z",
    });
    expect(u.role).toBeNull();
    expect(u.onlineMode).toBeNull();
  });

  it("accepts unknown role strings (server admin plugin is configurable)", () => {
    const u = AdminUserSchema.parse({
      id: "u1",
      email: "a@b.com",
      name: "Anya",
      role: "moderator",
      createdAt: "2026-05-21T00:00:00.000Z",
    });
    expect(u.role).toBe("moderator");
  });

  it("round-trips the stock better-auth fields when present", () => {
    const u = AdminUserSchema.parse({
      id: "u1",
      email: "a@b.com",
      name: "Anya",
      image: "https://cdn.example/avatars/u1.png",
      emailVerified: true,
      role: "admin",
      onlineMode: "both",
      banned: false,
      banReason: null,
      banExpires: null,
      createdAt: "2026-05-21T00:00:00.000Z",
      updatedAt: "2026-05-22T00:00:00.000Z",
    });
    expect(u.image).toBe("https://cdn.example/avatars/u1.png");
    expect(u.emailVerified).toBe(true);
    expect(u.banned).toBe(false);
    expect(u.banReason).toBeNull();
    expect(u.banExpires).toBeNull();
    expect(u.updatedAt).toBe("2026-05-22T00:00:00.000Z");
  });

  it("round-trips banExpires as a Date instance (better-auth's typed shape)", () => {
    const expiry = new Date("2026-12-31T23:59:59.000Z");
    const u = AdminUserSchema.parse({
      id: "u1",
      email: "a@b.com",
      name: "Anya",
      banned: true,
      banReason: "spam",
      banExpires: expiry,
      createdAt: new Date("2026-01-01"),
    });
    expect(u.banExpires).toBe(expiry);
  });

  it("strips fields not declared on the schema (boundary contract)", () => {
    const u = AdminUserSchema.parse({
      id: "u1",
      email: "a@b.com",
      name: "Anya",
      // None of these are part of AdminUserSchema; default `strip` mode
      // must drop them rather than surfacing untyped data downstream.
      twoFactorEnabled: true,
      passwordHash: "DO_NOT_LEAK",
      sessions: [{ id: "s1" }],
      createdAt: "2026-05-21T00:00:00.000Z",
    });
    expect((u as Record<string, unknown>).twoFactorEnabled).toBeUndefined();
    expect((u as Record<string, unknown>).passwordHash).toBeUndefined();
    expect((u as Record<string, unknown>).sessions).toBeUndefined();
  });

  it("rejects when a required field is missing", () => {
    expect(() =>
      AdminUserSchema.parse({ id: "u1", email: "a@b.com", createdAt: "2026-05-21" }),
    ).toThrow();
  });
});

describe("WsTicketResponseSchema", () => {
  it("accepts a non-empty ticket string", () => {
    expect(WsTicketResponseSchema.parse({ ticket: "abc.def" })).toEqual({ ticket: "abc.def" });
  });

  it("rejects an empty ticket", () => {
    expect(() => WsTicketResponseSchema.parse({ ticket: "" })).toThrow();
  });

  it("rejects a missing ticket", () => {
    expect(() => WsTicketResponseSchema.parse({})).toThrow();
  });

  it("rejects a non-string ticket", () => {
    expect(() => WsTicketResponseSchema.parse({ ticket: 123 })).toThrow();
  });
});

describe("AdminUserListSchema", () => {
  it("accepts an empty list", () => {
    expect(AdminUserListSchema.parse([])).toEqual([]);
  });

  it("parses each row and preserves order", () => {
    const list = AdminUserListSchema.parse([
      { id: "u1", email: "a@b.com", name: "A", createdAt: "2026-01-01" },
      { id: "u2", email: "c@d.com", name: "C", createdAt: "2026-01-02" },
    ]);
    expect(list.map((u) => u.id)).toEqual(["u1", "u2"]);
  });

  it("rejects when any row is malformed", () => {
    expect(() =>
      AdminUserListSchema.parse([
        { id: "u1", email: "a@b.com", name: "A", createdAt: "2026-01-01" },
        // Missing `name`
        { id: "u2", email: "c@d.com", createdAt: "2026-01-02" },
      ]),
    ).toThrow();
  });
});
