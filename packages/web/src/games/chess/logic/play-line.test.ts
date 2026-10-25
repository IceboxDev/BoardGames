import { describe, expect, it } from "vitest";
import { lineFromSearch, playFromHereUrl } from "./play-line";

describe("play from here", () => {
  it("round-trips a line through the setup URL", () => {
    const url = playFromHereUrl(["e2e4", "e7e5", "g1f3"], "b");
    expect(url).toBe("/play/chess/solo?line=e2e4.e7e5.g1f3&side=b");
    expect(lineFromSearch(new URL(url, "http://x").searchParams)).toEqual({
      moves: ["e2e4", "e7e5", "g1f3"],
      side: "b",
    });
  });
  it("ignores a missing or illegal line", () => {
    expect(lineFromSearch(new URLSearchParams(""))).toBeNull();
    expect(lineFromSearch(new URLSearchParams("line=e2e5"))).toBeNull();
  });
});
