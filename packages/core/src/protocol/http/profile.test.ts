import { describe, expect, it } from "vitest";
import {
  ProfileDirectoryResponseSchema,
  ProfileUpdateInputSchema,
  PublicProfileSchema,
  SkillChartSchema,
} from "./profile.ts";

const validEditable = {
  tagline: "Meeple enjoyer",
  bio: null,
  pronouns: "they/them",
  location: "Vilnius",
  accentHex: "#6366f1",
  favorites: ["lost-cities", "sushi-go"],
  wishlist: ["parks"],
  links: [{ label: "BGG", url: "https://boardgamegeek.com/user/x" }],
};

describe("ProfileUpdateInputSchema", () => {
  it("accepts a well-formed full-replace body", () => {
    expect(ProfileUpdateInputSchema.parse(validEditable)).toMatchObject({
      tagline: "Meeple enjoyer",
    });
  });

  it("rejects a bad accent hex", () => {
    const r = ProfileUpdateInputSchema.safeParse({ ...validEditable, accentHex: "blue" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["accentHex"]);
  });

  it("rejects too many favorites", () => {
    const favorites = Array.from({ length: 13 }, (_, i) => `game-${i}`);
    const r = ProfileUpdateInputSchema.safeParse({ ...validEditable, favorites });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["favorites"]);
  });

  it("rejects a non-url link", () => {
    const r = ProfileUpdateInputSchema.safeParse({
      ...validEditable,
      links: [{ label: "x", url: "not a url" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("SkillChartSchema", () => {
  it("accepts null (not yet generated)", () => {
    expect(SkillChartSchema.parse(null)).toBeNull();
  });

  it("accepts 3–8 axes with 0..1 values", () => {
    const chart = {
      axes: [
        { label: "Strategy", value: 0.8 },
        { label: "Luck", value: 0.3 },
        { label: "Social", value: 1 },
      ],
    };
    expect(SkillChartSchema.parse(chart)).toEqual(chart);
  });

  it("rejects an out-of-range value", () => {
    const r = SkillChartSchema.safeParse({
      axes: [
        { label: "a", value: 1.5 },
        { label: "b", value: 0.2 },
        { label: "c", value: 0.2 },
      ],
    });
    expect(r.success).toBe(false);
  });
});

describe("PublicProfileSchema", () => {
  it("parses a full aggregate", () => {
    const payload = {
      user: {
        id: "u1",
        name: "Ada",
        image: null,
        role: "user",
        memberSince: "2026-01-02T00:00:00.000Z",
      },
      profile: validEditable,
      library: ["lost-cities"],
      skill: null,
      stats: {
        gamesPlayed: 3,
        wins: 2,
        losses: 1,
        winRate: 0.6666666666666666,
        gamesOwned: 1,
        distinctGames: 2,
        nightsAttended: 4,
        nightsTotal: 6,
        favoriteGameSlug: "lost-cities",
        perGame: [{ slug: "lost-cities", title: "Lost Cities", plays: 2, wins: 1 }],
      },
      recentMatches: [],
      nextNight: {
        dateKey: "2026-07-01",
        eventTime: "19:30",
        address: null,
        hostName: "Ada",
        status: "definite",
        attendeeCount: 5,
      },
    };
    expect(PublicProfileSchema.parse(payload).user.name).toBe("Ada");
  });
});

describe("ProfileDirectoryResponseSchema", () => {
  it("parses directory entries", () => {
    const payload = {
      players: [
        {
          id: "u1",
          name: "Ada",
          image: null,
          tagline: null,
          accentHex: null,
          gamesOwned: 3,
          nextNightDateKey: null,
        },
      ],
    };
    expect(ProfileDirectoryResponseSchema.parse(payload).players).toHaveLength(1);
  });
});
