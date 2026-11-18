import { beforeEach, describe, expect, it } from "vitest";
import { previousIsSamePage, stepsBackTo } from "./history-trail";

function trail(paths: string[]) {
  sessionStorage.setItem("history-trail", JSON.stringify({ ...paths }));
}

beforeEach(() => sessionStorage.clear());

describe("history trail", () => {
  it("finds the nearest earlier entry of a page, however many trips came since", () => {
    // Game browser → menu → game → menu → game: Back from the menu skips the old game entries.
    trail(["/games", "/play/codenames", "/play/codenames/mp/room/AB", "/play/codenames"]);
    expect(stepsBackTo("/games", 3)).toBe(3);
    expect(stepsBackTo("/play/codenames/", 2)).toBe(1);
  });

  it("knows nothing of entries ahead, or of a page never visited", () => {
    trail(["/play/codenames", "/games"]);
    expect(stepsBackTo("/games", 0)).toBeNull();
    expect(stepsBackTo("/settings", 1)).toBeNull();
  });

  it("sees a solo game sitting one entry above its own setup screen", () => {
    trail(["/play/codenames", "/play/codenames/solo", "/play/codenames/solo"]);
    expect(previousIsSamePage(2)).toBe(true);
    expect(previousIsSamePage(1)).toBe(false);
  });
});
