import { describe, expect, it } from "vitest";
import type { SrsState } from "../../../trainers/srs.ts";
import { drillCards, drillQueue, learningByFolder, pendingKeys, weakestCards } from "./drill.ts";
import { type RepertoireTree, type TreeNode, TreeSettingsSchema } from "./tree.ts";

const node = (over: Partial<TreeNode>): TreeNode => ({
  fen: "x",
  ply: 2,
  side: "user",
  status: "done",
  moves: [],
  following: 0,
  seen: 0,
  ...over,
});
const move = (uci: string) => ({
  uci,
  san: uci,
  source: "engine" as const,
  games: 0,
  following: 0,
});

const tree: RepertoireTree = {
  formatVersion: 1,
  color: "w",
  settings: TreeSettingsSchema.parse({}),
  status: "analysing",
  root: "a",
  nodes: {
    a: node({ ply: 0, moves: [move("e2e4")], following: 100 }),
    b: node({ side: "opp", moves: [move("e7e5")] }),
    c: node({ ply: 2, moves: [move("g1f3")], following: 60 }),
    d: node({ ply: 2, moves: [move("d2d4")], following: 5 }),
    e: node({ status: "awaiting-eval" }),
    f: node({ status: "terminal" }),
  },
  stats: {
    games: 0,
    deviated: 0,
    ended: 0,
    waiting: 0,
    avgFollowPlies: 0,
    decisions: 0,
    awaiting: 0,
  },
};

const state = (id: string, over: Partial<SrsState>): SrsState => ({
  questionId: id,
  state: "review",
  ease: 2.5,
  intervalDays: 3,
  dueDate: "2026-10-25",
  reps: 3,
  lapses: 0,
  lastReviewedAt: "2026-10-19T10:00:00Z",
  ...over,
});

describe("opening drill", () => {
  it("takes your settled moves as cards and leaves the rest", () => {
    expect(drillCards(tree).map((c) => c.key)).toEqual(["a", "c", "d"]);
    expect(pendingKeys(tree)).toEqual(["e"]);
  });

  it("sums learning up the folders", () => {
    const states = new Map([
      ["a", state("a", {})],
      ["c", state("c", { state: "learning", dueDate: "2026-10-20" })],
    ]);
    const owner: Record<string, string> = { c: "open", d: "ruy", e: "ruy" };
    const parent: Record<string, string> = { ruy: "open" };
    const { byFolder, total } = learningByFolder({
      cards: drillCards(tree),
      pending: pendingKeys(tree),
      states,
      today: "2026-10-20",
      ownerOf: (k) => owner[k],
      parentOf: (id) => parent[id],
    });
    expect(total).toEqual({
      learnt: 1,
      learning: 1,
      fresh: 1,
      due: 1,
      practisedToday: 0,
      pending: 1,
      pendingLines: 1,
      unasked: 0,
      unreached: 0,
    });
    expect(byFolder.get("ruy")).toEqual({
      learnt: 0,
      learning: 0,
      fresh: 1,
      due: 0,
      practisedToday: 0,
      pending: 1,
      pendingLines: 1,
      unasked: 0,
      unreached: 0,
    });
    expect(byFolder.get("open")).toEqual({
      learnt: 0,
      learning: 1,
      fresh: 1,
      due: 1,
      practisedToday: 0,
      pending: 1,
      pendingLines: 1,
      unasked: 0,
      unreached: 0,
    });
  });

  it("deals due cards first, then the most played new ones within the budget", () => {
    const states = new Map([["d", state("d", { dueDate: "2026-10-19" })]]);
    const queue = drillQueue({
      cards: drillCards(tree),
      states,
      today: "2026-10-20",
      newBudget: 1,
      limit: 10,
    });
    expect(queue.map((q) => [q.questionId, q.tier])).toEqual([
      ["d", "review"],
      ["a", "new"],
    ]);
  });

  it("reviews a due folder whole: its other met cards come along, other folders don't", () => {
    const states = new Map([
      ["a", state("a", {})],
      ["c", state("c", { dueDate: "2026-10-20" })],
      ["d", state("d", {})],
    ]);
    const owner: Record<string, string> = { a: "open", c: "ruy", d: "ruy" };
    const queue = drillQueue({
      cards: drillCards(tree),
      states,
      today: "2026-10-20",
      newBudget: 0,
      limit: 10,
      ownerOf: (k) => owner[k],
    });
    expect(queue.map((q) => [q.questionId, q.tier]).sort()).toEqual([
      ["c", "review"],
      ["d", "neighbour"],
    ]);
    const { byFolder } = learningByFolder({
      cards: drillCards(tree),
      pending: [],
      states,
      today: "2026-10-20",
      isToday: (iso) => iso.startsWith("2026-10-19"),
      ownerOf: (k) => owner[k],
      parentOf: (id) => (id === "ruy" ? "open" : undefined),
    });
    expect(byFolder.get("ruy")?.due).toBe(2);
    expect(byFolder.get("open")?.due).toBe(2);
    expect(byFolder.get("open")?.practisedToday).toBe(3);
  });

  it("deals a folder whole when asked: met cards (due or not) and every new one", () => {
    const states = new Map([["a", state("a", {})]]);
    const queue = drillQueue({
      cards: drillCards(tree),
      states,
      today: "2026-10-20",
      newBudget: 0,
      limit: 1,
      whole: true,
    });
    expect(queue.map((q) => [q.questionId, q.tier]).sort()).toEqual([
      ["a", "neighbour"],
      ["c", "new"],
      ["d", "new"],
    ]);
  });

  it("lists the shakiest cards first", () => {
    const states = new Map([
      ["a", state("a", { lapses: 1 })],
      ["c", state("c", { lapses: 3 })],
    ]);
    expect(weakestCards(drillCards(tree), states, 5).map((w) => w.card.key)).toEqual(["c", "a"]);
  });
});
