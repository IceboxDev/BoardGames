import { describe, expect, it } from "vitest";
import {
  AdminArrivalsStateSchema,
  ARRIVAL_GAMES_MAX,
  ARRIVAL_PHOTO_UPLOAD_MAX_CHARS,
  ArrivalGreetingSchema,
  ArrivalVoterFaceSchema,
  PublishArrivalBodySchema,
} from "./arrivals.ts";

const PLACEHOLDER = "data:image/webp;base64,UklGRiIAAABXRUJQVlA4";
const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg";

const game = (slug: string) => ({
  slug,
  purchaser: { id: "u1", name: "Mantas", image: null, accentHex: "#6366f1" },
  votes: 4,
  voters: [
    { image: "data:image/webp;base64,UklGRiIAAABXRUJQVlA4", accentHex: "#d36830" },
    { image: null, accentHex: null },
  ],
  photoUrl: `/api/arrivals/a1/photos/${slug}`,
  placeholder: PLACEHOLDER,
  width: 1280,
  height: 1600,
});

describe("ArrivalGreetingSchema", () => {
  it("parses a three-game arrival", () => {
    const parsed = ArrivalGreetingSchema.parse({
      kind: "arrival",
      arrivalId: "a1",
      pollId: 3,
      publishedAt: "2026-09-10 12:00:00",
      games: [game("arcs"), game("wingspan"), game("spirit-island")],
      totals: { voterCount: 6, votesCast: 15 },
    });
    expect(parsed.games).toHaveLength(3);
    expect(parsed.games[0]?.voters[1]?.image).toBeNull();
  });

  it("rejects zero games and more than the cap", () => {
    const base = {
      kind: "arrival",
      arrivalId: "a1",
      pollId: 3,
      publishedAt: "2026-09-10 12:00:00",
      totals: { voterCount: 6, votesCast: 15 },
    };
    expect(ArrivalGreetingSchema.safeParse({ ...base, games: [] }).success).toBe(false);
    const tooMany = Array.from({ length: ARRIVAL_GAMES_MAX + 1 }, (_, i) => game(`g${i}`));
    const r = ArrivalGreetingSchema.safeParse({ ...base, games: tooMany });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["games"]);
  });

  it("rejects a photo url outside the arrivals photo route", () => {
    const r = ArrivalGreetingSchema.safeParse({
      kind: "arrival",
      arrivalId: "a1",
      pollId: 3,
      publishedAt: "2026-09-10 12:00:00",
      games: [{ ...game("arcs"), photoUrl: "https://evil.example/x.webp" }],
      totals: { voterCount: 6, votesCast: 15 },
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["games", 0, "photoUrl"]);
  });
});

describe("ArrivalVoterFaceSchema (faces only)", () => {
  it("accepts an image and an accent, both nullable", () => {
    expect(() => ArrivalVoterFaceSchema.parse({ image: null, accentHex: null })).not.toThrow();
  });

  it("rejects a leaked user id or name", () => {
    for (const leak of [{ id: "u1" }, { name: "Mantas" }, { userId: "u1" }]) {
      const r = ArrivalVoterFaceSchema.safeParse({ image: null, accentHex: null, ...leak });
      expect(r.success).toBe(false);
    }
  });

  it("rejects a malformed accent", () => {
    expect(ArrivalVoterFaceSchema.safeParse({ image: null, accentHex: "red" }).success).toBe(false);
  });
});

describe("PublishArrivalBodySchema", () => {
  const entry = (slug: string) => ({ slug, purchaserUserId: "u1", photo: PHOTO });

  it("accepts one to three games", () => {
    expect(() =>
      PublishArrivalBodySchema.parse({ pollId: 1, games: [entry("arcs")] }),
    ).not.toThrow();
    expect(() =>
      PublishArrivalBodySchema.parse({
        pollId: 1,
        games: [entry("arcs"), entry("wingspan"), entry("spirit-island")],
      }),
    ).not.toThrow();
  });

  it("rejects zero and four games", () => {
    expect(PublishArrivalBodySchema.safeParse({ pollId: 1, games: [] }).success).toBe(false);
    const r = PublishArrivalBodySchema.safeParse({
      pollId: 1,
      games: [entry("arcs"), entry("wingspan"), entry("spirit-island"), entry("cascadia")],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["games"]);
  });

  it("rejects a duplicate slug at its position", () => {
    const r = PublishArrivalBodySchema.safeParse({
      pollId: 1,
      games: [entry("arcs"), entry("arcs")],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["games", 1, "slug"]);
  });

  it("rejects a non-image data uri and an oversized one", () => {
    const text = PublishArrivalBodySchema.safeParse({
      pollId: 1,
      games: [{ ...entry("arcs"), photo: "data:text/plain;base64,aGk=" }],
    });
    expect(text.success).toBe(false);
    if (!text.success) expect(text.error.issues[0]?.path).toEqual(["games", 0, "photo"]);
    const huge = PublishArrivalBodySchema.safeParse({
      pollId: 1,
      games: [{ ...entry("arcs"), photo: PHOTO + "A".repeat(ARRIVAL_PHOTO_UPLOAD_MAX_CHARS) }],
    });
    expect(huge.success).toBe(false);
  });
});

describe("AdminArrivalsStateSchema", () => {
  it("parses closed polls, published arrivals and the player side-car", () => {
    const parsed = AdminArrivalsStateSchema.parse({
      polls: [
        {
          id: 3,
          createdAt: "2026-09-01 10:00:00",
          closedAt: "2026-09-03 16:00:00",
          winnerSlug: "arcs",
          candidates: ["arcs", "wingspan"],
          voterCount: 5,
          tally: [
            { slug: "arcs", votes: 4, voterIds: ["u1", "u2", "u3", "u4"] },
            { slug: "wingspan", votes: 1, voterIds: ["u5"] },
          ],
          arrivedSlugs: ["arcs"],
        },
      ],
      arrivals: [
        {
          id: "a1",
          pollId: 3,
          publishedAt: "2026-09-10 12:00:00",
          publishedBy: "admin",
          seenBy: 2,
          games: [
            {
              slug: "arcs",
              purchaserUserId: "u1",
              votes: 4,
              photoUrl: "/api/arrivals/a1/photos/arcs",
              placeholder: PLACEHOLDER,
              width: 1280,
              height: 1600,
              photoBytes: 240_000,
            },
          ],
        },
      ],
      players: { u1: { name: "Mantas", image: null }, admin: { name: "Admin", image: null } },
    });
    expect(parsed.polls[0]?.arrivedSlugs).toEqual(["arcs"]);
    expect(parsed.arrivals[0]?.seenBy).toBe(2);
  });
});
