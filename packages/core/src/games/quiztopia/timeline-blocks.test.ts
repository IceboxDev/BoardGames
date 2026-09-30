import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TimelineIndexSchema } from "./content-types.ts";
import { parseTimelineDate, type TimelinePrecision, timelineSortKey } from "./timeline.ts";
import {
  type Block,
  type BlockEntry,
  type BlockNode,
  blockById,
  blockLabel,
  blockOf,
  blockPath,
  blockTitle,
  buildBlockTree,
  childrenOf,
  fractionIn,
  type Placed,
  TOP_BLOCKS,
} from "./timeline-blocks.ts";
import { namedBlocks } from "./timeline-names/index.ts";

const key = (s: string) => {
  const d = parseTimelineDate(s);
  if (!d) throw new Error(s);
  return timelineSortKey(d);
};
const timelineIndex = TimelineIndexSchema.parse(
  JSON.parse(readFileSync(new URL("./content/timeline.json", import.meta.url), "utf8")),
);
const id = (level: Parameters<typeof blockOf>[0], s: string) => blockOf(level, key(s))?.id;

describe("block boundaries", () => {
  it("nests round-number blocks on both sides of year 0", () => {
    expect(id("millennium", "1994")).toBe("mil:1000");
    expect(id("century", "1994")).toBe("cen:1900");
    expect(id("decade", "1994")).toBe("dec:1990");
    expect(id("year", "1994")).toBe("yr:1994");
    expect(id("month", "1994-07-16")).toBe("mo:1994-07");
    expect(id("decade", "-445")).toBe("dec:440bc");
    expect(id("decade", "-440")).toBe("dec:440bc");
    expect(id("decade", "-439")).toBe("dec:430bc");
    expect(id("century", "-44")).toBe("cen:0bc");
    expect(id("decade", "-1")).toBe("dec:0bc");
    expect(id("decade", "1")).toBe("dec:0");
    expect(id("decade", "10")).toBe("dec:10");
    expect(id("month", "-44-03-15")).toBe("mo:44bc-03");
  });

  it("tiles time without gaps or overlaps", () => {
    const check = (blocks: Block[]) => {
      for (let i = 1; i < blocks.length; i++) expect(blocks[i].from).toBe(blocks[i - 1].to);
    };
    check([...TOP_BLOCKS]);
    for (const top of TOP_BLOCKS) {
      const kids = childrenOf(top);
      if (kids.length === 0) continue;
      check(kids);
      expect(kids[0].from).toBe(top.from === Number.NEGATIVE_INFINITY ? kids[0].from : top.from);
    }
    for (const b of ["mil:0bc", "mil:0", "cen:0bc", "cen:0", "dec:0bc", "dec:0", "yr:1bc"]) {
      const block = blockById(b);
      if (!block) throw new Error(b);
      const kids = childrenOf(block);
      check(kids);
      expect(kids[0].from).toBe(block.from);
      expect(kids[kids.length - 1].to).toBe(block.to);
    }
    // 1 BC and AD 1 are neighbours.
    expect(blockById("dec:0bc")?.to).toBe(blockById("dec:0")?.from);
    expect(childrenOf(blockById("dec:0") as Block)).toHaveLength(9);
    expect(childrenOf(blockById("dec:0bc") as Block)).toHaveLength(9);
  });

  it("round-trips ids and paths", () => {
    for (const s of ["-66000000", "-13800000000", "-9000", "-44-03-15", "800", "1994-07-16"]) {
      const path = blockPath(key(s));
      expect(path.length).toBeGreaterThan(0);
      for (const b of path) {
        expect(blockById(b.id)).toEqual(b);
        expect(key(s)).toBeGreaterThanOrEqual(b.from);
        expect(key(s)).toBeLessThan(b.to);
      }
    }
    expect(blockPath(key("-66000000")).map((b) => b.id)).toEqual(["age:cenozoic", "per:paleogene"]);
    expect(blockById("dec:445")).toBeNull();
    expect(blockById("nope")).toBeNull();
  });

  it("places keys inside a block, logarithmically in deep time", () => {
    const d = blockById("dec:1990") as Block;
    expect(fractionIn(d, key("1995"))).toBeCloseTo(0.5, 5);
    const meso = blockById("age:mesozoic") as Block;
    const f = fractionIn(meso, key("-100000000"));
    expect(f).toBeGreaterThan(0.5);
    expect(f).toBeLessThan(1);
  });

  it("labels and names blocks", () => {
    const b = (s: string) => blockById(s) as Block;
    expect(blockLabel(b("dec:1990"), "en")).toBe("1990s");
    expect(blockLabel(b("dec:1990"), "de")).toBe("1990er");
    expect(blockLabel(b("dec:440bc"), "en")).toBe("440s BC");
    expect(blockLabel(b("cen:1900"), "en")).toBe("20th century");
    expect(blockLabel(b("cen:0bc"), "de")).toBe("1. Jahrhundert v. Chr.");
    expect(blockLabel(b("mil:1000"), "en")).toBe("2nd millennium AD");
    expect(blockLabel(b("mil:2000"), "en")).toBe("3rd millennium AD");
    expect(blockLabel(b("yr:1994"), "en")).toBe("1994");
    expect(blockLabel(b("mo:1994-07"), "de")).toBe("Juli 1994");
    expect(blockLabel(b("dec:0"), "en")).toBe("AD 1–9");
    expect(blockTitle(b("dec:1920"), "en")).toBe("The Roaring Twenties");
    expect(blockTitle(b("age:mesozoic"), "de")).toBe("Mesozoikum");
    expect(blockTitle(b("yr:1994"), "en")).toBeNull();
  });
});

describe("buildBlockTree", () => {
  const at = (s: string, precision: TimelinePrecision = "day"): Placed => ({
    key: key(s),
    precision,
  });
  const nodes = (entries: BlockEntry<Placed>[]) =>
    entries.filter((e): e is BlockNode<Placed> => e.kind === "node");

  it("keeps sparse pins in whole millennia, with quiet gaps between", () => {
    const tree = buildBlockTree([at("-44-03-15"), at("1492-10-12")], (p) => p);
    expect(tree.map((e) => (e.kind === "node" ? e.block.id : "gap"))).toEqual([
      "mil:0bc",
      "gap",
      "mil:1000",
    ]);
    expect(nodes(tree).every((n) => n.mode === "leaf")).toBe(true);
  });

  it("splits only the crowded block, and passes lone children through", () => {
    const items = [
      at("1914-07-28"),
      at("1939-09-01"),
      at("1969-07-20"),
      at("1989-11-09"),
      at("1990-10-03"),
      at("1492-10-12"),
    ];
    const [m] = nodes(buildBlockTree(items, (p) => p));
    // 2nd millennium AD: six pins, all but one in the 20th century.
    expect(m.block.id).toBe("mil:1000");
    expect(m.mode).toBe("split");
    const kids = nodes(m.children);
    expect(kids.map((k) => k.block.id)).toEqual(["cen:1400", "cen:1900"]);
    expect(kids[1].mode).toBe("split");
    expect(nodes(kids[1].children).map((k) => k.block.id)).toEqual([
      "dec:1910",
      "dec:1930",
      "dec:1960",
      "dec:1980",
      "dec:1990",
    ]);
  });

  it("chains a single busy child into one header", () => {
    const items = ["1994-01-05", "1994-03-02", "1994-05-01", "1994-07-16", "1994-11-11"].map((s) =>
      at(s),
    );
    const [m] = nodes(buildBlockTree(items, (p) => p));
    expect(m.chain.map((b) => b.id)).toEqual(["mil:1000", "cen:1900", "dec:1990", "yr:1994"]);
    expect(m.mode).toBe("split");
    expect(nodes(m.children).every((c) => c.block.level === "month")).toBe(true);
  });

  it("keeps coarse dates loose at the level they name", () => {
    const items = [at("1960", "decade"), ...["1961", "1965", "1968", "1969"].map((s) => at(s))];
    const [m] = nodes(buildBlockTree(items, (p) => p, { capacity: 2 }));
    const dec = m.chain.at(-1) as Block;
    expect(dec.id).toBe("dec:1960");
    expect(m.loose).toHaveLength(1);
    expect(nodes(m.children).map((c) => c.block.id)).toEqual([
      "yr:1961",
      "yr:1965",
      "yr:1968",
      "yr:1969",
    ]);
  });

  it("never splits a month", () => {
    const items = Array.from({ length: 9 }, (_, i) =>
      at(`1994-07-${String(i + 1).padStart(2, "0")}`),
    );
    const [m] = nodes(buildBlockTree(items, (p) => p));
    expect(m.block.id).toBe("mo:1994-07");
    expect(m.mode).toBe("leaf");
  });

  it("honours split and fold overrides", () => {
    const items = [at("1914-07-28"), at("1969-07-20")];
    const split = nodes(buildBlockTree(items, (p) => p, { overrides: { "mil:1000": "split" } }));
    expect(split[0].mode).toBe("split");
    const folded = nodes(
      buildBlockTree([...items, at("1990"), at("1991"), at("1995")], (p) => p, {
        overrides: { "mil:1000": "fold" },
      }),
    );
    expect(folded[0].mode).toBe("folded");
    expect(folded[0].items).toHaveLength(5);
  });

  it("files deep time under ages and periods", () => {
    const items = [
      at("-66000000", "megayear"),
      at("-150000000", "megayear"),
      at("-13800000000", "megayear"),
    ];
    const tree = buildBlockTree(items, (p) => p, { capacity: 1 });
    expect(nodes(tree).map((n) => n.block.id)).toEqual([
      "age:cosmic",
      "age:mesozoic",
      "age:cenozoic",
    ]);
  });
});

describe("names", () => {
  it("names every millennium, century and decade that holds content", () => {
    const names = namedBlocks();
    const missing = new Set<string>();
    for (const entry of Object.values(timelineIndex)) {
      for (const s of [entry.s, entry.e]) {
        if (!s) continue;
        const k = key(s);
        for (const level of ["millennium", "century", "decade"] as const) {
          const b = blockOf(level, k);
          if (b && !names.has(b.id)) missing.add(b.id);
        }
      }
    }
    expect([...missing]).toEqual([]);
  });

  it("keeps names short, bilingual, unique per level and on real blocks", () => {
    const seen = new Map<string, Set<string>>();
    for (const [blockId, name] of namedBlocks()) {
      const block = blockById(blockId);
      expect(block, blockId).not.toBeNull();
      for (const text of [name.en, name.de]) {
        expect(text.length, `${blockId} ${text}`).toBeLessThanOrEqual(30);
        expect(text.trim().length).toBeGreaterThan(0);
        expect(text).not.toMatch(/\d/);
      }
      const level = block?.level ?? "?";
      const set = seen.get(level) ?? new Set();
      for (const text of [`en:${name.en}`, `de:${name.de}`]) {
        expect(set.has(text), `${blockId} duplicates ${text}`).toBe(false);
        set.add(text);
      }
      seen.set(level, set);
    }
  });
});
