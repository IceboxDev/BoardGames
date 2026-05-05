import { describe, expect, it } from "vitest";
import { AuthConfigSchema, SessionUserSchema, SetOnlineBodySchema } from "./auth.ts";

describe("AuthConfigSchema", () => {
  it("accepts the boolean flag", () => {
    expect(AuthConfigSchema.parse({ googleEnabled: true })).toEqual({ googleEnabled: true });
    expect(AuthConfigSchema.parse({ googleEnabled: false })).toEqual({ googleEnabled: false });
  });

  it("rejects missing flag", () => {
    expect(() => AuthConfigSchema.parse({})).toThrow();
  });
});

describe("SessionUserSchema", () => {
  it("defaults role to 'user' and onlineEnabled to false", () => {
    const u = SessionUserSchema.parse({ id: "u1", email: "a@b.com" });
    expect(u.role).toBe("user");
    expect(u.onlineEnabled).toBe(false);
  });

  it("accepts admin role and online flag", () => {
    const u = SessionUserSchema.parse({
      id: "u1",
      email: "a@b.com",
      role: "admin",
      onlineEnabled: true,
    });
    expect(u.role).toBe("admin");
    expect(u.onlineEnabled).toBe(true);
  });

  it("rejects an unknown role string", () => {
    expect(() =>
      SessionUserSchema.parse({ id: "u1", email: "a@b.com", role: "superadmin" }),
    ).toThrow();
  });
});

describe("SetOnlineBodySchema", () => {
  it("accepts a boolean", () => {
    expect(SetOnlineBodySchema.parse({ onlineEnabled: true })).toEqual({ onlineEnabled: true });
  });

  it("rejects non-boolean", () => {
    expect(() => SetOnlineBodySchema.parse({ onlineEnabled: "yes" })).toThrow();
  });
});
