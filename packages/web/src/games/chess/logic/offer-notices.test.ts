import { describe, expect, it } from "vitest";
import { claimCountdown, type OfferState, refusal, standingStatus } from "./offer-notices";

const state = (over: Partial<OfferState> = {}): OfferState => ({
  drawOffer: null,
  takebackRequest: null,
  plies: 10,
  over: false,
  ...over,
});

describe("standingStatus", () => {
  it("puts your offer on your strip and theirs on theirs", () => {
    expect(standingStatus(state({ drawOffer: "w" }), "w").w?.text).toBe("½ Draw offered");
    expect(standingStatus(state({ drawOffer: "b" }), "w").b).toEqual({
      text: "Offers a draw",
      tone: "accent",
    });
    expect(standingStatus(state({ takebackRequest: "b" }), "w").b?.text).toBe("Asks to take back");
    expect(standingStatus(state({ takebackRequest: "w" }), "w").w?.text).toBe("Asked to take back");
  });
  it("says nothing once the game is over", () => {
    expect(standingStatus(state({ drawOffer: "b", over: true }), "w")).toEqual({
      w: null,
      b: null,
    });
  });
});

describe("refusal", () => {
  it("tells a person's refused or lapsed draw", () => {
    const before = state({ drawOffer: "w" });
    expect(refusal(before, state(), null, "w", false)?.text).toBe("Declined your draw");
    expect(refusal(before, state({ plies: 11 }), null, "w", false)?.text).toBe(
      "Declined your draw",
    );
  });
  it("tells the AI's instant decline, which no view ever showed", () => {
    expect(refusal(state(), state(), "draw", "w", true)?.text).toBe("Declines: it isn't worse");
  });
  it("is silent when the draw was accepted or still stands", () => {
    expect(refusal(state(), state({ over: true }), "draw", "w", true)).toBeNull();
    expect(refusal(state(), state({ drawOffer: "w" }), "draw", "w", false)).toBeNull();
  });
  it("tells a refused takeback, but not an allowed one", () => {
    const asked = state({ takebackRequest: "w" });
    expect(refusal(asked, state(), null, "w", false)?.text).toBe("Refused the takeback");
    expect(refusal(asked, state({ plies: 8 }), null, "w", false)).toBeNull();
  });
});

describe("claimCountdown", () => {
  it("counts down in m:ss", () => {
    expect(claimCountdown(60_000, 17_500)).toBe("0:43");
    expect(claimCountdown(60_000, 70_000)).toBe("0:00");
  });
});
