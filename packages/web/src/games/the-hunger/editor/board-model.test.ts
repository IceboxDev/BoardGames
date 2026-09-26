import { describe, expect, it } from "vitest";
import {
  addSpace,
  emptyBoard,
  hasEdge,
  removeSpace,
  renameSpace,
  toggleEdge,
  updateSpace,
} from "./board-model";

const plain = { region: "plains", path: "road", effect: "none", x: 10, y: 20 } as const;

describe("board editor model", () => {
  it("names spaces by region, the Castle and Labyrinth by their role", () => {
    let b = emptyBoard("A", 100, 100);
    const a = addSpace(b, plain);
    b = a.board;
    const c = addSpace(b, { ...plain, region: "castle", effect: "castle", path: null });
    b = c.board;
    const d = addSpace(b, plain);
    expect([a.id, c.id, d.id]).toEqual(["plains-1", "castle", "plains-2"]);
  });

  it("toggles connections both ways and drops them with the space", () => {
    let b = emptyBoard("A", 100, 100);
    b = addSpace(b, plain).board;
    b = addSpace(b, plain).board;
    b = toggleEdge(b, "plains-1", "plains-2");
    expect(hasEdge(b, "plains-2", "plains-1")).toBe(true);
    expect(toggleEdge(b, "plains-2", "plains-1").edges).toEqual([]);
    expect(removeSpace(b, "plains-1").edges).toEqual([]);
  });

  it("renames a space along with its connections, never onto a taken id", () => {
    let b = emptyBoard("A", 100, 100);
    b = addSpace(b, plain).board;
    b = addSpace(b, plain).board;
    b = toggleEdge(b, "plains-1", "plains-2");
    const renamed = renameSpace(b, "plains-1", "tavern");
    expect(renamed.edges).toEqual([["tavern", "plains-2"]]);
    expect(renameSpace(b, "plains-1", "plains-2")).toBe(b);
  });

  it("keeps a sunrise penalty only in the Mountains", () => {
    let b = emptyBoard("A", 100, 100);
    b = addSpace(b, { ...plain, region: "mountains", mountainPenalty: 5 }).board;
    b = updateSpace(b, "mountains-1", { region: "plains" });
    expect(b.spaces[0].mountainPenalty).toBeUndefined();
  });
});
