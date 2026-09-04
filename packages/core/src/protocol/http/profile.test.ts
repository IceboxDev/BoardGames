import { describe, expect, it } from "vitest";
import {
  ProfileDirectoryResponseSchema,
  ProfileUpdateInputSchema,
  PublicProfileSchema,
  SkillChartSchema,
  ThemeConfigSchema,
} from "./profile.ts";

const validTheme = {
  preset: "classic",
  surface950: "#08090d",
  surface900: "#0f1117",
  surface800: "#171923",
  surface700: "#1f2233",
  surface600: "#2a2d42",
  fgPrimary: "#e2e6ee",
  fgSecondary: "#9aa3b4",
  fgMuted: "#6b7387",
  fgDisabled: "#495164",
  accent: "#6366f1",
  neonCyan: "#22d3ee",
  neonPurple: "#a855f7",
  neonPink: "#ec4899",
  pattern: "none",
  patternColor: "#6366f1",
  patternOpacity: 0.4,
  wallpaper: false,
  radiusCard: 12,
  radiusUi: 8,
  selectionStyle: "bar",
  fontFamily: "inter",
  baseFontSize: 16,
  ambientMode: "auto",
  ambientEffect: null,
  accentMode: "custom",
};

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

describe("ThemeConfigSchema", () => {
  it("accepts a complete config", () => {
    expect(ThemeConfigSchema.parse(validTheme)).toEqual(validTheme);
  });

  it("rejects a non-hex surface color", () => {
    const r = ThemeConfigSchema.safeParse({ ...validTheme, surface900: "not-a-color" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["surface900"]);
  });

  it("rejects an out-of-range pattern opacity", () => {
    const r = ThemeConfigSchema.safeParse({ ...validTheme, patternOpacity: 1.5 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["patternOpacity"]);
  });

  it("rejects a base font size outside 12–20", () => {
    const r = ThemeConfigSchema.safeParse({ ...validTheme, baseFontSize: 24 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["baseFontSize"]);
  });

  it("rejects an unknown selection style", () => {
    const r = ThemeConfigSchema.safeParse({ ...validTheme, selectionStyle: "sparkle" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["selectionStyle"]);
  });

  it("stays optional on the full-replace PUT body (legacy writers omit it)", () => {
    // Absent → parses (server preserves the stored theme); explicit null and
    // explicit object both parse too.
    expect(ProfileUpdateInputSchema.parse(validEditable).theme).toBeUndefined();
    expect(ProfileUpdateInputSchema.parse({ ...validEditable, theme: null }).theme).toBeNull();
    expect(ProfileUpdateInputSchema.parse({ ...validEditable, theme: validTheme }).theme).toEqual(
      validTheme,
    );
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
        performance: 0.75,
        moderated: 0,
        ongoing: 0,
        scored: 0,
        gamesOwned: 1,
        distinctGames: 2,
        nightsAttended: 4,
        nightsTotal: 6,
        favoriteGameSlug: "lost-cities",
        perGame: [
          {
            slug: "lost-cities",
            title: "Lost Cities",
            plays: 2,
            wins: 1,
            losses: 1,
            moderated: 0,
            ongoing: 0,
            performance: 0.5,
            coopScoreAvg: null,
            coopPlays: 0,
          },
        ],
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
