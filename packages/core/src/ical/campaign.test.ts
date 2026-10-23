import { describe, expect, it } from "vitest";
import catalog from "../games/catalog.json";
import {
  buildCampaignDescription,
  buildCampaignSummary,
  CAMPAIGN_NIGHTS,
  campaignBySlug,
  campaignNightFor,
  pickKeeper,
} from "./campaign.ts";
import { DND_SLUG } from "./dnd.ts";

const LOCKED = "2026-10-23 19:00:00";
const gloomhaven = campaignBySlug("gloomhaven");
if (!gloomhaven) throw new Error("gloomhaven missing");

describe("CAMPAIGN_NIGHTS", () => {
  it("lists only catalog games, once each", () => {
    const slugs = new Set(catalog.map((g) => g.slug));
    for (const c of CAMPAIGN_NIGHTS) expect(slugs.has(c.slug), c.slug).toBe(true);
    expect(new Set(CAMPAIGN_NIGHTS.map((c) => c.slug)).size).toBe(CAMPAIGN_NIGHTS.length);
  });
  it("gives D&D the Dungeon Master instead of a keeper", () => {
    expect(campaignBySlug(DND_SLUG)?.keeper).toBe(false);
  });
});

describe("campaignNightFor", () => {
  it("is the campaign once picks are locked and it won", () => {
    expect(campaignNightFor(LOCKED, "gloomhaven")?.night).toBe("Gloomhaven");
  });
  it("is null before picks lock, even if a campaign is leading", () => {
    expect(campaignNightFor(null, "gloomhaven")).toBeNull();
  });
  it("is null when the winner isn't a campaign game", () => {
    expect(campaignNightFor(LOCKED, "catan")).toBeNull();
    expect(campaignNightFor(LOCKED, undefined)).toBeNull();
  });
});

describe("pickKeeper", () => {
  const a = (userId: string, isHost: boolean, status: string, bringing: string[]) => ({
    userId,
    isHost,
    status,
    bringing,
  });
  it("prefers the host when they bring the box", () => {
    const people = [
      a("b", false, "definite", ["gloomhaven"]),
      a("h", true, "definite", ["gloomhaven"]),
    ];
    expect(pickKeeper(people, gloomhaven)?.userId).toBe("h");
  });
  it("falls to a confirmed owner, then to the host", () => {
    expect(
      pickKeeper(
        [
          a("h", true, "definite", []),
          a("m", false, "tentative", ["gloomhaven"]),
          a("b", false, "definite", ["gloomhaven"]),
        ],
        gloomhaven,
      )?.userId,
    ).toBe("b");
    expect(
      pickKeeper([a("h", true, "definite", []), a("b", false, "definite", [])], gloomhaven)?.userId,
    ).toBe("h");
  });
  it("is null on a D&D night", () => {
    const dnd = campaignBySlug(DND_SLUG);
    if (!dnd) throw new Error("dnd missing");
    expect(pickKeeper([a("h", true, "definite", [DND_SLUG])], dnd)).toBeNull();
  });
});

describe("campaign feed copy", () => {
  it("titles the event as the game's night with the host byline", () => {
    expect(buildCampaignSummary("", "Gloomhaven", "Mara")).toBe("Gloomhaven night — Host Mara");
    expect(buildCampaignSummary("[RSVP!]", "Gloomhaven", null)).toBe("[RSVP!] Gloomhaven night");
  });
  it("describes the party, the keeper and the roster, naming no other game", () => {
    const out = buildCampaignDescription({
      campaign: gloomhaven,
      title: "Gloomhaven",
      partyCount: 3,
      tentativeCount: 1,
      keeperName: "Mara",
      party: [
        { name: "Mara", keeper: true, host: true, tentative: false },
        { name: "Bob", keeper: false, host: false, tentative: false },
        { name: "Cara", keeper: false, host: false, tentative: true },
      ],
      deepLink: "https://example.com/offline?date=2026-10-23",
    });
    expect(out).toBe(
      [
        "Tonight's campaign: Gloomhaven.",
        "A party of 3 mercenaries descends beneath the city.",
        "",
        "Mara brings the box. Bring your character box and ability cards.",
        "",
        "The party (3 confirmed, 1 maybe):",
        "• Mara — brings the box (host)",
        "• Bob",
        "• Cara (maybe)",
        "",
        "Open: https://example.com/offline?date=2026-10-23",
      ].join("\n"),
    );
    expect(out).not.toMatch(/top picks|you're bringing/i);
  });
});
