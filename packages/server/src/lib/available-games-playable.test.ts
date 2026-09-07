// "Playable tonight" decides which votes count on the attendee cards and
// which games can make the top-5. It must use the catalog's `bggOverrides`
// (applied once in `@boardgames/core/bgg`), not BGG's raw player cap: the
// party games are marked `maxPlayers: "infinity"` precisely because they
// scale to any group, and a nine-person night used to drop every vote for
// them while the browser showed "2–∞".

import { getBggBySlug } from "@boardgames/core/bgg";
import { describe, expect, it } from "vitest";
import { computePlayableSlugs } from "./available-games.ts";

const OVERRIDDEN = ["codenames", "decrypto", "exploding-kittens", "wavelength"];

describe("computePlayableSlugs", () => {
  it("uses the overridden player counts, so unlimited party games fit a big night", () => {
    for (const slug of OVERRIDDEN) {
      expect(getBggBySlug(slug)?.maxPlayers, slug).toBe("infinity");
    }
    const owned = [...OVERRIDDEN, "blood-on-the-clocktower", "sushi-go"];
    const playable = computePlayableSlugs(owned, 9, 10);
    for (const slug of OVERRIDDEN) expect(playable.has(slug), slug).toBe(true);
    // A genuinely capped game still drops out …
    expect(playable.has("sushi-go")).toBe(false);
    // … and a big-table game with no override is judged on its real range.
    expect(playable.has("blood-on-the-clocktower")).toBe(true);
  });

  it("still respects a minimum that the headcount does not reach", () => {
    expect(computePlayableSlugs(["blood-on-the-clocktower"], 3, 4).size).toBe(0);
  });
});
