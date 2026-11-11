import { describe, expect, it } from "vitest";
import { HibernateBodySchema, SiteLogResponseSchema, SiteStatusSchema } from "./site.ts";

const memorial = {
  nights: 120,
  matches: 640,
  onlineGames: 900,
  members: 18,
  firstNight: "2025-03-14",
  lastNight: "2026-11-07",
  topGames: [{ slug: "lost-cities", title: "Lost Cities", plays: 210 }],
};

describe("SiteStatusSchema", () => {
  it("parses a hibernated status", () => {
    const s = SiteStatusSchema.parse({
      hibernated: true,
      since: "2026-11-11T20:00:00.000Z",
      memorial,
      onlineAccess: true,
      admin: false,
    });
    expect(s.memorial?.topGames[0]?.slug).toBe("lost-cities");
  });

  it("parses an awake status", () => {
    expect(() =>
      SiteStatusSchema.parse({
        hibernated: false,
        since: null,
        memorial: null,
        onlineAccess: false,
        admin: false,
      }),
    ).not.toThrow();
  });

  it("rejects a negative total", () => {
    const r = SiteStatusSchema.safeParse({
      hibernated: true,
      since: null,
      memorial: { ...memorial, nights: -1 },
      onlineAccess: false,
      admin: false,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["memorial", "nights"]);
  });
});

describe("HibernateBodySchema", () => {
  it("accepts the typed confirmation", () => {
    expect(() => HibernateBodySchema.parse({ confirm: "HIBERNATE" })).not.toThrow();
  });

  it("rejects anything else", () => {
    const r = HibernateBodySchema.safeParse({ confirm: "hibernate" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["confirm"]);
  });
});

describe("SiteLogResponseSchema", () => {
  it("rejects an unknown action", () => {
    const r = SiteLogResponseSchema.safeParse({
      entries: [{ at: "2026-11-11", action: "delete", byName: null }],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["entries", 0, "action"]);
  });
});
