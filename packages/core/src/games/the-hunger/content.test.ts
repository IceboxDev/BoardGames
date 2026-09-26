import { describe, expect, it } from "vitest";
import { bfs, buildGraph } from "./board";
import { boardProblems } from "./content/board-schema";
import { BOARDS } from "./content/boards";
import { BONUS_TOKENS } from "./content/bonus-tokens";
import {
  expandByRookie,
  FAMILIARS,
  HUMANS,
  POWERS,
  ROSES,
  rookieCopiesOf,
  STARTING,
} from "./content/cards";
import { MISSIONS } from "./content/missions";
import { HUMAN_CATEGORIES } from "./types";

const count = (defs: readonly { copies: number }[]) => defs.reduce((s, d) => s + d.copies, 0);

describe("content", () => {
  it("has the rulebook's component counts", () => {
    expect(count(HUMANS)).toBe(80);
    expect(count(FAMILIARS)).toBe(22);
    expect(count(POWERS)).toBe(20);
    expect(count(ROSES)).toBe(3);
    expect(count(STARTING)).toBe(6);
    expect(MISSIONS).toHaveLength(50);
    expect(count(BONUS_TOKENS)).toBe(26);
  });

  it("gives every mission exactly one condition and unique ids", () => {
    for (const m of MISSIONS) expect(Boolean(m.standard) !== Boolean(m.instant)).toBe(true);
    expect(new Set(MISSIONS.map((m) => m.id)).size).toBe(MISSIONS.length);
  });

  it("matches the physical set: 8 gold Instants, 8 white titles, 10 tiles marked 5+", () => {
    expect(MISSIONS.filter((m) => m.instant)).toHaveLength(8);
    expect(MISSIONS.filter((m) => m.whiteTitle)).toHaveLength(8);
    expect(MISSIONS.filter((m) => m.fivePlus)).toHaveLength(10);
    // White titles are all standard, so Rookie always has Public Missions.
    expect(MISSIONS.filter((m) => m.whiteTitle).every((m) => m.standard)).toBe(true);
    expect(MISSIONS.filter((m) => m.fivePlus).every((m) => m.standard)).toBe(true);
  });

  it("has the three real Roses: Ready, Unique, Permanent Items", () => {
    const printed = ROSES.map((r) => [r.id, r.speed, r.vp]);
    expect(printed).toEqual([
      ["eternal-rose", 1, 5],
      ["dead-rose", 1, 3],
      ["perfect-rose", 0, 5],
    ]);
    for (const r of ROSES) {
      expect(r.type).toBe("item");
      expect([...r.keywords].sort()).toEqual(["permanent", "ready", "unique"]);
    }
  });

  it("has the 22 real Familiars: unique names, 10 templates, 5 A cards, 4 Wolves", () => {
    expect(FAMILIARS).toHaveLength(22);
    expect(new Set(FAMILIARS.map((f) => f.name)).size).toBe(22);
    expect(new Set(FAMILIARS.map((f) => f.text)).size).toBe(10);
    expect(FAMILIARS.filter((f) => f.rookie).map((f) => f.name)).toEqual([
      "Kutya",
      "Malac",
      "Bagoly",
      "Patcani",
      "Nanoosh",
    ]);
    expect(FAMILIARS.filter((f) => f.family === "wolf").map((f) => f.name)).toEqual([
      "Echo",
      "Bo",
      "Gray",
      "Jahda",
    ]);
    for (const f of FAMILIARS) {
      expect(f.speed).toBe(0);
      expect(f.keywords).toContain("permanent");
    }
  });

  it("has the 20 real Powers, 12 of them A cards", () => {
    expect(count(POWERS)).toBe(20);
    expect(POWERS.reduce((n, p) => n + rookieCopiesOf(p), 0)).toBe(12);
    // Rookie: 12 A Powers + 5 A Familiars + 9 A Humans.
    expect(expandByRookie([...HUMANS, ...FAMILIARS, ...POWERS]).a).toHaveLength(26);
  });

  it("has the real Bonus token mix", () => {
    const byKind: Record<string, number> = {};
    for (const b of BONUS_TOKENS) byKind[b.bonus.kind] = (byKind[b.bonus.kind] ?? 0) + b.copies;
    expect(byKind).toEqual({
      mission: 2,
      parasol: 3,
      human: 4,
      "human-choice": 1,
      velvet: 6,
      "extra-hunt": 2,
      "discard-draw": 2,
      "draw-to-play": 2,
      speed: 4,
    });
  });

  it("has the 80 real Humans: 20 per type, unique names, 9 A cards", () => {
    expect(HUMANS).toHaveLength(80);
    expect(new Set(HUMANS.map((h) => h.id)).size).toBe(80);
    for (const c of HUMAN_CATEGORIES) {
      expect(HUMANS.filter((h) => h.category === c)).toHaveLength(20);
    }
    expect(HUMANS.filter((h) => h.rookie).map((h) => h.name)).toEqual([
      "Carlyle",
      "Ophelia",
      "Eleanor",
      "Dee",
      "Momo",
      "Billy",
      "Bruce",
      "Uwe",
      "Grant",
    ]);
    expect(HUMANS.filter((h) => h.speed === -1).map((h) => h.name)).toEqual([
      "Wadsworth",
      "Nemes",
      "Yaga",
      "Diego",
    ]);
    // Every Spicy Human is Permanent, until its turn ends on a Well.
    for (const h of HUMANS.filter((x) => x.keywords.includes("spicy"))) {
      expect(h.keywords).toContain("permanent");
    }
    expect(HUMANS.filter((h) => h.keywords.includes("spicy")).map((h) => h.name)).toEqual([
      "Rufus",
      "Anton",
      "Eunice",
      "Bernard",
      "Titus",
    ]);
  });

  it("has enough Rookie A cards for six players", () => {
    expect(expandByRookie([...HUMANS, ...FAMILIARS, ...POWERS]).a.length).toBeGreaterThanOrEqual(
      2 + 2 * 6,
    );
  });

  for (const side of ["A", "B", "test"] as const) {
    it(`board ${side} passes every board check and is fully connected`, () => {
      const def = BOARDS[side];
      expect(boardProblems(def).filter((p) => p.level === "error")).toEqual([]);
      const g = buildGraph(def);
      expect(bfs(g.adj, g.castle).size).toBe(def.spaces.length);
      for (const s of def.spaces) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(def.width);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeLessThanOrEqual(def.height);
      }
    });
  }

  it("the board checks catch a broken board", () => {
    const broken = {
      ...BOARDS.test,
      spaces: BOARDS.test.spaces.filter((s) => s.effect !== "tavern"),
    };
    const messages = boardProblems(broken).map((p) => p.message);
    expect(messages).toContain("Needs exactly one Tavern (has 0)");
    expect(messages.some((m) => m.includes("missing space"))).toBe(true);
  });
});
