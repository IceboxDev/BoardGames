import { fromGtp } from "@boardgames/core/games/go/coords";
import { newGame, playStone } from "@boardgames/core/games/go/game";
import { describe, expect, it } from "vitest";
import { createGoServerAi } from "../games/go-ai.ts";
import { baseQuery, createKataGoMover, samplePolicy } from "./go-agent.ts";
import type { KataGoEngine, KataGoQuery, KataGoResponse } from "./protocol.ts";

function fakeEngine(
  reply: (q: KataGoQuery) => Partial<KataGoResponse>,
): KataGoEngine & { seen: KataGoQuery[] } {
  const seen: KataGoQuery[] = [];
  return {
    seen,
    async query(q) {
      seen.push(q);
      return [
        {
          id: "x",
          turnNumber: q.moves.length,
          moveInfos: [],
          rootInfo: { winrate: 0.5, scoreLead: 0, visits: 1 },
          ...reply(q),
        },
      ];
    },
    status: () => ({ ready: true, detail: "fake" }),
  };
}

const at = (v: string) => fromGtp(9, v) as number;
const game = playStone(newGame({ size: 9, komi: 7.5, handicap: 0 }), at("E5"));
const req = (strategy: "katago-max" | "katago-5k") => ({ game, strategy, timeMs: 1000, seed: 3 });

describe("KataGo as a Go opponent", () => {
  it("sends the position with our exact rules and handicap setup", () => {
    const q = baseQuery(newGame({ size: 19, komi: 0.5, handicap: 2 }));
    expect(q.rules.koRule).toBe("POSITIONAL");
    expect(q.initialStones).toEqual([
      ["B", "Q16"],
      ["B", "D4"],
    ]);
  });

  it("plays the best legal move at full strength, skipping an illegal one", async () => {
    const engine = fakeEngine(() => ({
      moveInfos: [
        { move: "E5", visits: 90, winrate: 0.6, scoreLead: 3, order: 0 }, // occupied
        { move: "C3", visits: 10, winrate: 0.5, scoreLead: 1, order: 1 },
      ],
    }));
    expect(await createKataGoMover(engine).move(req("katago-max"))).toBe(at("C3"));
  });

  it("samples a human-style move from the profile's policy", async () => {
    const policy = new Array(82).fill(-1);
    policy[at("G7")] = 1;
    const engine = fakeEngine(() => ({ humanPolicy: policy }));
    expect(await createKataGoMover(engine).move(req("katago-5k"))).toBe(at("G7"));
    expect(engine.seen[0]?.overrideSettings?.humanSLProfile).toBe("rank_5k");
  });

  it("never samples an illegal point; passes when nothing legal is weighted", () => {
    const policy = new Array(82).fill(0);
    policy[at("E5")] = 1; // occupied
    expect(samplePolicy(policy, new Set([at("A1")]), 1)).toBeNull();
  });

  it("falls back to MCTS and says so when KataGo fails", async () => {
    const broken: KataGoEngine = {
      query: async () => {
        throw new Error("down");
      },
      status: () => ({ ready: false, detail: "down" }),
    };
    const prev = process.env.GO_AI_WORKERS;
    process.env.GO_AI_WORKERS = "0";
    try {
      const ai = createGoServerAi(createKataGoMover(broken));
      const reply = await ai.chooseMove({ ...req("katago-5k"), timeMs: 50 });
      expect(reply.degraded).toBe(true);
      expect(reply.point === null || game.board[reply.point] === 0).toBe(true);
    } finally {
      process.env.GO_AI_WORKERS = prev;
    }
  });
});
