import type { Board } from "@boardgames/core/games/senso-battle-for-japan/types";
import { describe, expect, it } from "vitest";
import { type CubeMap, reconcileCubeIds } from "./cube-identity";

function board(rows: string[]): Board {
  const clan = { t: "takeda", u: "uesugi", o: "oda", m: "mori" } as const;
  return rows.map((row) =>
    [...row].map((ch) => (ch === "." ? null : clan[ch as keyof typeof clan])),
  );
}

function idAt(map: CubeMap, region: number, square: number): string | undefined {
  return [...map].find(([, p]) => p.region === region && p.square === square)?.[0];
}

const BASE = board(["tu.", "m.", "..", ".", "...", "..", "...", ".", "...", "..."]);

describe("reconcileCubeIds", () => {
  it("assigns fresh ids on the first frame and keeps them on an identical frame", () => {
    const first = reconcileCubeIds(null, BASE);
    expect(first.size).toBe(3);
    const again = reconcileCubeIds(first, BASE);
    expect([...again.keys()]).toEqual([...first.keys()]);
  });

  it("carries an id across a move between regions", () => {
    const first = reconcileCubeIds(null, BASE);
    const moved = reconcileCubeIds(
      first,
      board(["u..", "mt", "..", ".", "...", "..", "...", ".", "...", "..."]),
    );
    expect(idAt(moved, 1, 1)).toBe(idAt(first, 0, 0));
    expect(idAt(moved, 0, 0)).toBe(idAt(first, 0, 1));
    expect(moved.size).toBe(3);
  });

  it("carries ids through a swap and a gravity shift", () => {
    const first = reconcileCubeIds(null, BASE);
    const swapped = reconcileCubeIds(
      first,
      board(["ut.", "m.", "..", ".", "...", "..", "...", ".", "...", "..."]),
    );
    expect(idAt(swapped, 0, 1)).toBe(idAt(first, 0, 0));
    expect(idAt(swapped, 0, 0)).toBe(idAt(first, 0, 1));
    const struck = reconcileCubeIds(
      first,
      board(["u..", "m.", "..", ".", "...", "..", "...", ".", "...", "..."]),
    );
    expect(idAt(struck, 0, 0)).toBe(idAt(first, 0, 1));
    expect(struck.size).toBe(2);
  });

  it("mints a new id for a placed cube without touching the others", () => {
    const first = reconcileCubeIds(null, BASE);
    const placed = reconcileCubeIds(
      first,
      board(["tuo", "m.", "..", ".", "...", "..", "...", ".", "...", "..."]),
    );
    expect(placed.size).toBe(4);
    expect(idAt(placed, 0, 0)).toBe(idAt(first, 0, 0));
    expect(idAt(placed, 0, 2)).toMatch(/^oda#/);
  });
});
