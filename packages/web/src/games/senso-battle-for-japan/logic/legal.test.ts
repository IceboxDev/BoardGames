import type { Action } from "@boardgames/core/games/senso-battle-for-japan/types";
import { describe, expect, it } from "vitest";
import {
  aggressionSquares,
  balanceSources,
  balanceTargets,
  bonusRegions,
  determinationRegions,
  emperorClans,
  kindAvailable,
  passAction,
  playableCards,
} from "./legal";

const LEGAL: Action[] = [
  { type: "balance-swap", region: 6, square: 1 },
  { type: "balance-move", region: 6, square: 1, to: 5 },
  { type: "balance-move", region: 6, square: 1, to: 8 },
  { type: "balance-replace", region: 8, square: 2, to: 9 },
  { type: "determination", region: 3 },
  { type: "aggression", region: 0, square: 0 },
  { type: "determination", region: 1, as: "oda" },
  { type: "aggression", region: 4, square: 0, as: "mori" },
  { type: "pass" },
];

describe("legal-action indexers", () => {
  it("groups plays, passes and Emperor clans", () => {
    expect(playableCards([{ type: "play", card: "oda-3" }, { type: "pass" }])).toEqual(
      new Set(["oda-3"]),
    );
    expect(passAction(LEGAL)).toEqual({ type: "pass" });
    expect(emperorClans(LEGAL)).toEqual(["oda", "mori"]);
  });

  it("filters by the acting clan (`as`) so a clan seat never sees Emperor actions", () => {
    expect(kindAvailable(LEGAL, "determination")).toBe(true);
    expect(kindAvailable(LEGAL, "determination", "oda")).toBe(true);
    expect(kindAvailable(LEGAL, "determination", "mori")).toBe(false);
    expect([...determinationRegions(LEGAL).keys()]).toEqual([3]);
    expect([...determinationRegions(LEGAL, "oda").keys()]).toEqual([1]);
    expect([...aggressionSquares(LEGAL).keys()]).toEqual(["0:0"]);
    expect([...aggressionSquares(LEGAL, "mori").keys()]).toEqual(["4:0"]);
  });

  it("indexes Balance by source cube and destination", () => {
    expect([...balanceSources(LEGAL).keys()]).toEqual(["6:1", "8:2"]);
    const t = balanceTargets(LEGAL, { region: 6, square: 1 });
    expect(t.swap).toEqual({ type: "balance-swap", region: 6, square: 1 });
    expect([...t.moves.keys()]).toEqual([5, 8]);
    expect(t.replaces.size).toBe(0);
    const r = balanceTargets(LEGAL, { region: 8, square: 2 });
    expect(r.swap).toBeNull();
    expect([...r.replaces.keys()]).toEqual([9]);
  });

  it("indexes bonus placements by region", () => {
    expect([
      ...bonusRegions([{ type: "bonus-place", region: 2 }, { type: "pass" }]).keys(),
    ]).toEqual([2]);
  });
});
