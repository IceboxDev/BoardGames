import { describe, expect, it } from "vitest";
import { ExitNightStateSchema, ExitVoteBodySchema } from "./exit.ts";

describe("ExitNightStateSchema", () => {
  it("parses a happy-path payload", () => {
    const parsed = ExitNightStateSchema.parse({
      owners: { "exit-abandoned-cabin": ["u1", "u2"] },
      votes: { "exit-abandoned-cabin": ["u1"], "exit-pharaohs-tomb": [] },
    });
    expect(parsed.owners["exit-abandoned-cabin"]).toEqual(["u1", "u2"]);
  });

  it("tolerates unknown (retired) box slugs on read", () => {
    expect(() =>
      ExitNightStateSchema.parse({ owners: { "exit-gone-box": ["u1"] }, votes: {} }),
    ).not.toThrow();
  });

  it("rejects a non-array owner value", () => {
    const r = ExitNightStateSchema.safeParse({ owners: { "exit-secret-lab": "u1" }, votes: {} });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["owners", "exit-secret-lab"]);
  });
});

describe("ExitVoteBodySchema", () => {
  it("accepts a real box slug", () => {
    expect(() =>
      ExitVoteBodySchema.parse({ date: "2026-08-21", slug: "exit-abandoned-cabin", on: true }),
    ).not.toThrow();
  });

  it("rejects a slug that names no EXIT box", () => {
    const r = ExitVoteBodySchema.safeParse({ date: "2026-08-21", slug: "lost-cities", on: true });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["slug"]);
  });

  it("rejects a malformed date", () => {
    const r = ExitVoteBodySchema.safeParse({
      date: "21-08-2026",
      slug: "exit-abandoned-cabin",
      on: true,
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["date"]);
  });
});
