import { beforeEach, describe, expect, it } from "vitest";
import { stepsBackOut, stepsBackTo } from "./history-trail";

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

  it("goes back to the page this one was opened from, not past it to the parent", () => {
    // Dashboard → players list → a player: Back lands on the list.
    trail(["/", "/players", "/u/abc"]);
    expect(stepsBackOut(2)).toBe(1);
    // Library with a filter → game menu: Back keeps the filtered library.
    trail(["/", "/games?players=2", "/play/codenames"]);
    expect(stepsBackOut(2)).toBe(1);
  });

  it("steps over this page and pages beneath it in one go", () => {
    // Game browser → menu → room → menu: Back from the menu reaches the browser.
    trail(["/games", "/play/codenames", "/play/codenames/mp/room/AB", "/play/codenames"]);
    expect(stepsBackOut(3)).toBe(3);
    // A solo game one entry above its own setup screen.
    trail(["/play/codenames", "/play/codenames/solo", "/play/codenames/solo"]);
    expect(stepsBackOut(2)).toBe(2);
  });

  it("finds nothing when every entry behind is this page or beneath it", () => {
    trail(["/play/codenames/solo", "/play/codenames"]);
    expect(stepsBackOut(1)).toBeNull();
  });
});
