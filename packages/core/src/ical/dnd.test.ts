import { describe, expect, it } from "vitest";
import {
  buildDndDescription,
  buildDndSummary,
  DND_SLUG,
  type DndPartyMember,
  isDndFeedNight,
} from "./dnd.ts";

describe("DND_SLUG", () => {
  it("matches the catalog slug shared with the web", () => {
    // Mirror of web/src/lib/dnd-night.ts re-export — a drift guard.
    expect(DND_SLUG).toBe("dungeons-and-dragons");
  });
});

describe("isDndFeedNight", () => {
  it("is true only when picks are locked AND the vote winner is D&D", () => {
    expect(isDndFeedNight("2026-06-24 19:00:00", DND_SLUG)).toBe(true);
  });
  it("is false before picks lock, even if D&D is leading", () => {
    expect(isDndFeedNight(null, DND_SLUG)).toBe(false);
  });
  it("is false when the winner is another game", () => {
    expect(isDndFeedNight("2026-06-24 19:00:00", "catan")).toBe(false);
  });
  it("is false when there is no winning slug", () => {
    expect(isDndFeedNight("2026-06-24 19:00:00", undefined)).toBe(false);
  });
});

describe("buildDndSummary", () => {
  it("reads as the quest with the DM in the byline", () => {
    expect(buildDndSummary("", "Alice")).toBe("🐉 Dungeons & Dragons — DM Alice");
  });
  it("keeps a personal prefix ahead of the base", () => {
    expect(buildDndSummary("[RSVP!]", "Alice")).toBe("[RSVP!] 🐉 Dungeons & Dragons — DM Alice");
  });
  it("drops the byline when there is no DM", () => {
    expect(buildDndSummary("", null)).toBe("🐉 Dungeons & Dragons");
  });
});

describe("buildDndDescription", () => {
  const party: DndPartyMember[] = [
    { name: "Alice", role: "dm", tentative: false },
    { name: "Bob", role: "player", tentative: false },
    { name: "Cara", role: "player", tentative: true },
  ];

  it("renders the quest, party-size, dice note, roster, and deep link", () => {
    const out = buildDndDescription({
      partyCount: 2,
      tentativeCount: 1,
      party,
      personalNudge: null,
      deepLink: "https://example.com/offline?date=2026-06-24",
    });
    expect(out).toBe(
      [
        "Tonight's quest: Dungeons & Dragons.",
        "A party of 2 adventurers gathers by torchlight.",
        "",
        "Bring nothing but your dice, your character sheet, and your courage — the Dungeon Master has the rest.",
        "",
        "The party (2 confirmed, 1 maybe):",
        "• Alice — Dungeon Master",
        "• Bob",
        "• Cara (maybe)",
        "",
        "Open: https://example.com/offline?date=2026-06-24",
      ].join("\n"),
    );
  });

  it("never names another game (no Top picks / You're bringing)", () => {
    const out = buildDndDescription({ partyCount: 3, tentativeCount: 0, party });
    expect(out).not.toMatch(/top picks/i);
    expect(out).not.toMatch(/you're bringing/i);
  });

  it("uses the singular for a solo party", () => {
    const out = buildDndDescription({ partyCount: 1, tentativeCount: 0, party: [] });
    expect(out).toContain("A party of 1 adventurer gathers by torchlight.");
  });

  it("surfaces a personal nudge when present", () => {
    const out = buildDndDescription({
      partyCount: 2,
      tentativeCount: 0,
      party,
      personalNudge: "Answer the call — RSVP in the planner.",
    });
    expect(out).toContain("Answer the call — RSVP in the planner.");
  });
});
