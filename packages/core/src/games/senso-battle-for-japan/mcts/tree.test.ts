import { describe, expect, it } from "vitest";
import { backup, createNode, uct } from "./tree";

describe("tree", () => {
  it("backs the whole vector up every node on the path and nothing else", () => {
    const root = createNode("root", 0, 3);
    const a = createNode("a", 1, 3);
    const b = createNode("b", 2, 3);
    const other = createNode("x", 1, 3);
    root.children.set("a", a);
    root.children.set("x", other);
    a.children.set("b", b);
    backup([root, a, b], Float64Array.from([1, -2, 0.5]));
    backup([root, a], Float64Array.from([2, 0, -1]));
    expect([...root.value]).toEqual([3, -2, -0.5]);
    expect(root.visits).toBe(2);
    expect([...a.value]).toEqual([3, -2, -0.5]);
    expect([...b.value]).toEqual([1, -2, 0.5]);
    expect(b.visits).toBe(1);
    expect(other.visits).toBe(0);
    expect([...other.value]).toEqual([0, 0, 0]);
  });

  it("uct prefers the higher mean for the seat to move and rewards rarely-tried children", () => {
    const good = createNode("g", 0, 2);
    const bad = createNode("b", 0, 2);
    backup([good], Float64Array.from([3, -3]));
    backup([bad], Float64Array.from([-3, 3]));
    good.avail = bad.avail = 10;
    expect(uct(good, 0, 0.8, 6)).toBeGreaterThan(uct(bad, 0, 0.8, 6));
    // Seat 1 sees it the other way round.
    expect(uct(bad, 1, 0.8, 6)).toBeGreaterThan(uct(good, 1, 0.8, 6));
    // The same mean with fewer visits scores higher (exploration).
    const rare = createNode("r", 0, 2);
    backup([rare], Float64Array.from([3, -3]));
    rare.avail = 10;
    backup([good], Float64Array.from([3, -3]));
    expect(uct(rare, 0, 0.8, 6)).toBeGreaterThan(uct(good, 0, 0.8, 6));
  });
});
