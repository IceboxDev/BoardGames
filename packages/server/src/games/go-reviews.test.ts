import { fromGtp } from "@boardgames/core/games/go/coords";
import { newGame, playStone } from "@boardgames/core/games/go/game";
import { GoReviewAnalysisSchema } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import type { KataGoEngine, KataGoQuery, KataGoResponse } from "../katago/protocol.ts";
import { analyse, foldAnalysis } from "./go-reviews.ts";

const at = (v: string) => fromGtp(9, v) as number;

function turn(n: number, scoreLead: number, best = "E5"): KataGoResponse {
  return {
    id: "r",
    turnNumber: n,
    moveInfos: [{ move: best, visits: 10, winrate: 0.5, scoreLead, order: 0, pv: [best, "C3"] }],
    rootInfo: { winrate: 0.5 + scoreLead / 100, scoreLead, visits: 10 },
  };
}

describe("Go review analysis", () => {
  // Black E5, White A1 (a poor move), Black C3.
  let game = newGame({ size: 9, komi: 7.5, handicap: 0 });
  for (const v of ["E5", "A1", "C3"]) game = playStone(game, at(v));

  it("charges each move the points it gave away, from the mover's side", () => {
    const a = foldAnalysis(game, [turn(0, -7), turn(1, -6), turn(2, -1), turn(3, -1.5)], 50);
    expect(GoReviewAnalysisSchema.parse(a).moves).toHaveLength(3);
    expect(a.moves[0]?.loss).toBe(0); // black gained
    expect(a.moves[1]?.loss).toBe(5); // white let black's lead grow by 5
    expect(a.moves[2]?.loss).toBe(0.5);
    expect(a.moves[1]?.best).toBe("E5");
    expect(a.start.scoreLead).toBe(-7);
  });

  it("asks KataGo for every turn in chunks at low priority and reports progress", async () => {
    const seen: KataGoQuery[] = [];
    const engine: KataGoEngine = {
      async query(q) {
        seen.push(q);
        return (q.analyzeTurns ?? []).map((t) => turn(t, 0));
      },
      status: () => ({ ready: true, detail: "fake" }),
    };
    const progress: number[] = [];
    const a = await analyse(engine, game, 30, async (p) => {
      progress.push(p);
    });
    expect(a.moves).toHaveLength(3);
    expect(seen[0]?.analyzeTurns).toEqual([0, 1, 2, 3]);
    expect(seen[0]?.priority).toBeLessThan(0);
    expect(progress.at(-1)).toBe(1);
  });
});
