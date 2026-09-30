import { describe, expect, expectTypeOf, it } from "vitest";
import { PageViewBodySchema } from "./activity.ts";
import {
  ACTIVITY_TYPES,
  ActivityMetaSchemas,
  type GreetingKind,
  greetingKindOfVia,
  greetingVia,
  isActivityType,
  isPageViewPage,
  PAGE_VIEW_PAGES,
  parseActivityMeta,
} from "./activity-events.ts";
import type { AppGreetingAckBody } from "./greetings.ts";

describe("activity vocabulary", () => {
  it("parses an empty meta for every type (rows may predate every field)", () => {
    for (const type of ACTIVITY_TYPES) {
      expect(parseActivityMeta(type, {})).toEqual({});
    }
  });

  it("keeps a well-formed meta and strips keys the schema doesn't know", () => {
    expect(
      parseActivityMeta("game-vote", {
        date: "2026-09-12",
        slug: "arcs",
        reaction: "hype",
        on: true,
        stray: 1,
      }),
    ).toEqual({ date: "2026-09-12", slug: "arcs", reaction: "hype", on: true });
  });

  it("drops only the malformed field, not the row", () => {
    expect(parseActivityMeta("game-vote", { date: "2026-09-12", slug: 3, on: "yes" })).toEqual({
      date: "2026-09-12",
    });
  });

  it("accepts a second-night key wherever a night is named", () => {
    expect(parseActivityMeta("rsvp", { date: "2026-09-12_2", status: "yes" })).toEqual({
      date: "2026-09-12_2",
      status: "yes",
    });
    expect(parseActivityMeta("rsvp-cleared", { date: "Sept 12" })).toEqual({});
  });

  it("still reads the legacy availability totals and trainer settings", () => {
    expect(parseActivityMeta("availability", { can: 4, maybe: 1 })).toEqual({ can: 4, maybe: 1 });
    expect(parseActivityMeta("quiztopia-settings", { language: "de", newPerDay: 12 })).toEqual({
      language: "de",
      newPerDay: 12,
    });
  });

  it("recognises known types only", () => {
    expect(isActivityType("geography-train")).toBe(true);
    expect(isActivityType("toString")).toBe(false);
    expect(isActivityType("made-up")).toBe(false);
  });

  it("names the greeting kinds the ack endpoint accepts, no more, no less", () => {
    expectTypeOf<GreetingKind>().toEqualTypeOf<AppGreetingAckBody["kind"]>();
    expect(ActivityMetaSchemas["greeting-response"].shape.kind.options).toHaveLength(6);
  });
});

describe("page views", () => {
  it("lists every page once", () => {
    expect(new Set(PAGE_VIEW_PAGES).size).toBe(PAGE_VIEW_PAGES.length);
    expect(isPageViewPage("trainer-study")).toBe(true);
    expect(isPageViewPage("dashboard")).toBe(false);
  });

  it("round-trips a greeting via, and ignores anything else", () => {
    expect(greetingKindOfVia(greetingVia("spotlight"))).toBe("spotlight");
    expect(greetingKindOfVia("greeting:nope")).toBeUndefined();
    expect(greetingKindOfVia("search")).toBeUndefined();
    expect(greetingKindOfVia(undefined)).toBeUndefined();
  });

  it("accepts a beacon with a via and rejects an oversized one", () => {
    expect(
      PageViewBodySchema.parse({ page: "profile-skill", detail: "u1", via: "greeting:spotlight" }),
    ).toEqual({ page: "profile-skill", detail: "u1", via: "greeting:spotlight" });
    const r = PageViewBodySchema.safeParse({ page: "home", via: "x".repeat(65) });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["via"]);
  });
});
