import { describe, expect, it } from "vitest";
import { cardOptions, type InnerAction, priceLabel, priceOf, sortPayments } from "./affordability";

const r = (left: number, right: number) => ({ kind: "resources", left, right }) as const;

describe("affordability", () => {
  it("prices a card from its legal payments", () => {
    expect(priceOf([r(0, 0)], false)).toEqual({ kind: "free" });
    expect(priceOf([r(2, 0), r(1, 2)], false)).toEqual({ kind: "coins", coins: 2 });
    expect(priceOf([r(2, 0), { kind: "chain" }], false)).toEqual({ kind: "chain" });
    expect(priceOf([{ kind: "free-build" }], false)).toEqual({ kind: "olympia" });
    // The Statue of Zeus's free build beats paying, and loses nothing.
    expect(priceOf([r(2, 0), { kind: "free-build" }], false)).toEqual({ kind: "olympia" });
    expect(priceOf([], true)).toEqual({ kind: "none", reason: "Already in your city" });
    expect(priceOf([], false).kind).toBe("none");
  });

  it("dedupes payments and puts free ways first", () => {
    expect(
      sortPayments([r(2, 1), r(0, 2), r(2, 1), { kind: "free-build" }, { kind: "chain" }]),
    ).toEqual([{ kind: "chain" }, { kind: "free-build" }, r(0, 2), r(2, 1)]);
  });

  it("collects what each hand card can do", () => {
    const actions: InnerAction[] = [
      { type: "play-card", cardId: "Altar@1", payment: r(0, 0) },
      { type: "build-wonder", cardId: "Altar@1", payment: r(1, 0) },
      { type: "build-wonder", cardId: "Altar@1", payment: r(1, 0), participate: true },
      { type: "discard", cardId: "Altar@1" },
      { type: "discard", cardId: "Baths@2" },
    ];
    const opts = cardOptions(["Altar@1", "Baths@2", "Theater@3"], actions, ["Theater@9"]);
    const altar = opts.get("Altar@1");
    expect(altar?.price).toEqual({ kind: "free" });
    expect(altar?.wonder).toEqual([r(1, 0)]);
    expect(altar?.canDiscard).toBe(true);
    expect(altar?.canParticipate).toBe(true);
    expect(opts.get("Baths@2")?.price.kind).toBe("none");
    expect(opts.get("Theater@3")?.price).toEqual({ kind: "none", reason: "Already in your city" });
  });

  it("labels prices short", () => {
    expect(priceLabel({ kind: "coins", coins: 3 })).toBe("3");
    expect(priceLabel({ kind: "chain" })).toBe("Chain");
  });
});
