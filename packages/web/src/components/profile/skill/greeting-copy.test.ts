import type { SpotlightEvent } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { type SpotlightVoice, spotlightCopy, spotlightLine } from "./greeting-copy.ts";

const YOU: SpotlightVoice = { voice: "you", firstName: "Riccardo" };
const THEM: SpotlightVoice = { voice: "them", firstName: "Riccardo" };

const CROWN: SpotlightEvent = { kind: "trait-climb", trait: "pln", from: 4, to: 1, fieldSize: 12 };
const CLIMB: SpotlightEvent = { kind: "trait-climb", trait: "per", from: 5, to: 3, fieldSize: 12 };
const ENTRY: SpotlightEvent = {
  kind: "trait-climb",
  trait: "soc",
  from: null,
  to: 2,
  fieldSize: 9,
};
const GAME: SpotlightEvent = { kind: "game-climb", slug: "durak", from: 2, to: 1, fieldSize: 6 };
const UNLOCK: SpotlightEvent = { kind: "profile-unlocked", ratedMatches: 9, distinctGames: 3 };
const STREAK: SpotlightEvent = { kind: "streak-lead", length: 5 };

const ALL = [CROWN, CLIMB, ENTRY, GAME, UNLOCK, STREAK];

describe("spotlightCopy", () => {
  it("addresses the subject in second person and everyone else by name", () => {
    expect(spotlightCopy(CROWN, YOU).title).toBe("You're the group's new Planning leader");
    expect(spotlightCopy(CROWN, THEM).title).toBe("Riccardo is the group's new Planning leader");
    expect(spotlightCopy(UNLOCK, YOU).title).toBe("Your skill profile just unlocked");
    expect(spotlightCopy(UNLOCK, THEM).title).toBe("Riccardo's skill profile just unlocked");
  });

  it("agrees with its subject on the streak line", () => {
    expect(spotlightCopy(STREAK, YOU).title).toBe("You hold the longest run going");
    expect(spotlightCopy(STREAK, THEM).title).toBe("Riccardo holds the longest run going");
  });

  it("names the ordinal reached for a non-crown climb", () => {
    expect(spotlightCopy(CLIMB, THEM).title).toBe("Riccardo climbed to 3rd in Perception");
    expect(spotlightCopy(CLIMB, THEM).detail).toBe("Two places gained.");
  });

  it("phrases a first appearance as arriving, not as climbing from nowhere", () => {
    expect(spotlightCopy(ENTRY, THEM).detail).toBe("A first appearance on this board.");
  });

  it("keeps a long game title out of the tracked-caps eyebrow", () => {
    const long: SpotlightEvent = {
      kind: "game-climb",
      slug: "blood-on-the-clocktower",
      from: 2,
      to: 1,
      fieldSize: 9,
    };
    expect(spotlightCopy(long, THEM).eyebrow).toBe("New name at the top");
  });

  it("keeps every headline to one clause and every eyebrow short", () => {
    for (const event of ALL) {
      for (const v of [YOU, THEM]) {
        const copy = spotlightCopy(event, v);
        expect(copy.title.length).toBeLessThanOrEqual(48);
        expect(copy.eyebrow.length).toBeLessThanOrEqual(28);
      }
    }
  });

  it("never says 'of N', never says club, and never frames the news as a loss", () => {
    for (const event of ALL) {
      for (const v of [YOU, THEM]) {
        const { eyebrow, title, detail } = spotlightCopy(event, v);
        const all = `${eyebrow} ${title} ${detail}`;
        expect(all).not.toMatch(/\bof \d/);
        expect(all.toLowerCase()).not.toContain("club");
        // Someone reaching 1st means someone else stopped being 1st. That
        // person is never mentioned, and the move is never described from
        // their side. ("the one to beat" is about the subject, and stays.)
        expect(all.toLowerCase()).not.toMatch(/overtook|ahead of|dropped|knocked|pushed out/);
      }
    }
  });

  it("mentions nobody but the subject", () => {
    const others = ["Mantas", "Aydan", "Melanie", "Jaqueline", "Simon", "Sarah"];
    for (const event of ALL) {
      for (const v of [YOU, THEM]) {
        const { eyebrow, title, detail } = spotlightCopy(event, v);
        const all = `${eyebrow} ${title} ${detail}`;
        for (const name of others) expect(all).not.toContain(name);
      }
    }
  });
});

describe("spotlightLine", () => {
  it("fits a runner-up mention on one line in both voices", () => {
    expect(spotlightLine(GAME, THEM)).toBe("Riccardo reached 1st at Durak");
    expect(spotlightLine(STREAK, YOU)).toBe("You are on five straight wins");
    expect(spotlightLine(UNLOCK, THEM)).toBe("Riccardo's skill profile unlocked");
    for (const event of ALL) {
      expect(spotlightLine(event, THEM).length).toBeLessThanOrEqual(46);
    }
  });
});
