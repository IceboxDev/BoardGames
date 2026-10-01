import { describe, expect, it } from "vitest";
import { resolveGame } from "../../lib/games-by-slug";
import {
  seatRange,
  slateAccent,
  smallestMaxPlayers,
  voteShortTitle,
  voteTagline,
} from "./vote-copy";

const game = (slug: string) => {
  const g = resolveGame(slug);
  if (!g) throw new Error(slug);
  return g;
};

describe("vote copy", () => {
  it("splits a themed title at the colon", () => {
    const t = "The October vote: games for the whole table";
    expect(voteShortTitle(t)).toBe("The October vote");
    expect(voteTagline(t)).toBe("Games for the whole table");
    expect(voteShortTitle(null)).toBe("The new vote");
    expect(voteTagline("Just a title")).toBeNull();
  });

  it("finds the smallest top seat count across the slate", () => {
    expect(smallestMaxPlayers([game("two-rooms-and-a-boom"), game("telestrations")])).toBe(8);
    expect(smallestMaxPlayers([])).toBeNull();
  });

  it("formats seat ranges, open-ended ones as ∞", () => {
    expect(seatRange(game("telestrations"))).toBe("4–8");
    expect(seatRange(game("cartographers"))).toBe("1–∞");
  });

  it("blends the slate into one lifted accent", () => {
    expect(slateAccent([])).toBe("#f59e0b");
    expect(slateAccent([game("telestrations")], 0)).toBe(game("telestrations").accentHex);
    expect(slateAccent([game("telestrations")], 1)).toBe("#ffffff");
  });
});
