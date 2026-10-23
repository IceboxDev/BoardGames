import { describe, expect, it } from "vitest";
import { applyMove } from "../engine/apply";
import { parseFen, positionKey, START_FEN } from "../engine/fen";
import { legalMoves } from "../engine/movegen";
import { parseSan } from "../engine/san";
import type { Position } from "../engine/types";
import { moveToUci } from "../engine/uci";
import { buildTree, EvalPending, type NodeEval, type TreeProviders } from "./builder";
import { padReplies } from "./padding";
import { PositionIndex, type TrainerGame } from "./position-index";
import { type RepertoireTree, TreeSettingsSchema, withChoice } from "./tree";

/** SAN text → the position key after it. */
function keyAfter(san: string): string {
  let pos: Position = parseFen(START_FEN);
  for (const t of san.split(" ").filter(Boolean)) {
    const m = parseSan(pos, t);
    if (!m) throw new Error(t);
    pos = applyMove(pos, m);
  }
  return positionKey(pos);
}

function game(id: string, san: string, result: TrainerGame["result"] = "win"): TrainerGame {
  let pos: Position = parseFen(START_FEN);
  const moves: string[] = [];
  for (const t of san.split(" ")) {
    const m = parseSan(pos, t);
    if (!m) throw new Error(`${id}: ${t}`);
    moves.push(moveToUci(m));
    pos = applyMove(pos, m);
  }
  return { id, moves, result };
}

/** An engine that likes these moves, in this order, then the rest alphabetically. */
const PREFERRED = ["g1f3", "b8c6", "f1b5", "d7d6", "a7a6", "g8f6", "b1c3", "d2d4", "e7e5", "d8h4"];
const POPULAR = ["d7d6", "f8c5", "a7a6"];

function fakeProviders(log: string[] = [], prefer: readonly string[] = PREFERRED): TreeProviders {
  return {
    engineLines: async (fen, multipv, depth) => {
      log.push(`engine ${multipv}`);
      const legal = legalMoves(parseFen(fen)).map(moveToUci);
      const rank = (u: string) => {
        const i = prefer.indexOf(u);
        return i < 0 ? 100 : i;
      };
      return legal
        .sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1))
        .slice(0, multipv)
        .map((uci) => ({ uci, cp: 0, mate: null, depth }));
    },
    popularMoves: async (fen) => {
      log.push("popular");
      const legal = new Set(legalMoves(parseFen(fen)).map(moveToUci));
      return POPULAR.filter((u) => legal.has(u)).map((uci, i) => ({ uci, games: 100 - i }));
    },
  };
}

const D4 = ["d2d4", "c2c4", ...PREFERRED];
const E4 = ["e2e4", ...PREFERRED];

const refusing: TreeProviders = {
  engineLines: () => Promise.reject(new Error("engine asked")),
  popularMoves: () => Promise.reject(new Error("database asked")),
};

const settings = (over: Partial<ReturnType<typeof TreeSettingsSchema.parse>> = {}) =>
  TreeSettingsSchema.parse({ engineDepth: 10, ...over });

const movesAt = (tree: RepertoireTree, san: string) =>
  tree.nodes[keyAfter(san)]?.moves.map((m) => `${m.san}:${m.source}`);

describe("padReplies", () => {
  const legal = new Set(["a", "b", "c", "d", "e"]);
  it("keeps every played move and adds nothing at three", () => {
    expect(padReplies(["a", "b", "c", "d"], ["e"], ["e"], legal).map((r) => r.uci)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });
  it("alternates popular and engine (most popular first), skipping repeats", () => {
    expect(padReplies(["a"], ["a", "c"], ["a", "d"], legal)).toEqual([
      { uci: "a", source: "played" },
      { uci: "d", source: "popular" },
      { uci: "c", source: "engine" },
    ]);
    expect(padReplies([], ["b", "c"], ["d"], legal).map((r) => r.uci)).toEqual(["d", "b", "c"]);
  });
  it("stops at the number of legal moves", () => {
    expect(padReplies([], ["a", "b"], ["b", "a"], new Set(["a", "b"])).length).toBe(2);
  });
});

describe("buildTree", () => {
  const whiteGames = [
    game("g1", "e4 e5 Nf3 Nc6 Bb5"),
    game("g2", "e4 c5 Nf3 d6", "loss"),
    game("g3", "e4 e5 Nf3 Nf6", "draw"),
    game("g4", "d4 d5"),
  ];

  it("waits for your first move, then builds from it", async () => {
    const index = PositionIndex.build(whiteGames);
    const first = await buildTree(
      index,
      "w",
      settings({ handpickMoves: 1 }),
      null,
      fakeProviders(),
    );
    expect(first.status).toBe("decisions");
    expect(first.stats).toMatchObject({ decisions: 1, waiting: 4 });
    const root = first.nodes[first.root];
    expect(root?.status).toBe("decision");
    expect(root?.history?.map((h) => [h.san, h.games])).toEqual([
      ["e4", 3],
      ["d4", 1],
    ]);

    const chosen = withChoice(first, first.root, { source: "handpicked", uci: "e2e4" });
    const tree = await buildTree(
      index,
      "w",
      settings({ handpickMoves: 1 }),
      chosen,
      fakeProviders(),
    );
    expect(tree.status).toBe("ready");
    expect(movesAt(tree, "")).toEqual(["e4:handpicked"]);
    expect(tree.nodes[tree.root]?.deviations).toEqual([{ uci: "d2d4", san: "d4", games: 1 }]);
    // Black's first reply: exactly what was played, no padding.
    expect(movesAt(tree, "e4")).toEqual(["e5:played", "c5:played"]);
    // Past the handpicked move the engine chooses.
    expect(movesAt(tree, "e4 e5")).toEqual(["Nf3:engine"]);
    // Two played replies + padding: engine best (Nc6) is already there, so popular d6.
    expect(movesAt(tree, "e4 e5 Nf3")).toEqual(["Nc6:played", "Nf6:played", "d6:popular"]);
    expect(movesAt(tree, "e4 c5 Nf3")).toEqual(["d6:played", "Nc6:engine", "a6:popular"]);
    // A padded reply gets your answer and the opponent's replies to it: the leaves.
    const padded = tree.nodes[keyAfter("e4 e5 Nf3 d6")];
    expect(padded?.moves).toHaveLength(1);
    expect(padded?.following).toBe(0);
    expect(padded?.extension).toBeUndefined();
    const reply = padded?.moves[0]?.san ?? "";
    const last = tree.nodes[keyAfter(`e4 e5 Nf3 d6 ${reply}`)];
    expect(last?.extension).toBe(3);
    expect(last?.moves).toHaveLength(3);
    // g1 never left the tree: its line runs to its last move.
    expect(tree.nodes[keyAfter("e4 e5 Nf3 Nc6 Bb5")]?.ended).toBe(1);
    expect(tree.nodes[keyAfter("e4 e5 Nf3 Nc6 Bb5")]?.moves).toHaveLength(3);
    expect(tree.stats).toMatchObject({ games: 4, deviated: 1, ended: 3, waiting: 0 });
  });

  it("rebuilds from the cache without asking the engine or the database", async () => {
    const index = PositionIndex.build(whiteGames);
    const opts = settings({ handpickMoves: 0 });
    const tree = await buildTree(index, "w", opts, null, fakeProviders());
    const again = await buildTree(index, "w", opts, tree, refusing);
    expect(again).toEqual(tree);
  });

  it("covers every first move White played against you", async () => {
    const games = [game("b1", "e4 c5"), game("b2", "d4 Nf6"), game("b3", "e4 e5")];
    const tree = await buildTree(
      PositionIndex.build(games),
      "b",
      settings({ handpickMoves: 0 }),
      null,
      fakeProviders(),
    );
    expect(tree.nodes[tree.root]?.side).toBe("opp");
    expect(movesAt(tree, "")).toEqual(["e4:played", "d4:played"]);
  });

  it("counts a move reached by transposition as played, the game following from there", async () => {
    const games = [game("t1", "d4 Nf6 c4 e6"), game("t2", "c4 Nf6 d4 g6")];
    const tree = await buildTree(
      PositionIndex.build(games),
      "w",
      settings({ handpickMoves: 0 }),
      null,
      fakeProviders([], D4),
    );
    expect(movesAt(tree, "")).toEqual(["d4:engine"]);
    const node = tree.nodes[keyAfter("d4 Nf6 c4")];
    expect(
      node?.moves.filter((m) => m.source === "played").map((m) => [m.san, m.games, m.following]),
    ).toEqual([
      ["e6", 1, 1],
      // t2 left at 1.c4 and came back by transposition: it follows again.
      ["g6", 1, 1],
    ]);
  });

  it("grows a line your games reached by another move order, past where they left the tree", async () => {
    const games = [
      game("main", "e4 e5 Nf3 Nc6 Bb5"),
      // Leaves at 2.Bb5 (the tree plays 2.Nf3), then reaches 1.e4 e5 2.Nf3 Nc6 3.Bb5 by
      // another order and goes on with 3…a6 4.Ba4 Nf6.
      game("transposed", "e4 Nc6 Bb5 e5 Nf3 a6 Ba4 Nf6"),
    ];
    const tree = await buildTree(
      PositionIndex.build(games),
      "w",
      settings({ handpickMoves: 0 }),
      null,
      fakeProviders([], ["e2e4", "g1f3", "f1b5", "b5a4", ...PREFERRED]),
    );
    const ruy = tree.nodes[keyAfter("e4 e5 Nf3 Nc6 Bb5")];
    expect(ruy?.moves.find((m) => m.san === "a6")?.following).toBe(1);
    // Your answer to 3…a6 and the reply your game met there are built, on a game line.
    expect(movesAt(tree, "e4 e5 Nf3 Nc6 Bb5 a6")).toEqual(["Ba4:engine"]);
    const after = tree.nodes[keyAfter("e4 e5 Nf3 Nc6 Bb5 a6 Ba4")];
    expect(after?.extension).toBeUndefined();
    expect(after?.moves.find((m) => m.san === "Nf6")?.following).toBe(1);
  });

  it("changing a move prunes the old line", async () => {
    const index = PositionIndex.build(whiteGames);
    const opts = settings({ handpickMoves: 0 });
    const tree = await buildTree(index, "w", opts, null, fakeProviders([], D4));
    expect(tree.nodes[keyAfter("d4")]).toBeDefined();
    const changed = await buildTree(
      index,
      "w",
      opts,
      withChoice(tree, tree.root, { source: "handpicked", uci: "e2e4" }),
      fakeProviders(),
    );
    expect(changed.nodes[keyAfter("d4")]).toBeUndefined();
    expect(changed.nodes[keyAfter("e4")]).toBeDefined();
  });

  it("stops when asked and resumes from the checkpoint", async () => {
    const index = PositionIndex.build(whiteGames);
    const opts = settings({ handpickMoves: 0 });
    let n = 0;
    const partial = await buildTree(index, "w", opts, null, fakeProviders([], E4), {
      shouldStop: () => ++n > 3,
    });
    expect(partial.status).toBe("generating");
    const log: string[] = [];
    const done = await buildTree(index, "w", opts, partial, fakeProviders(log, E4));
    const fullLog: string[] = [];
    const full = await buildTree(index, "w", opts, null, fakeProviders(fullLog, E4));
    expect(done).toEqual(full);
    expect(log.length).toBeLessThan(fullLog.length);
  });

  it("ends a line at mate", async () => {
    const tree = await buildTree(
      PositionIndex.build([game("m", "f3 e5 g4 Qh4#")]),
      "b",
      settings({ handpickMoves: 0 }),
      null,
      fakeProviders([], ["e7e5", "d8h4"]),
    );
    const mate = tree.nodes[keyAfter("f3 e5 g4 Qh4")];
    expect(mate?.status).toBe("terminal");
    expect(mate?.ended).toBe(1);
  });

  it("asks the farm about well-played opponent positions without waiting for it", async () => {
    const index = PositionIndex.build([
      game("a", "e4 e5 Nf3 Nc6"),
      game("b", "e4 c5 Nf3 d6"),
      game("c", "e4 e6 d4 d5"),
    ]);
    const asked: { fen: string; kind: string }[] = [];
    const farm: TreeProviders = {
      ...fakeProviders([], E4),
      engineLines: () => Promise.reject(new Error("the farm answers, not the browser")),
      evaluate: async (fen, kind) => {
        // Your first move is known; everything else is still on the farm.
        if (
          kind === "user" &&
          asked.length === 0 &&
          fen.includes(" w ") &&
          fen.startsWith("rnbqkbnr/pppppppp/8/8/8/8")
        ) {
          return { lines: [{ uci: "e2e4", cp: 30, mate: null, depth: 50 }], source: "farm" };
        }
        asked.push({ fen, kind });
        throw new EvalPending();
      },
    };
    const tree = await buildTree(index, "w", settings({ handpickMoves: 0 }), null, farm);
    const afterE4 = Object.values(tree.nodes).find((n) => n.ply === 1);
    // Three replies were played: the position is complete, the engine's verdict still asked for.
    expect(afterE4?.status).toBe("done");
    expect(afterE4?.moves.map((m) => `${m.san}:${m.source}`).sort()).toEqual([
      "c5:played",
      "e5:played",
      "e6:played",
    ]);
    expect(asked.some((a) => a.kind === "opp" && a.fen === afterE4?.fen)).toBe(true);
  });

  it("extends a line end three steps: their replies, your answers, their replies (the leaves)", async () => {
    // Your game reached 1.e4 e5 and played 2.Bc4; the tree's move is 2.Nf3.
    const index = PositionIndex.build([game("a", "e4 e5 Bc4 Nf6")]);
    const tree = await buildTree(
      index,
      "w",
      settings({ handpickMoves: 0 }),
      null,
      fakeProviders([], E4),
    );
    expect(movesAt(tree, "e4 e5")).toEqual(["Nf3:engine"]);
    const one = tree.nodes[keyAfter("e4 e5 Nf3")];
    expect(one?.extension).toBe(1);
    expect(one?.moves).toHaveLength(3);
    let positions = 1;
    for (const reply of one?.moves ?? []) {
      const two = tree.nodes[keyAfter(`e4 e5 Nf3 ${reply.san}`)];
      expect(two?.extension).toBe(2);
      expect(two?.moves).toHaveLength(1);
      const answer = two?.moves[0]?.san ?? "";
      const three = tree.nodes[keyAfter(`e4 e5 Nf3 ${reply.san} ${answer}`)];
      expect(three?.extension).toBe(3);
      expect(three?.moves).toHaveLength(3);
      // Its replies are the leaves: no position of yours below them.
      for (const leaf of three?.moves ?? []) {
        expect(
          tree.nodes[keyAfter(`e4 e5 Nf3 ${reply.san} ${answer} ${leaf.san}`)],
        ).toBeUndefined();
      }
      positions += 2;
    }
    expect(positions).toBe(7);
    // Black's first reply is never padded: nothing else is extended.
    expect(Object.values(tree.nodes).filter((n) => n.extension !== undefined)).toHaveLength(7);
  });

  it("asks again about a stored result short of its depth, and drops the line it led to", async () => {
    const index = PositionIndex.build([game("a", "e4 e5 Nf3"), game("b", "d4 d5 c4")]);
    let deep = false;
    const farm: TreeProviders = {
      ...fakeProviders([], E4),
      engineLines: () => Promise.reject(new Error("the farm answers, not the browser")),
      evaluate: async (fen, kind) => {
        if (kind === "user" && fen.startsWith("rnbqkbnr/pppppppp/8/8/8/8")) {
          // A capped search first (depth 39, 1.d4), then the full one (1.e4).
          return deep
            ? { lines: [{ uci: "e2e4", cp: 30, mate: null, depth: 50 }], source: "farm" }
            : { lines: [{ uci: "d2d4", cp: 25, mate: null, depth: 39 }], source: "farm" };
        }
        throw new EvalPending();
      },
    };
    const opts = settings({ handpickMoves: 0 });
    const short = await buildTree(index, "w", opts, null, farm);
    expect(movesAt(short, "")).toEqual(["d4:engine"]);
    deep = true;
    const tree = await buildTree(index, "w", opts, short, farm);
    expect(movesAt(tree, "")).toEqual(["e4:engine"]);
    expect(tree.nodes[keyAfter("d4")]).toBeUndefined();
  });

  it("parks positions the farm hasn't analysed and finishes once it has", async () => {
    const index = PositionIndex.build(whiteGames);
    const opts = settings({ handpickMoves: 0 });
    const known = new Map<string, NodeEval>();
    const asked: { fen: string; kind: string; reach: number }[] = [];
    const engine = fakeProviders([], E4);
    const farm: TreeProviders = {
      ...engine,
      engineLines: () => Promise.reject(new Error("the farm answers, not the browser")),
      evaluate: async (fen, kind, reach) => {
        const hit = known.get(fen);
        if (hit) return hit;
        asked.push({ fen, kind, reach });
        throw new EvalPending();
      },
    };
    let tree = await buildTree(index, "w", opts, null, farm);
    expect(tree.status).toBe("analysing");
    expect(tree.stats.awaiting).toBe(1);
    expect(asked).toEqual([{ fen: tree.nodes[tree.root]?.fen, kind: "user", reach: 4 }]);
    expect(tree.nodes[tree.root]?.status).toBe("awaiting-eval");

    // The farm answers each wave; rebuild until nothing is left waiting.
    for (let wave = 0; wave < 20 && tree.status === "analysing"; wave++) {
      for (const a of asked.splice(0)) {
        const lines = await engine.engineLines(a.fen, a.kind === "user" ? 1 : 3, 50);
        known.set(a.fen, {
          lines,
          source: "farm",
          ties: a.kind === "user" ? [lines[0]?.uci ?? ""] : [],
        });
      }
      tree = await buildTree(index, "w", opts, tree, farm);
    }
    expect(tree.status).toBe("ready");
    expect(tree.nodes[tree.root]).toMatchObject({ evalSpec: "BEST_MOVE_V2", evalSource: "farm" });
    expect(movesAt(tree, "")).toEqual(["e4:engine"]);
    // Same tree as the browser engine would give, decision for decision.
    const direct = await buildTree(
      index,
      "w",
      settings({ handpickMoves: 0, evalSpec: null }),
      null,
      engine,
    );
    expect(Object.keys(tree.nodes).sort()).toEqual(Object.keys(direct.nodes).sort());
  });
});
